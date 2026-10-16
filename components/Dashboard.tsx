"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { orgName } from "@/lib/org";

interface DashboardProps {
  profile: any;
  isAdmin: boolean;
  setActivePage?: (page: string) => void;
}

export default function Dashboard({ profile, isAdmin, setActivePage }: DashboardProps) {
  const [clients, setClients] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [calendar, setCalendar] = useState<any[]>([]);
  const [teamStatus, setTeamStatus] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [boardTasks, setBoardTasks] = useState<any[]>([]);
  const [shootMetrics, setShootMetrics] = useState({ upcomingCount: 0, totalVideos: 0 });
  const [invoices, setInvoices] = useState<any[]>([]);
  const [finBalances, setFinBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [taskTab, setTaskTab] = useState<"today" | "all">("today");
  const [boardTaskTab, setBoardTaskTab] = useState("all");
  const timerRef = useRef<any>(null);

  useEffect(() => {
    fetchAll();
    fetchTeamStatus();
    fetchShootPlannerMetrics();

    const channel = supabase
      .channel("dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => fetchTeamStatus())
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "board_tasks" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "videos" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "content_calendar" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "balances" }, () => fetchAll())
      .subscribe();

    timerRef.current = setInterval(() => setTick(t => t + 1), 1000);
    // Fallback poll every 2 min in case realtime WebSocket drops
    const poll = setInterval(() => { fetchAll(); fetchTeamStatus(); }, 2 * 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(timerRef.current);
      clearInterval(poll);
    };
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const todayStr = new Date().toISOString().split("T")[0];
    const [{ data: c }, { data: t }, { data: v }, { data: cal }, { data: l }, { data: m }, { data: bt }, { data: inv }, { data: bal }] = await Promise.all([
      supabase.from("clients").select("*").eq("status", "Active"),
      supabase.from("tasks").select("*"),
      supabase.from("videos").select("*").eq("month", new Date().toLocaleString("en", { month: "long", year: "numeric" })),
      supabase.from("content_calendar").select("*").eq("scheduled_date", todayStr).order("client", { ascending: true }),
      supabase.from("leads").select("*").order("created_at", { ascending: false }),
      supabase.from("meetings").select("*").order("date", { ascending: true }),
      supabase.from("board_tasks").select("*").neq("column_id", "backlog"),
      supabase.from("invoices").select("id, invoice_no, customer_name, total, status, due_date, invoice_date").order("created_at", { ascending: false }),
      supabase.from("balances").select("account, amount"),
    ]);
    if (c) setClients(c);
    if (t) setTasks(t);
    if (v) setVideos(v);
    if (cal) setCalendar(cal);
    if (l) setLeads(l);
    if (m) setMeetings(m);
    if (bt) setBoardTasks(bt);
    if (inv) setInvoices(inv);
    if (bal) {
      const map: Record<string, number> = {};
      bal.forEach((b: any) => { map[b.account] = b.amount; });
      setFinBalances(map);
    }
    setLoading(false);
  };

  const fetchTeamStatus = async () => {
    const today = new Date().toISOString().split("T")[0];
    const [{ data: att }, { data: prof }] = await Promise.all([
      supabase.from("attendance").select("*, profiles(id, name, role, color)").eq("date", today),
      supabase.from("profiles").select("id, name, role, color").neq("role", "admin").neq("status", "left"),
    ]);
    if (!prof) return;
    setTeamStatus(prof.map(p => ({ ...p, attendance: att?.find((a: any) => a.user_id === p.id) || null })));
  };

  const fetchShootPlannerMetrics = async () => {
    try {
      const todayStr = new Date().toISOString().split("T")[0];
      const { data: shoots } = await supabase
        .from("shoot_plans")
        .select("video_count")
        .gte("shoot_date", todayStr)
        .not("status", "in", '("Done","Cancelled")');
      if (shoots) {
        const total = shoots.reduce((sum: number, s: any) => sum + (s.video_count || 0), 0);
        setShootMetrics({ upcomingCount: shoots.length, totalVideos: total });
      }
    } catch (e) { console.error("shoot_plans metrics:", e); }
  };

  const updateTaskStatus = async (id: string, status: string) => {
    await supabase.from("tasks").update({ status, done: status === "Done" }).eq("id", id);
    fetchAll();
  };

  const totalRetainer = clients.reduce((a, b) => a + (b.retainer || 0), 0);
  const openTasks = tasks.filter(t => !t.done);
  const overdueTasks = tasks.filter(t => t.status === "Overdue");
  const inProgressTasks = tasks.filter(t => t.status === "In Progress");
  const doneTasks = tasks.filter(t => t.done);
  const totalPlanned = videos.reduce((a, b) => a + (b.planned || 0), 0);
  const totalShot = videos.reduce((a, b) => a + (b.shot || 0), 0);
  const totalEdited = videos.reduce((a, b) => a + (b.edited || 0), 0);
  const totalApproval = videos.reduce((a, b) => a + (b.approval || 0), 0);
  const totalPosted = videos.reduce((a, b) => a + (b.posted || 0), 0);
  const topClients = [...clients].sort((a, b) => b.retainer - a.retainer).slice(0, 4);

  const todayStr = new Date().toISOString().split("T")[0];
  const todayTasks = tasks.filter(t => t.due === todayStr || (!t.done && t.due && t.due <= todayStr)).sort((a, b) => (a.due || "").localeCompare(b.due || ""));
  const allTasksSorted = [...tasks].sort((a, b) => (a.due || "").localeCompare(b.due || "")).slice(0, 8);
  const displayedTasks = taskTab === "today" ? todayTasks : allTasksSorted;
  const filteredDashBoardTasks = boardTaskTab === "all" ? boardTasks : boardTasks.filter(t => t.column_id === boardTaskTab);

  const activeLeads = leads.filter(l => !["Converted", "Lost"].includes(l.status));
  const callLeads = leads.filter(l => l.status === "Call").length;
  const gmeetLeads = leads.filter(l => l.status === "Gmeet").length;
  const meetingLeads = leads.filter(l => l.status === "Meeting").length;

  const todayMeetings = meetings.filter(m => m.date === todayStr);
  const upcomingMeetings = meetings.filter(m => m.date >= todayStr && m.status === "Scheduled").slice(0, 5);
  const followUps = leads.filter(l => l.follow_up_date && l.follow_up_date >= todayStr).sort((a, b) => a.follow_up_date.localeCompare(b.follow_up_date)).slice(0, 4);

  // ── Invoice / Finance stats ───────────────────────────────────────────────
  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const collectedThisMonth = invoices.filter(i => i.status === "paid" && i.invoice_date?.startsWith(thisMonth)).reduce((a, b) => a + b.total, 0);
  const pendingInvoices = invoices.filter(i => i.status === "sent" || i.status === "draft");
  const pendingAmount = pendingInvoices.filter(i => i.status === "sent").reduce((a, b) => a + b.total, 0);
  const overdueInvoices = invoices.filter(i => i.status === "sent" && i.due_date && new Date(i.due_date) < new Date());
  const totalBankBalance = Object.values(finBalances).reduce((a, b) => a + b, 0);

  const colorMap: Record<string, string> = {};
  const priorityStyle: Record<string, { color: string; bg: string }> = {
    High: { color: "#f87171", bg: "rgba(239,68,68,0.15)" },
    Medium: { color: "#fbbf24", bg: "rgba(245,158,11,0.15)" },
    Low: { color: "#4ade80", bg: "rgba(16,185,129,0.15)" },
  };
  const calStatusStyle: Record<string, { color: string; bg: string; label: string }> = {
    planned:  { color: "#60a5fa", bg: "rgba(59,130,246,0.15)",  label: "Planned"  },
    scripted: { color: "#a78bfa", bg: "rgba(139,92,246,0.15)",  label: "Scripted" },
    shot:     { color: "#fbbf24", bg: "rgba(245,158,11,0.15)",  label: "Shot"     },
    editing:  { color: "#fb923c", bg: "rgba(249,115,22,0.15)",  label: "Editing"  },
    review:   { color: "#f472b6", bg: "rgba(236,72,153,0.15)",  label: "In Review"},
    approved: { color: "#4ade80", bg: "rgba(16,185,129,0.15)",  label: "Approved" },
    posted:   { color: "#34d399", bg: "rgba(16,185,129,0.2)",   label: "Posted"   },
  };
  const platformIcon: Record<string, string> = {
    Instagram: "ti-brand-instagram", YouTube: "ti-brand-youtube", LinkedIn: "ti-brand-linkedin",
    TikTok: "ti-brand-tiktok", Twitter: "ti-brand-twitter", Facebook: "ti-brand-facebook",
  };

  const getMemberStatus = (att: any) => {
    if (!att?.clock_in) return "absent";
    if (att.clock_out) return "done";
    if (att.on_shoot) return "shoot";
    if (att.break_start && !att.break_end) return "break";
    if ((att.breaks || []).find((b: any) => b.start && !b.end)) return "break";
    return "active";
  };

  const fmtDuration = (clockIn: string, breakMins: number) => {
    const secs = Math.max(0, Math.floor((Date.now() - new Date(clockIn).getTime()) / 1000) - breakMins * 60);
    const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const fmtWorked = (clockIn: string, clockOut: string, breakMins: number) => {
    const secs = Math.max(0, Math.floor((new Date(clockOut).getTime() - new Date(clockIn).getTime()) / 1000) - breakMins * 60);
    const h = Math.floor(secs / 3600); const m = Math.floor((secs % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const fmtTime = (iso: string) => iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "--";
  const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "--";
  const isOverdue = (d: string) => d ? new Date(d) < new Date() : false;

  const sc: Record<string, any> = {
    absent: { label: "Not In",   color: "rgba(255,255,255,0.3)", dot: "#444",    bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.06)" },
    active: { label: "In Office", color: "#4ade80",              dot: "#4ade80", bg: "rgba(74,222,128,0.06)",  border: "rgba(74,222,128,0.2)"   },
    shoot:  { label: "On Shoot",  color: "#a78bfa",              dot: "#a78bfa", bg: "rgba(167,139,250,0.06)", border: "rgba(167,139,250,0.2)"  },
    break:  { label: "On Break", color: "#fbbf24",               dot: "#fbbf24", bg: "rgba(251,191,36,0.06)",  border: "rgba(251,191,36,0.2)"   },
    done:   { label: "Done",     color: "#60a5fa",               dot: "#60a5fa", bg: "rgba(96,165,250,0.06)",  border: "rgba(96,165,250,0.2)"   },
  };

  const working  = teamStatus.filter(m => getMemberStatus(m.attendance) === "active").length;
  const onShoot  = teamStatus.filter(m => getMemberStatus(m.attendance) === "shoot").length;
  const onBreak  = teamStatus.filter(m => getMemberStatus(m.attendance) === "break").length;
  const absent   = teamStatus.filter(m => getMemberStatus(m.attendance) === "absent").length;

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "var(--text3)" }}>
        <i className="ti ti-loader" style={{ fontSize: 40, opacity: .4 }} />
        <div style={{ marginTop: 12, fontSize: 15 }}>Loading dashboard...</div>
      </div>
    </div>
  );

  return (
    <div className="page-wrap">

      {/* ── Header ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 30, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>
          Good morning, {profile?.name || "User"} 👋
        </div>
        <div style={{ fontSize: 15, color: "var(--text2)", marginTop: 6 }}>
          Here's what's happening at {orgName()} today.
        </div>
      </div>

      {/* ── Live Team Status ── */}
      <div style={{ borderRadius: 18, padding: 24, marginBottom: 28, background: "linear-gradient(145deg,#0f172a,#111827)", border: "1px solid rgba(255,255,255,0.06)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade80" }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: "-0.4px" }}>Team Status</div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>live</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[{ val: working, label: "In Office", color: "#4ade80" }, { val: onShoot, label: "On Shoot", color: "#a78bfa" }, { val: onBreak, label: "On Break", color: "#fbbf24" }, { val: absent, label: "Absent", color: "rgba(255,255,255,0.3)" }].map(s => (
              <div key={s.label} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: s.color }}>{s.val} {s.label}</div>
            ))}
          </div>
        </div>
        {teamStatus.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No team members found</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 12 }}>
            {teamStatus.map(member => {
              const att = member.attendance;
              const status = getMemberStatus(att);
              const s = sc[status];
              const av = member.color || colorMap[member.name] || "#6366f1";
              const bm = att?.total_break_minutes || 0;
              return (
                <div key={member.id} style={{ padding: "14px 16px", borderRadius: 14, background: s.bg, border: `1px solid ${s.border}`, transition: "all 0.3s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: av, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{member.name?.[0]}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{member.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot }} />
                        <span style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.label}</span>
                      </div>
                    </div>
                  </div>
                  {att?.clock_in ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>In</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#4ade80" }}>{fmtTime(att.clock_in)}</span>
                      </div>
                      {!att.clock_out && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{status === "break" ? "On break" : "Working"}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: status === "break" ? "#fbbf24" : "#fff" }}>{fmtDuration(att.clock_in, bm)}</span>
                        </div>
                      )}
                      {att.clock_out && (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Out</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: "#60a5fa" }}>{fmtTime(att.clock_out)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 5, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Total</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{fmtWorked(att.clock_in, att.clock_out, bm)}</span>
                          </div>
                        </>
                      )}
                      {bm > 0 && !att.clock_out && (
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Break</span>
                          <span style={{ fontSize: 11, color: "#fbbf24" }}>{bm}m</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", textAlign: "center", paddingTop: 4 }}>Not clocked in today</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Action Required Alert ── */}
      {(() => {
        const overdueTaskCount = overdueTasks.length;
        const overdueFollowUps = leads.filter(l => l.follow_up_date && new Date(l.follow_up_date) < new Date() && !["Converted","Lost"].includes(l.status)).length;
        const overdueContent = calendar.filter((c: any) => c.status !== "Posted" && c.status !== "Cancelled").length;
        if (overdueTaskCount === 0 && overdueFollowUps === 0 && overdueInvoices.length === 0) return null;
        return (
          <div style={{ borderRadius: 14, padding: "14px 20px", marginBottom: 20, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.25)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(248,113,113,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: "#f87171" }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#f87171" }}>Action Required</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", flex: 1 }}>
              {overdueTaskCount > 0 && (
                <button onClick={() => setActivePage?.("tasks")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 12 }} /> {overdueTaskCount} overdue task{overdueTaskCount > 1 ? "s" : ""}
                </button>
              )}
              {overdueFollowUps > 0 && (
                <button onClick={() => setActivePage?.("leads")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  <i className="ti ti-bell" style={{ fontSize: 12 }} /> {overdueFollowUps} overdue follow-up{overdueFollowUps > 1 ? "s" : ""}
                </button>
              )}
              {overdueContent > 0 && (
                <button onClick={() => setActivePage?.("calendar")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)", color: "#a78bfa", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  <i className="ti ti-calendar" style={{ fontSize: 12 }} /> {overdueContent} content due today
                </button>
              )}
              {overdueInvoices.length > 0 && (
                <button onClick={() => setActivePage?.("finance")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 20, background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", color: "#fbbf24", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  <i className="ti ti-file-invoice" style={{ fontSize: 12 }} /> {overdueInvoices.length} invoice{overdueInvoices.length > 1 ? "s" : ""} overdue
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Main Stats ── */}
      <div className="stat-grid-4">
        {[
          { val: clients.length, label: "Active Clients",   icon: "ti-building-store", sub: "Brands on retainer",           gradient: "linear-gradient(135deg,#6366f1,#6d5dfc)", glow: "rgba(99,102,241,0.35)"  },
          { val: `₹${(totalRetainer/100000).toFixed(1)}L`, label: "Monthly Retainer", icon: "ti-cash", sub: `₹${totalRetainer.toLocaleString("en-IN")}/mo`, gradient: "linear-gradient(135deg,#10b981,#34d399)", glow: "rgba(16,185,129,0.35)"  },
          { val: openTasks.length,     label: "Open Tasks",       icon: "ti-checkbox",       sub: `${overdueTasks.length} overdue`,     gradient: "linear-gradient(135deg,#f59e0b,#fbbf24)", glow: "rgba(245,158,11,0.35)"  },
          { val: totalPosted,          label: "Videos Posted",    icon: "ti-video",           sub: `${totalPlanned} planned`,           gradient: "linear-gradient(135deg,#3b82f6,#60a5fa)", glow: "rgba(59,130,246,0.35)"  },
        ].map((s, i) => (
          <div key={i} style={{ borderRadius: 18, padding: "22px 22px 20px", background: s.gradient, boxShadow: `0 8px 32px ${s.glow}`, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -24, right: -24, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.1)", pointerEvents: "none" }} />
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ width: 44, height: 44, borderRadius: 13, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className={`ti ${s.icon}`} style={{ color: "#fff", fontSize: 21 }} />
              </div>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", background: "rgba(255,255,255,0.18)", padding: "3px 10px", borderRadius: 20, fontWeight: 500 }}>{s.sub}</span>
            </div>
            <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", marginTop: 7, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Finance Overview ── */}
      {invoices.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Collected This Month", val: `₹${(collectedThisMonth/1000).toFixed(1)}k`, sub: collectedThisMonth === 0 ? "No paid invoices yet" : `₹${collectedThisMonth.toLocaleString("en-IN")}`, icon: "ti-circle-check", color: "#4ade80", glow: "rgba(74,222,128,0.15)", border: "rgba(74,222,128,0.2)" },
            { label: "Pending Collection",   val: `₹${(pendingAmount/1000).toFixed(1)}k`,      sub: `${pendingInvoices.filter(i => i.status === "sent").length} sent invoice${pendingInvoices.filter(i=>i.status==="sent").length!==1?"s":""}`, icon: "ti-clock-hour-4", color: "#60a5fa", glow: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.2)" },
            { label: "Overdue Invoices",     val: overdueInvoices.length,                      sub: overdueInvoices.length ? `₹${overdueInvoices.reduce((a,b)=>a+b.total,0).toLocaleString("en-IN")} pending` : "All on time", icon: "ti-alert-circle", color: overdueInvoices.length ? "#f87171" : "#4ade80", glow: overdueInvoices.length ? "rgba(248,113,113,0.12)" : "rgba(74,222,128,0.1)", border: overdueInvoices.length ? "rgba(248,113,113,0.25)" : "rgba(74,222,128,0.2)" },
            { label: "Total Bank Balance",   val: `₹${(totalBankBalance/100000).toFixed(2)}L`, sub: `₹${totalBankBalance.toLocaleString("en-IN")} across all accounts`, icon: "ti-building-bank", color: "#a78bfa", glow: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.2)" },
          ].map((s, i) => (
            <div key={i} onClick={() => setActivePage?.("finance")} className="stat-card" style={{ padding: "18px 20px", cursor: "pointer", border: `1px solid ${s.border}`, background: s.glow, transition: "all .15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: `${s.color}20`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 16 }} />
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", fontWeight: 600 }}>{s.label}</div>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: "-0.5px" }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Task Quick Stats ── */}
      <div className="stat-grid-4">
        {[
          { label: "In Progress", val: inProgressTasks.length, gradient: "linear-gradient(135deg,#3b82f6,#60a5fa)", icon: "ti-loader"       },
          { label: "Overdue",     val: overdueTasks.length,    gradient: "linear-gradient(135deg,#ef4444,#f87171)", icon: "ti-alert-circle" },
          { label: "Completed",   val: doneTasks.length,       gradient: "linear-gradient(135deg,#10b981,#34d399)", icon: "ti-circle-check" },
          { label: "Total Tasks", val: tasks.length,           gradient: "linear-gradient(135deg,#8b5cf6,#a78bfa)", icon: "ti-list"         },
        ].map((q, i) => (
          <div key={i} style={{ borderRadius: 14, padding: "18px 20px", background: q.gradient, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 14, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", bottom: -14, right: -14, width: 70, height: 70, borderRadius: "50%", background: "rgba(255,255,255,0.1)", pointerEvents: "none" }} />
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${q.icon}`} style={{ color: "#fff", fontSize: 19 }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>{q.val}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2, fontWeight: 500 }}>{q.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Shoot Planner Hero ── */}
      {(isAdmin || profile?.permissions?.shootplanner) && (
        <div
          onClick={() => setActivePage?.("shootplanner")}
          style={{
            borderRadius: 18, padding: "20px 24px", marginBottom: 20,
            background: "linear-gradient(135deg, rgba(249,115,22,0.15), rgba(251,146,60,0.05))",
            border: "1px solid rgba(249,115,22,0.25)", boxShadow: "0 8px 24px rgba(249,115,22,0.08)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: setActivePage ? "pointer" : "default",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg, #f97316, #fb923c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(249,115,22,0.4)" }}>
              <i className="ti ti-camera" style={{ fontSize: 22, color: "#fff" }} />
            </div>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: "-0.3px" }}>Production & Shoot Planner</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                {shootMetrics.upcomingCount} upcoming shoots · <strong style={{ color: "#fb923c" }}>{shootMetrics.totalVideos}</strong> video assets
              </div>
            </div>
          </div>
          {setActivePage && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#fb923c" }}>
              Manage Production <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
            </div>
          )}
        </div>
      )}

      {/* ── D2C Board Overview ── */}
      <div style={{ borderRadius: 18, padding: 26, position: "relative", overflow: "hidden", background: "linear-gradient(145deg,#0f172a,#0d0d28)", boxShadow: "0 8px 32px rgba(99,102,241,0.2)", marginBottom: 20 }}>
        <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(99,102,241,0.1)", pointerEvents: "none" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className="ti ti-layout-kanban" style={{ fontSize: 20, color: "#818cf8" }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>D2C Board</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 20, padding: 3, gap: 2 }}>
              {[{ id: "all", label: "All" }, { id: "task", label: "Task" }, { id: "inprogress", label: "In Progress" }, { id: "review", label: "Review" }].map(tab => (
                <button key={tab.id} onClick={() => setBoardTaskTab(tab.id)} style={{ padding: "4px 12px", borderRadius: 16, fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.2s", background: boardTaskTab === tab.id ? "rgba(99,102,241,0.5)" : "transparent", color: boardTaskTab === tab.id ? "#fff" : "rgba(255,255,255,0.4)", fontFamily: "inherit" }}>
                  {tab.label}
                </button>
              ))}
            </div>
            <span style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", fontSize: 12, padding: "4px 12px", borderRadius: 20, fontWeight: 600, border: "1px solid rgba(99,102,241,0.3)" }}>
              {filteredDashBoardTasks.length} open
            </span>
            {setActivePage && (
              <button onClick={() => setActivePage("board")} style={{ fontSize: 12, color: "#818cf8", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                Open Board <i className="ti ti-arrow-right" style={{ fontSize: 12 }} />
              </button>
            )}
          </div>
        </div>
        {filteredDashBoardTasks.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No open board tasks</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", maxHeight: 320, overflowY: "auto" }}>
            {filteredDashBoardTasks.slice(0, 10).map((t, i, arr) => {
              const COLS: Record<string, { label: string; color: string }> = {
                task:       { label: "Task",        color: "#60a5fa" },
                inprogress: { label: "In Progress", color: "#fbbf24" },
                review:     { label: "Review",      color: "#a78bfa" },
              };
              const col = COLS[t.column_id] || { label: t.column_id, color: "#94a3b8" };
              const P_COLORS: Record<string, string> = { High: "#ef4444", Medium: "#f59e0b", Low: "#10b981" };
              const pColor = P_COLORS[t.priority] || "rgba(255,255,255,0.3)";
              const assignees: string[] = t.assignee?.split(", ").filter(Boolean) || [];
              return (
                <div key={t.id} style={{ display: "grid", gridTemplateColumns: "8px 1fr auto", gap: 12, alignItems: "center", padding: "12px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: pColor, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{t.title}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {t.client && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{t.client}</span>}
                      {t.due && <span style={{ fontSize: 11, fontWeight: 600, color: isOverdue(t.due) ? "#f87171" : "rgba(255,255,255,0.4)" }}>{isOverdue(t.due) ? "⚠ " : ""}{formatDate(t.due)}</span>}
                      {assignees.slice(0, 3).map(name => (
                        <div key={name} title={name} style={{ width: 18, height: 18, borderRadius: 5, background: colorMap[name] || "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff" }}>{name[0]}</div>
                      ))}
                      {assignees.length > 3 && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>+{assignees.length - 3}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600, background: `${col.color}20`, color: col.color, border: `1px solid ${col.color}30`, whiteSpace: "nowrap", flexShrink: 0 }}>{col.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Leads & Meetings Hero Row ── */}
      <div className="layout-2col">
        {/* Leads summary */}
        <div
          onClick={() => setActivePage?.("leads")}
          style={{ borderRadius: 18, padding: "20px 24px", background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.05))", border: "1px solid rgba(99,102,241,0.25)", cursor: "pointer", position: "relative", overflow: "hidden" }}
        >
          <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(99,102,241,0.08)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(99,102,241,0.4)" }}>
              <i className="ti ti-user-search" style={{ fontSize: 20, color: "#fff" }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Leads</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{activeLeads.length} active · {leads.filter(l => l.status === "Converted").length} converted</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {[
              { label: "Call",    val: callLeads,    color: "#60a5fa" },
              { label: "Gmeet",   val: gmeetLeads,   color: "#a78bfa" },
              { label: "Meeting", val: meetingLeads, color: "#fbbf24" },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(99,102,241,0.8)", fontWeight: 600 }}>
            View all leads <i className="ti ti-chevron-right" style={{ fontSize: 12 }} />
          </div>
        </div>

        {/* Meetings summary */}
        <div
          onClick={() => setActivePage?.("meetings")}
          style={{ borderRadius: 18, padding: "20px 24px", background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.05))", border: "1px solid rgba(245,158,11,0.25)", cursor: "pointer", position: "relative", overflow: "hidden" }}
        >
          <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(245,158,11,0.08)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg,#f59e0b,#fbbf24)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(245,158,11,0.4)" }}>
              <i className="ti ti-calendar-event" style={{ fontSize: 20, color: "#fff" }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Meetings</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                {todayMeetings.length} today · {upcomingMeetings.length} upcoming
              </div>
            </div>
          </div>
          {todayMeetings.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text3)", padding: "10px 0" }}>No meetings today</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {todayMeetings.slice(0, 3).map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(255,255,255,0.04)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
                  <i className="ti ti-clock" style={{ fontSize: 12, color: "#fbbf24" }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", flex: 1 }}>{m.client_name}</span>
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>{m.reason?.slice(0, 20)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "rgba(245,158,11,0.8)", fontWeight: 600 }}>
            View all meetings <i className="ti ti-chevron-right" style={{ fontSize: 12 }} />
          </div>
        </div>
      </div>

      {/* ── Two-column: Video Pipeline + Tasks | Top Clients + Calendar ── */}
      <div className="layout-wide-narrow">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Video Pipeline */}
          <div style={{ borderRadius: 18, padding: 26, overflow: "hidden", position: "relative", background: "linear-gradient(145deg,#0f172a,#1e1b4b)", boxShadow: "0 8px 32px rgba(99,102,241,0.2)" }}>
            <div style={{ position: "absolute", top: -40, right: -40, width: 180, height: 180, borderRadius: "50%", background: "rgba(99,102,241,0.12)", pointerEvents: "none" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Video Pipeline</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{new Date().toLocaleString("en", { month: "long", year: "numeric" })} · All clients</div>
              </div>
              <span style={{ background: "rgba(99,102,241,0.25)", color: "#a5b4fc", fontSize: 12, padding: "4px 12px", borderRadius: 20, fontWeight: 600, border: "1px solid rgba(99,102,241,0.3)" }}>This Month</span>
            </div>
            {[
              { label: "Planned",  val: totalPlanned,  pct: 100,                                                                                    color: "rgba(255,255,255,0.15)", textColor: "rgba(255,255,255,0.5)" },
              { label: "Shot",     val: totalShot,     pct: totalPlanned > 0 ? Math.round(totalShot/totalPlanned*100)     : 0, color: "linear-gradient(90deg,#3b82f6,#60a5fa)", textColor: "#93c5fd"  },
              { label: "Edited",   val: totalEdited,   pct: totalPlanned > 0 ? Math.round(totalEdited/totalPlanned*100)   : 0, color: "linear-gradient(90deg,#6366f1,#6d5dfc)", textColor: "#c4b5fd"  },
              { label: "Approved", val: totalApproval, pct: totalPlanned > 0 ? Math.round(totalApproval/totalPlanned*100) : 0, color: "linear-gradient(90deg,#f59e0b,#fbbf24)", textColor: "#fcd34d"  },
              { label: "Posted",   val: totalPosted,   pct: totalPlanned > 0 ? Math.round(totalPosted/totalPlanned*100)   : 0, color: "linear-gradient(90deg,#10b981,#34d399)", textColor: "#6ee7b7"  },
            ].map((p, i) => (
              <div key={i} style={{ marginBottom: i < 4 ? 18 : 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{p.label}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 11, color: p.textColor, fontWeight: 600 }}>{p.pct}%</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{p.val}</span>
                  </div>
                </div>
                <div style={{ height: 7, background: "rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden" }}>
                  <div style={{ width: `${p.pct}%`, height: "100%", background: p.color, borderRadius: 6 }} />
                </div>
              </div>
            ))}
          </div>

          {/* Tasks */}
          <div style={{ borderRadius: 18, padding: 26, position: "relative", overflow: "hidden", background: "linear-gradient(145deg,#0f172a,#1a0f2e)", boxShadow: "0 8px 32px rgba(139,92,246,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>{taskTab === "today" ? "Today's Tasks" : "All Tasks"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 20, padding: 3, gap: 2 }}>
                  {(["today", "all"] as const).map(tab => (
                    <button key={tab} onClick={() => setTaskTab(tab)} style={{ padding: "4px 14px", borderRadius: 16, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.2s", background: taskTab === tab ? "rgba(139,92,246,0.5)" : "transparent", color: taskTab === tab ? "#fff" : "rgba(255,255,255,0.4)" }}>
                      {tab === "today" ? "Today" : "All"}
                    </button>
                  ))}
                </div>
                <span style={{ background: "rgba(139,92,246,0.2)", color: "#c4b5fd", fontSize: 12, padding: "4px 12px", borderRadius: 20, fontWeight: 600, border: "1px solid rgba(139,92,246,0.3)" }}>
                  {taskTab === "today" ? todayTasks.length : openTasks.length} {taskTab === "today" ? "tasks" : "open"}
                </span>
              </div>
            </div>
            {displayedTasks.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>{taskTab === "today" ? "No tasks due today 🎉" : "No tasks yet"}</div>
            ) : displayedTasks.map((t, i) => (
              <div key={t.id} style={{ display: "grid", gridTemplateColumns: "8px 1fr auto", gap: 12, alignItems: "center", padding: "13px 0", borderBottom: i < displayedTasks.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: priorityStyle[t.priority]?.color || "rgba(255,255,255,0.3)" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.done ? "rgba(255,255,255,0.3)" : "#fff", textDecoration: t.done ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{t.title}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{t.client}</span>
                    {t.due && <span style={{ fontSize: 11, fontWeight: 600, color: isOverdue(t.due) && !t.done ? "#f87171" : "rgba(255,255,255,0.4)" }}>{isOverdue(t.due) && !t.done ? "⚠ " : ""}{formatDate(t.due)}</span>}
                    {t.assignee && <div style={{ width: 20, height: 20, borderRadius: 6, background: colorMap[t.assignee] || "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>{t.assignee?.[0]}</div>}
                  </div>
                </div>
                <select value={t.status || "To Do"} onChange={e => updateTaskStatus(t.id, e.target.value)}
                  style={{ background: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 11, padding: "4px 8px", borderRadius: 20, fontWeight: 600, border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", outline: "none", fontFamily: "inherit", flexShrink: 0, appearance: "none" as any }}>
                  {["To Do", "In Progress", "Review", "Done", "Overdue"].map(s => <option key={s} value={s} style={{ background: "#1a1a2e" }}>{s}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Top Clients */}
          <div style={{ borderRadius: 18, padding: 26, position: "relative", overflow: "hidden", background: "linear-gradient(145deg,#0f172a,#0d1f1a)", boxShadow: "0 8px 32px rgba(16,185,129,0.18)" }}>
            <div style={{ marginBottom: 22 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Top Clients</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>By retainer value</div>
            </div>
            {topClients.map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < topClients.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: `${c.color}20`, border: `1px solid ${c.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: c.color }}>{c.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{c.industry}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#34d399", background: "rgba(16,185,129,0.12)", padding: "4px 10px", borderRadius: 10, border: "1px solid rgba(16,185,129,0.2)" }}>₹{(c.retainer / 1000).toFixed(0)}K</div>
              </div>
            ))}
            {totalRetainer > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Total MRR</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#34d399" }}>₹{totalRetainer.toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>

          {/* Upcoming Meetings */}
          <div
            style={{ borderRadius: 18, padding: 26, position: "relative", overflow: "hidden", background: "linear-gradient(145deg,#0f172a,#1a1400)", boxShadow: "0 8px 32px rgba(245,158,11,0.12)", cursor: "pointer" }}
            onClick={() => setActivePage?.("meetings")}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Upcoming Meetings</div>
              <span style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", fontSize: 12, padding: "4px 12px", borderRadius: 20, fontWeight: 600, border: "1px solid rgba(245,158,11,0.3)" }}>{upcomingMeetings.length}</span>
            </div>
            {upcomingMeetings.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No upcoming meetings</div>
            ) : upcomingMeetings.map((m, i) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < upcomingMeetings.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                <div style={{ textAlign: "center", minWidth: 40, flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: m.date === todayStr ? "#fbbf24" : "#fff", lineHeight: 1 }}>{new Date(m.date).getDate()}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{new Date(m.date).toLocaleString("en", { month: "short" })}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.client_name}</div>
                  {m.reason && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.reason}</div>}
                </div>
                {m.date === todayStr && <span style={{ fontSize: 9, background: "#fbbf24", color: "#000", borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>TODAY</span>}
              </div>
            ))}
          </div>

          {/* Follow-ups */}
          {followUps.length > 0 && (
            <div
              style={{ borderRadius: 18, padding: 26, background: "linear-gradient(145deg,#0f172a,#0a1a1f)", border: "1px solid rgba(96,165,250,0.15)", boxShadow: "0 8px 32px rgba(59,130,246,0.1)", cursor: "pointer" }}
              onClick={() => setActivePage?.("leads")}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Follow-ups Due</div>
                <span style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", fontSize: 12, padding: "4px 12px", borderRadius: 20, fontWeight: 600, border: "1px solid rgba(96,165,250,0.3)" }}>{followUps.length}</span>
              </div>
              {followUps.map((l, i) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: i < followUps.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <i className="ti ti-bell" style={{ fontSize: 13, color: isOverdue(l.follow_up_date) ? "#f87171" : "#60a5fa", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.brand_name || l.name}</div>
                    {l.follow_up_note && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>{l.follow_up_note}</div>}
                  </div>
                  <span style={{ fontSize: 11, color: isOverdue(l.follow_up_date) ? "#f87171" : "#60a5fa", fontWeight: 600, flexShrink: 0 }}>{formatDate(l.follow_up_date)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Content Calendar */}
          <div style={{ borderRadius: 18, padding: 26, position: "relative", overflow: "hidden", background: "linear-gradient(145deg,#0f172a,#1a0e1f)", boxShadow: "0 8px 32px rgba(236,72,153,0.15)", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>Content Calendar</div>
              <span style={{ background: "rgba(236,72,153,0.2)", color: "#f9a8d4", fontSize: 12, padding: "4px 12px", borderRadius: 20, fontWeight: 600, border: "1px solid rgba(236,72,153,0.3)" }}>{calendar.length} today</span>
            </div>
            {calendar.length === 0 ? (
              <div style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.3)", fontSize: 13 }}>No content scheduled today</div>
            ) : calendar.map((item, i) => {
              const st = calStatusStyle[item.status] || calStatusStyle["planned"];
              const icon = platformIcon[item.platform] || "ti-device-mobile";
              return (
                <div key={item.id || i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "12px 0", borderBottom: i < calendar.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className={`ti ${icon}`} style={{ fontSize: 16, color: "rgba(255,255,255,0.5)" }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{item.title || "Untitled"}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{item.client} · {item.platform}</div>
                  </div>
                  <span style={{ background: st.bg, color: st.color, fontSize: 10, padding: "3px 9px", borderRadius: 20, fontWeight: 700, border: `1px solid ${st.color}40`, whiteSpace: "nowrap" }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}