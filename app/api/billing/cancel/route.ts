import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, jsonError } from "@/lib/server";
import { rzp } from "@/lib/razorpay";

// Cancels at the end of the current billing cycle; the workspace keeps working until then.
export async function POST(req: NextRequest) {
  const ctx = await requireOrgAdmin(req);
  if ("error" in ctx) return ctx.error;
  const { admin, org } = ctx;
  if (!org.razorpay_subscription_id) return jsonError("No active subscription");

  try {
    await rzp(`/subscriptions/${org.razorpay_subscription_id}/cancel`, { cancel_at_cycle_end: 1 });
  } catch (e: any) {
    return jsonError(e.message, 502);
  }
  await admin.from("organizations").update({ status: "cancelled" }).eq("id", org.id);
  return NextResponse.json({ ok: true });
}
