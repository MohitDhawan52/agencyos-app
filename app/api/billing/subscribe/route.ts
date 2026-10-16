import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, jsonError } from "@/lib/server";
import { PLANS, PlanId } from "@/lib/plans";
import { rzp, razorpayPlanId } from "@/lib/razorpay";

// Starts a Razorpay subscription for the chosen plan. The browser then opens
// Razorpay Checkout with the returned subscription id.
export async function POST(req: NextRequest) {
  const ctx = await requireOrgAdmin(req);
  if ("error" in ctx) return ctx.error;
  const { admin, org, user } = ctx;

  const { plan } = await req.json();
  if (!(plan in PLANS)) return jsonError("Unknown plan");
  const rzpPlan = razorpayPlanId(plan as PlanId);
  if (!rzpPlan) return jsonError("Billing for this plan is not configured yet. Please contact support.", 500);

  // Downgrading below current usage would immediately break the workspace.
  const { count: activeMembers } = await admin.from("profiles").select("id", { count: "exact", head: true })
    .eq("org_id", org.id).neq("status", "left");
  if ((activeMembers || 0) > PLANS[plan as PlanId].teamLimit) {
    return jsonError(`You have ${activeMembers} active team members. The ${PLANS[plan as PlanId].name} plan allows ${PLANS[plan as PlanId].teamLimit}. Mark some members as "left" first.`);
  }

  try {
    const sub = await rzp("/subscriptions", {
      plan_id: rzpPlan,
      total_count: 120,
      quantity: 1,
      customer_notify: 1,
      notes: { org_id: org.id, plan, email: user.email || "" },
    });
    await admin.from("organizations").update({ pending_subscription_id: sub.id, pending_plan: plan }).eq("id", org.id);
    return NextResponse.json({ subscriptionId: sub.id, keyId: process.env.RAZORPAY_KEY_ID, email: user.email, orgName: org.name });
  } catch (e: any) {
    return jsonError(e.message, 502);
  }
}
