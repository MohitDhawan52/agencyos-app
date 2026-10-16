import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, jsonError } from "@/lib/server";
import { planAllowsPage } from "@/lib/plans";

// Creates a login for one of the agency's clients (content approval portal).
export async function POST(req: NextRequest) {
  const ctx = await requireOrgAdmin(req);
  if ("error" in ctx) return ctx.error;
  const { admin, org } = ctx;
  if (!planAllowsPage(org.plan, "clientportal")) return jsonError("The client portal is not included in your plan.", 403);

  const { email, password, client_name, contact_name } = await req.json();
  if (!email || !password || !client_name) return jsonError("Client, email and password are required.");

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: String(email).trim().toLowerCase(),
    password,
    email_confirm: true,
  });
  if (authError) return jsonError(authError.message);

  const { error } = await admin.from("client_profiles").insert({
    id: created.user.id,
    org_id: org.id,
    client_name,
    contact_name: contact_name || "",
    email: String(email).trim().toLowerCase(),
  });
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id);
    return jsonError(error.message);
  }
  return NextResponse.json({ userId: created.user.id });
}
