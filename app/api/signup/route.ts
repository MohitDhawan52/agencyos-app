import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminClient, jsonError, ALL_PERMISSIONS } from "@/lib/server";
import { PLANS, TRIAL_DAYS, PlanId } from "@/lib/plans";

const SIGNUPS_PER_IP_PER_HOUR = 5;

const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";

// Creates a new agency workspace: auth user + organization + admin profile.
// The user must verify their email (Supabase sends the link) before they can log in.
export async function POST(req: NextRequest) {
  const { agencyName, name, email, password, plan, website } = await req.json().catch(() => ({}));
  const admin = adminClient();

  // Rate limit per IP (signup_attempts, see migration 0002). Fails closed if the table is missing.
  const ip = clientIp(req);
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count, error: rlError } = await admin.from("signup_attempts")
    .select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", hourAgo);
  if (rlError) return jsonError("Signup is temporarily unavailable. Please try again later.", 503);
  if ((count ?? 0) >= SIGNUPS_PER_IP_PER_HOUR) return jsonError("Too many signup attempts. Please try again in an hour.", 429);
  await admin.from("signup_attempts").insert({ ip });
  await admin.from("signup_attempts").delete().lt("created_at", new Date(Date.now() - 86400_000).toISOString());

  // Honeypot: real users never see the "website" field. Pretend success so bots learn nothing.
  if (website) return NextResponse.json({ ok: true, needsConfirm: true });

  if (!agencyName?.trim() || !name?.trim() || !email?.trim() || !password) {
    return jsonError("Agency name, your name, email and password are required.");
  }
  if (String(password).length < 8) return jsonError("Password must be at least 8 characters.");
  const planId: PlanId = (plan in PLANS ? plan : "starter") as PlanId;

  // Public signUp (not admin.createUser) so Supabase sends the confirmation email.
  const publicAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: created, error: authError } = await publicAuth.auth.signUp({
    email: String(email).trim().toLowerCase(),
    password,
    options: { data: { name: name.trim() }, emailRedirectTo: `${req.nextUrl.origin}/app` },
  });
  if (authError) return jsonError(authError.message);
  // An existing email comes back as a user with no identities (Supabase hides account existence).
  if (!created.user || !created.user.identities?.length) {
    return jsonError("An account with this email already exists. Please log in instead.");
  }
  const userId = created.user.id;
  // Repeat signup before confirming: Supabase re-sends the email for the same user; keep their workspace.
  const { data: existing } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (existing) return NextResponse.json({ ok: true, needsConfirm: true });

  const { data: org, error: orgError } = await admin.from("organizations").insert({
    name: agencyName.trim(),
    owner_id: userId,
    plan: planId,
    status: "trialing",
    trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
  }).select().single();
  if (orgError) {
    await admin.auth.admin.deleteUser(userId);
    return jsonError("Could not create workspace: " + orgError.message, 500);
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    org_id: org.id,
    name: name.trim(),
    email: String(email).trim().toLowerCase(),
    role: "admin",
    color: "#6d5dfc",
    permissions: ALL_PERMISSIONS,
    status: "active",
  });
  if (profileError) {
    await admin.from("organizations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(userId);
    return jsonError("Could not create profile: " + profileError.message, 500);
  }

  await admin.from("company_settings").insert({ org_id: org.id, company_name: agencyName.trim(), company_email: String(email).trim() });

  // No session means "Confirm email" is on and the user must click the link first.
  return NextResponse.json({ ok: true, needsConfirm: !created.session });
}
