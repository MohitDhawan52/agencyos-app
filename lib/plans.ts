// Plan catalogue. Team/task limits are also enforced in the database
// (plan_team_limit / plan_task_limit in the migration) — keep both in sync.
export type PlanId = "starter" | "growth" | "pro";

// Pages every plan gets.
const STARTER_PAGES = [
  "dashboard", "clients", "tasks", "board", "contentidea", "calendar", "postingtracker",
  "leads", "meetings", "attendance", "team", "permissions", "settings", "billing", "myprofile",
];
const GROWTH_PAGES = [
  ...STARTER_PAGES,
  "videos", "shootplanner", "creatives", "timesheet", "reports", "clientportal", "alerts", "activity",
];
const PRO_PAGES = [...GROWTH_PAGES, "finance", "hr", "agent"];

export const PLANS: Record<PlanId, {
  id: PlanId; name: string; price: number; teamLimit: number; taskLimit: number | null;
  pages: string[]; highlights: string[];
}> = {
  starter: {
    id: "starter", name: "Starter", price: 999, teamLimit: 5, taskLimit: 1000, pages: STARTER_PAGES,
    highlights: ["5 team members", "1,000 tasks / month", "Clients, tasks & boards", "Content calendar & ideas", "Leads & meetings", "Attendance"],
  },
  growth: {
    id: "growth", name: "Growth", price: 2500, teamLimit: 8, taskLimit: 3000, pages: GROWTH_PAGES,
    highlights: ["8 team members", "3,000 tasks / month", "Everything in Starter", "Client approval portal", "Video tracker & shoot planner", "Creatives, timesheets & reports"],
  },
  pro: {
    id: "pro", name: "Pro", price: 9999, teamLimit: 30, taskLimit: null, pages: PRO_PAGES,
    highlights: ["30 team members", "Unlimited tasks", "Full CRM access", "Finance & GST invoices", "HR, payroll & leave", "Morning briefing agent"],
  },
};

export const TRIAL_DAYS = 14;
// Days a paid workspace keeps working after a failed renewal.
export const GRACE_DAYS = 3;

export function planAllowsPage(plan: string | undefined, page: string) {
  const p = PLANS[(plan as PlanId) || "starter"] || PLANS.starter;
  return p.pages.includes(page);
}

export function isOrgActive(org: any): boolean {
  if (!org) return false;
  const now = Date.now();
  if (org.status === "suspended" || org.status === "cancelled") {
    // A cancelled subscription keeps working until the paid period ends.
    return org.status === "cancelled" && !!org.current_period_end && new Date(org.current_period_end).getTime() > now;
  }
  if (org.status === "trialing") return !!org.trial_ends_at && new Date(org.trial_ends_at).getTime() > now;
  if (!org.current_period_end) return org.status === "active";
  return new Date(org.current_period_end).getTime() + GRACE_DAYS * 86400000 > now;
}
