import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin, jsonError } from "@/lib/server";
import { PLANS, PlanId } from "@/lib/plans";

// Platform-owner console. Every action requires a user listed in platform_admins.
const BROWSABLE_TABLES = [
  "profiles", "client_profiles", "clients", "tasks", "board_tasks", "content_calendar", "content_ideas",
  "content_pillars", "creatives", "videos", "shoot_plans", "leads", "meetings", "attendance",
  "leave_requests", "leave_balance", "hr_profiles", "payouts", "timesheets", "transactions", "balances",
  "dasti_transactions", "invoices", "retainers", "company_settings", "messages", "alerts",
  "notifications", "task_comments", "client_assignments", "overtime", "payroll_overrides", "activity_logs",
];

const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString(); };

async function countBy(admin: any, table: string, since?: string) {
  let q = admin.from(table).select("org_id");
  if (since) q = q.gte("created_at", since);
  const { data } = await q.limit(100000);
  const m: Record<string, number> = {};
  (data || []).forEach((r: any) => { m[r.org_id] = (m[r.org_id] || 0) + 1; });
  return m;
}

export async function POST(req: NextRequest) {
  const ctx = await requirePlatformAdmin(req);
  if ("error" in ctx) return ctx.error;
  const { admin } = ctx;
  const body = await req.json();

  switch (body.action) {
    case "whoami":
      return NextResponse.json({ ok: true });

    case "overview": {
      const { data: orgs } = await admin.from("organizations").select("*").order("created_at", { ascending: false });
      const [members, clients, tasksMonth, boardMonth] = await Promise.all([
        countBy(admin, "profiles"), countBy(admin, "clients"),
        countBy(admin, "tasks", monthStart()), countBy(admin, "board_tasks", monthStart()),
      ]);
      const { data: owners } = await admin.from("profiles").select("id, name, email").in("id", (orgs || []).map(o => o.owner_id).filter(Boolean));
      const ownerMap = Object.fromEntries((owners || []).map(o => [o.id, o]));
      const rows = (orgs || []).map(o => ({
        ...o,
        owner: ownerMap[o.owner_id] || null,
        members: members[o.id] || 0,
        clients: clients[o.id] || 0,
        tasks_this_month: (tasksMonth[o.id] || 0) + (boardMonth[o.id] || 0),
      }));
      const { data: events } = await admin.from("billing_events").select("amount, created_at").not("amount", "is", null);
      const revenueThisMonth = (events || []).filter(e => e.created_at >= monthStart()).reduce((a, e) => a + Number(e.amount || 0), 0);
      const revenueAllTime = (events || []).reduce((a, e) => a + Number(e.amount || 0), 0);
      const mrr = rows.filter(o => o.status === "active").reduce((a, o) => a + (PLANS[o.plan as PlanId]?.price || 0), 0);
      return NextResponse.json({ orgs: rows, stats: { mrr, revenueThisMonth, revenueAllTime } });
    }

    case "org": {
      const { orgId } = body;
      const { data: org } = await admin.from("organizations").select("*").eq("id", orgId).single();
      if (!org) return jsonError("Not found", 404);
      const counts: Record<string, number> = {};
      await Promise.all(BROWSABLE_TABLES.map(async t => {
        const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq("org_id", orgId);
        counts[t] = count || 0;
      }));
      const { data: billing } = await admin.from("billing_events").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
      return NextResponse.json({ org, counts, billing: billing || [] });
    }

    case "table": {
      const { orgId, table, page = 0 } = body;
      if (!BROWSABLE_TABLES.includes(table)) return jsonError("Unknown table");
      const size = 50;
      const { data, count, error } = await admin.from(table).select("*", { count: "exact" })
        .eq("org_id", orgId).range(page * size, page * size + size - 1);
      if (error) return jsonError(error.message, 500);
      return NextResponse.json({ rows: data || [], total: count || 0, pageSize: size });
    }

    case "update-org": {
      const { orgId, plan, status, trial_ends_at, current_period_end } = body;
      const update: Record<string, any> = {};
      if (plan && plan in PLANS) update.plan = plan;
      if (status) update.status = status;
      if (trial_ends_at !== undefined) update.trial_ends_at = trial_ends_at;
      if (current_period_end !== undefined) update.current_period_end = current_period_end;
      const { error } = await admin.from("organizations").update(update).eq("id", orgId);
      if (error) return jsonError(error.message);
      await admin.from("billing_events").insert({ org_id: orgId, event: "admin.update", payload: update });
      return NextResponse.json({ ok: true });
    }

    default:
      return jsonError("Unknown action");
  }
}
