import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin, jsonError } from "@/lib/server";

export async function POST(req: NextRequest) {
  const ctx = await requireOrgAdmin(req);
  if ("error" in ctx) return ctx.error;
  const { admin, org, user } = ctx;

  const { userId } = await req.json();
  if (!userId) return jsonError("userId is required");
  if (userId === user.id) return jsonError("You can't delete your own account.");
  if (userId === org.owner_id) return jsonError("The workspace owner can't be deleted.");

  // Only allow deleting members of the caller's own workspace.
  const { data: target } = await admin.from("profiles").select("org_id").eq("id", userId).maybeSingle();
  if (!target || target.org_id !== org.id) return jsonError("Member not found", 404);

  await admin.from("profiles").delete().eq("id", userId);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return jsonError(error.message, 500);

  return NextResponse.json({ success: true });
}
