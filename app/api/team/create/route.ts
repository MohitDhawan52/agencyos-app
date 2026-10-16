import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, jsonError } from "@/lib/server";

export async function POST(req: NextRequest) {
  const ctx = await requireOrgAdmin(req);
  if ("error" in ctx) return ctx.error;
  const { admin, org } = ctx;

  const { email, password, name, role, color, phone, position, permissions } = await req.json();
  if (!email || !password || !name) return jsonError("email, password, and name are required");

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password,
    email_confirm: true,
  });
  if (authError) return jsonError(authError.message);

  const userId = created.user.id;

  // The team-size limit for the plan is enforced by a DB trigger on this insert.
  const { error: profileError } = await admin.from("profiles").insert([{
    id: userId,
    org_id: org.id,
    name,
    email: String(email).trim().toLowerCase(),
    role: role === "admin" ? "admin" : "member",
    color,
    phone: phone || "",
    position: position || "",
    permissions,
    status: "active",
  }]);

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    return jsonError(profileError.message.startsWith("Plan limit") ? profileError.message : "Profile save failed: " + profileError.message, 400);
  }

  return NextResponse.json({ userId });
}
