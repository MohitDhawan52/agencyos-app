// Minimal Razorpay REST client (server only) — no SDK dependency.
import crypto from "crypto";
import type { PlanId } from "./plans";

const RZP = "https://api.razorpay.com/v1";

function authHeader() {
  const id = process.env.RAZORPAY_KEY_ID, secret = process.env.RAZORPAY_KEY_SECRET;
  if (!id || !secret) throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

export function razorpayPlanId(plan: PlanId) {
  return {
    starter: process.env.RAZORPAY_PLAN_STARTER,
    growth: process.env.RAZORPAY_PLAN_GROWTH,
    pro: process.env.RAZORPAY_PLAN_PRO,
  }[plan];
}

export async function rzp(path: string, body?: any) {
  const res = await fetch(RZP + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.description || "Razorpay request failed");
  return json;
}

const safeEqual = (a: string, b: string) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string) {
  const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${paymentId}|${subscriptionId}`).digest("hex");
  return safeEqual(expected, signature || "");
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature || "");
}
