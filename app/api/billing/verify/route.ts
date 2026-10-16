import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, jsonError } from "@/lib/server";
import { rzp, verifyCheckoutSignature } from "@/lib/razorpay";

// Called by the browser right after Razorpay Checkout succeeds.
export async function POST(req: NextRequest) {
  const ctx = await requireOrgAdmin(req);
  if ("error" in ctx) return ctx.error;
  const { admin, org } = ctx;

  const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = await req.json();
  if (razorpay_subscription_id !== org.pending_subscription_id) return jsonError("Subscription mismatch");
  if (!verifyCheckoutSignature(razorpay_payment_id, razorpay_subscription_id, razorpay_signature)) {
    return jsonError("Payment signature invalid", 400);
  }

  let periodEnd = new Date(Date.now() + 31 * 86400000).toISOString();
  try {
    const sub = await rzp(`/subscriptions/${razorpay_subscription_id}`);
    if (sub.current_end) periodEnd = new Date(sub.current_end * 1000).toISOString();
  } catch {}

  // Switching plans: cancel the previous subscription so they aren't billed twice.
  const oldSub = org.razorpay_subscription_id;
  if (oldSub && oldSub !== razorpay_subscription_id) {
    try { await rzp(`/subscriptions/${oldSub}/cancel`, { cancel_at_cycle_end: 0 }); } catch {}
  }

  await admin.from("organizations").update({
    plan: org.pending_plan || org.plan,
    status: "active",
    razorpay_subscription_id,
    pending_subscription_id: null,
    pending_plan: null,
    current_period_end: periodEnd,
  }).eq("id", org.id);

  await admin.from("billing_events").insert({
    org_id: org.id, event: "checkout.success", payload: { razorpay_payment_id, razorpay_subscription_id, plan: org.pending_plan },
  });

  return NextResponse.json({ ok: true });
}
