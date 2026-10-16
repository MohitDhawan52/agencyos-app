import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/server";
import { verifyWebhookSignature } from "@/lib/razorpay";

// Razorpay → Dashboard → Webhooks: point to /api/billing/webhook with events
// subscription.activated, subscription.charged, subscription.halted,
// subscription.cancelled, subscription.completed, subscription.pending.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") || "")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const evt = JSON.parse(raw);
  const sub = evt.payload?.subscription?.entity;
  const payment = evt.payload?.payment?.entity;
  if (!sub) return NextResponse.json({ ok: true });

  const admin = adminClient();
  let { data: org } = await admin.from("organizations").select("*")
    .or(`razorpay_subscription_id.eq.${sub.id},pending_subscription_id.eq.${sub.id}`).maybeSingle();
  if (!org && sub.notes?.org_id) {
    ({ data: org } = await admin.from("organizations").select("*").eq("id", sub.notes.org_id).maybeSingle());
  }
  if (!org) return NextResponse.json({ ok: true });

  const periodEnd = sub.current_end ? new Date(sub.current_end * 1000).toISOString() : org.current_period_end;
  const update: Record<string, any> = {};

  switch (evt.event) {
    case "subscription.activated":
    case "subscription.charged":
      Object.assign(update, {
        status: "active",
        current_period_end: periodEnd,
        razorpay_subscription_id: sub.id,
        plan: sub.notes?.plan || org.plan,
      });
      if (org.pending_subscription_id === sub.id) Object.assign(update, { pending_subscription_id: null, pending_plan: null });
      break;
    case "subscription.pending":
    case "subscription.halted":
      if (org.razorpay_subscription_id === sub.id) update.status = "past_due";
      break;
    case "subscription.cancelled":
    case "subscription.completed":
      // Ignore cancellation of an old subscription after a plan switch.
      if (org.razorpay_subscription_id === sub.id) Object.assign(update, { status: "cancelled", current_period_end: periodEnd });
      break;
  }

  if (Object.keys(update).length) await admin.from("organizations").update(update).eq("id", org.id);
  await admin.from("billing_events").insert({
    org_id: org.id,
    event: evt.event,
    amount: payment?.amount ? payment.amount / 100 : null,
    payload: { subscription_id: sub.id, payment_id: payment?.id, status: sub.status, plan: sub.notes?.plan },
  });

  return NextResponse.json({ ok: true });
}
