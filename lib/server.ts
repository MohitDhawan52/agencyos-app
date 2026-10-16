// Server-only helpers for API routes. Never import from client components.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export function adminClient(): SupabaseClient {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("Server not configured (missing SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const jsonError = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Resolves the calling user from the "Authorization: Bearer <access token>" header.
export async function getCaller(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const admin = adminClient();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { user, profile, admin };
}

// Caller must be an admin of their workspace. Returns the org row too.
export async function requireOrgAdmin(req: NextRequest) {
  const caller = await getCaller(req);
  if (!caller?.profile) return { error: jsonError("Unauthorized", 401) } as const;
  if (caller.profile.role !== "admin") return { error: jsonError("Only workspace admins can do this", 403) } as const;
  const { data: org } = await caller.admin.from("organizations").select("*").eq("id", caller.profile.org_id).single();
  return { ...caller, org } as const;
}

// Caller must be listed in platform_admins (the SaaS owner).
export async function requirePlatformAdmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: jsonError("Unauthorized", 401) } as const;
  const admin = adminClient();
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return { error: jsonError("Unauthorized", 401) } as const;
  const { data } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) return { error: jsonError("Not found", 404) } as const;
  return { user, admin } as const;
}

export const ALL_PERMISSIONS = {
  clients: true, videos: true, tasks: true, board: true, contentidea: true, calendar: true,
  postingtracker: true, leads: true, meetings: true, shootplanner: true, timesheet: true, creatives: true,
};
