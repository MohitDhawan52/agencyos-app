import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, jsonError } from "@/lib/server";

export async function POST(req: NextRequest) {
  const ctx = await requireOrgAdmin(req);
  if ("error" in ctx) return ctx.error;
  const { admin, org } = ctx;

  const { id } = await req.json();
  const { data: target } = await admin.from("client_profiles").select("org_id").eq("id", id).maybeSingle();
  if (!target || target.org_id !== org.id) return jsonError("Client login not found", 404);

  await admin.from("client_profiles").delete().eq("id", id);
  await admin.auth.admin.deleteUser(id);
  return NextResponse.json({ success: true });
}
