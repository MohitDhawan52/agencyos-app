"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const priorityStyle: Record<string, { color: string; bg: string; border: string }> = {
  High:   { color: "var(--red)",    bg: "var(--red-bg)",    border: "var(--red-border)" },
  Medium: { color: "var(--amber)",  bg: "var(--amber-bg)",  border: "var(--amber-border)" },
  Low:    { color: "var(--green)",  bg: "var(--green-bg)",  border: "var(--green-border)" },
};

const statusStyle: Record<string, { color: string; bg: string }> = {
  "To Do":       { color: "var(--text2)",   bg: "rgba(255,255,255,0.05)" },
  "In Progress": { color: "var(--blue)",    bg: "var(--blue-bg)" },
  "Review":      { color: "var(--accent2)", bg: "var(--accent-bg)" },
  "Done":        { color: "var(--green)",   bg: "var(--green-bg)" },
  "Overdue":     { color: "var(--red)",     bg: "var(--red-bg)" },
};

const calStatusStyle: Record<string, { color: string; bg: string }> = {
  "Planned":       { color: "var(--text2)",   bg: "rgba(255,255,255,0.05)" },
  "In Production": { color: "var(--blue)",    bg: "var(--blue-bg)" },
  "Ready":         { color: "var(--accent2)", bg: "var(--accent-bg)" },
  "Scheduled":     { color: "var(--amber)",   bg: "var(--amber-bg)" },
  "Posted":        { color: "var(--green)",   bg: "var(--green-bg)" },
  "Cancelled":     { color: "var(--red)",     bg: "var(--red-bg)" },
};

const CAL_STATUS_OPTIONS = ["Planned", "In Production", "Ready", "Scheduled", "Posted", "Cancelled"];
const STATUS_OPTIONS = ["To Do", "In Progress", "Review", "Done", "Overdue"];
const CATEGORIES = ["Content Creation", "Client Call", "Editing", "Strategy", "Design", "Meta Ads", "Reporting", "Meeting", "Other"];
const categoryColor: Record<string, string> = {
  "Content Creation": "#5646e0", "Client Call": "#60a5fa", "Editing": "#f472b6",
  "Strategy": "#4ade80", "Design": "#fbbf24", "Meta Ads": "#f87171",
  "Reporting": "#34d399", "Meeting": "#a78bfa", "Other": "#94a3b8",
};

function fmtDuration(mins: number) {
  if (!mins) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const GREETINGS = [
  "Let's crush it today 💪", "Time to create something amazing ✨",
  "Ready to make an impact? 🚀", "Let's get to work 🎯",
  "Great to have you here 👊", "Make today count 🔥", "Another day, another win 🏆",
];

const emptyTimeForm = {
  task_title: "", client: "", category: "Content Creation",
  date: new Date().toISOString().split("T")[0],
  start_time: "", end_time: "", duration_mins: "", notes: "",
};

interface Props {
  profile: any;
  setActivePage?: (page: string) => void;
}

export default function MemberDashboard({ profile, setActivePage }: Props) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskTab, setTaskTab] = useState<"today" | "all">("today");
  const [boardTasks, setBoardTasks] = useState<any[]>([]);
  const [myCreatives, setMyCreatives] = useState<any[]>([]);

  // Timer
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Time log modal
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [timeForm, setTimeForm] = useState<any>(emptyTimeForm);
  const [editingTimeId, setEditingTimeId] = useState<string | null>(null);

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const greeting = GREETINGS[new Date().getDate() % GREETINGS.length];
  const todayStr = new Date().toISOString().split("T")[0];
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  useEffect(() => { if (profile?.name) fetchData(); }, [profile?.id]);

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: taskData }, { data: postData }, { data: tsData }, { data: clData }, { data: btData }, { data: cData }] = await Promise.all([
      // Order tasks by due date ascending
      supabase.from("tasks").select("id, title, description, status, done, due, priority, assignee, assignees, client")
        .order("due", { ascending: true, nullsFirst: false }),
      supabase.from("content_calendar").select("*")
        .contains("assignees", [profile.name])
        .order("scheduled_date", { ascending: true }),
      supabase.from("timesheets").select("*")
        .eq("member_name", profile.name)
        .order("date", { ascending: false }).limit(20),
      supabase.from("clients").select("id, name").eq("status", "Active").order("name"),
      supabase.from("board_tasks").select("*").neq("column_id", "done"),
      supabase.from("creatives").select("*").eq("creator_name", profile.name).order("created_at", { ascending: false }),
    ]);
    if (taskData) {
      const myTasks = taskData.filter((t: any) => {
        if (t.assignee === profile.name) return true;
        if (Array.isArray(t.assignees) && t.assignees.includes(profile.name)) return true;
        if (typeof t.assignees === "string" && t.assignees.includes(profile.name)) return true;
        return false;
      });
      setTasks(myTasks);
    }
    if (postData) setPosts(postData);
    if (tsData) setTimeEntries(tsData);
    if (clData) setClients(clData);
    if (btData) {
      const myBt = btData.filter((t: any) => t.assignee?.split(", ").filter(Boolean).includes(profile.name));
      setBoardTasks(myBt);
    }
    if (cData) setMyCreatives(cData);
    setLoading(false);
  };

  const updateTaskStatus = async (id: string, status: string) => {
    const done = status === "Done";
    await supabase.from("tasks").update({ status, done }).eq("id", id);
    fetchData();
  };

  const updatePostStatus = async (id: string, status: string) => {
    await supabase.from("content_calendar").update({ status }).eq("id", id);
    fetchData();
  };

  const timerDisplay = () => {
    const h = Math.floor(timerSeconds / 3600);
    const m = Math.floor((timerSeconds % 3600) / 60);
    const s = timerSeconds % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  const startTimer = () => {
    const now = new Date();
    setTimerSeconds(0);
    setTimerRunning(true);
    const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    setTimeForm({ ...emptyTimeForm, start_time: timeStr, date: now.toISOString().split("T")[0] });
    setEditingTimeId(null);
    setShowTimeModal(true);
  };

  const stopTimer = () => {
    const now = new Date();
    setTimerRunning(false);
    const timeStr = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
    const mins = Math.round(timerSeconds / 60);
    setTimeForm((f: any) => ({ ...f, end_time: timeStr, duration_mins: String(mins) }));
  };

  const calcDuration = (start: string, end: string) => {
    if (!start || !end) return "";
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? String(diff) : "";
  };

  const handleTimeChange = (field: "start_time" | "end_time", val: string) => {
    const updated = { ...timeForm, [field]: val };
    updated.duration_mins = calcDuration(
      field === "start_time" ? val : timeForm.start_time,
      field === "end_time" ? val : timeForm.end_time
    );
    setTimeForm(updated);
  };

  const saveTimeEntry = async () => {
    if (!timeForm.task_title?.trim()) return;
    const payload = {
      member_name: profile.name,
      client: timeForm.client || null,
      task_title: timeForm.task_title,
      category: timeForm.category,
      date: timeForm.date,
      start_time: timeForm.start_time || null,
      end_time: timeForm.end_time || null,
      duration_mins: Number(timeForm.duration_mins) || 0,
      notes: timeForm.notes || null,
    };
    const { error } = editingTimeId
      ? await supabase.from("timesheets").update(payload).eq("id", editingTimeId)
      : await supabase.from("timesheets").insert([payload]);
    if (error) { alert("Failed to save timesheet entry. Please try again."); return; }
    setShowTimeModal(false);
    setTimerRunning(false);
    setTimerSeconds(0);
    fetchData();
  };

  const deleteTimeEntry = async (id: string) => {
    await supabase.from("timesheets").delete().eq("id", id);
    fetchData();
  };

  const openEditTime = (e: any) => { setEditingTimeId(e.id); setTimeForm({ ...e }); setShowTimeModal(true); };
  const openAddTime = () => { setEditingTimeId(null); setTimeForm(emptyTimeForm); setShowTimeModal(true); };

  // ── Task lists ─────────────────────────────────────────────────────────────
  const todayTasks = tasks.filter(t =>
    t.due === todayStr || (!t.done && t.due && t.due < todayStr)
  );
  const allTasks = tasks;
  const displayTasks = taskTab === "today" ? todayTasks : allTasks;

  // Stats
  const openTasks = tasks.filter(t => !t.done);
  const doneTasks = tasks.filter(t => t.done);
  const todayPosts = posts.filter(p => p.scheduled_date === todayStr);
  const upcomingPosts = posts.filter(p => p.status !== "Posted" && p.scheduled_date >= todayStr);
  const todayMins = timeEntries.filter(e => e.date === todayStr).reduce((a, b) => a + (b.duration_mins || 0), 0);
  const weekMins = timeEntries.filter(e => {
    const d = new Date(e.date); const now = new Date();
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());
    return d >= startOfWeek;
  }).reduce((a, b) => a + (b.duration_mins || 0), 0);

  const IS = { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 14, outline: "none" };
  const LS = { fontSize: 11, fontWeight: 600 as const, color: "var(--text3)", display: "block" as const, marginBottom: 7, textTransform: "uppercase" as const, letterSpacing: ".6px" };

  const formatDue = (due: string) => {
    if (!due) return null;
    const d = new Date(due);
    const today = new Date();
    const diff = Math.floor((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
    if (diff === 0) return { label: "Today", urgent: true };
    if (diff === 1) return { label: "Tomorrow", urgent: false };
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, urgent: true };
    if (diff <= 3) return { label: `${diff}d left`, urgent: true };
    return { label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), urgent: false };
  };

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "var(--text3)" }}>
        <i className="ti ti-loader" style={{ fontSize: 36, opacity: .4 }} />
        <div style={{ marginTop: 12, fontSize: 15 }}>Loading your dashboard...</div>
      </div>
    </div>
  );

  return (
    <div className="page-wrap">

      {/* Greeting Banner */}
      <div style={{ borderRadius: 20, padding: "28px 32px", marginBottom: 28, background: "linear-gradient(135deg, rgba(109,93,252,0.12) 0%, rgba(96,165,250,0.06) 100%)", border: "1px solid rgba(109,93,252,0.2)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: "rgba(109,93,252,0.07)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: -30, right: 80, width: 80, height: 80, borderRadius: "50%", background: "rgba(96,165,250,0.05)", pointerEvents: "none" }} />
        <div style={{ fontSize: 13, color: "var(--accent2)", fontWeight: 600, marginBottom: 6, letterSpacing: ".3px" }}>{timeGreeting} 👋</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.6px", marginBottom: 6 }}>{profile?.name || "Team Member"}</div>
        <div style={{ fontSize: 15, color: "var(--text2)" }}>{greeting}</div>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Open Tasks",    val: openTasks.length,       color: "var(--accent2)", icon: "ti-clock" },
          { label: "Completed",     val: doneTasks.length,       color: "var(--green)",   icon: "ti-circle-check" },
          { label: "Today's Hours", val: fmtDuration(todayMins), color: "var(--blue)",    icon: "ti-clock-record" },
          { label: "This Week",     val: fmtDuration(weekMins),  color: "var(--amber)",   icon: "ti-chart-bar" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ padding: "20px 22px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: `${s.color}18`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color, letterSpacing: "-0.6px", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* ── My Tasks ── */}
        <div className="crm-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
              <i className="ti ti-checkbox" style={{ marginRight: 8, color: "var(--accent2)" }} />My Tasks
            </div>
            {/* Today / All tab toggle */}
            <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4, border: "1px solid var(--border2)" }}>
              {(["today", "all"] as const).map(tab => (
                <button key={tab} onClick={() => setTaskTab(tab)} style={{
                  padding: "5px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", border: "none", fontFamily: "inherit",
                  background: taskTab === tab ? "var(--accent)" : "transparent",
                  color: taskTab === tab ? "#fff" : "var(--text3)",
                  transition: "all .15s",
                }}>
                  {tab === "today" ? `Today ${todayTasks.length > 0 ? `(${todayTasks.length})` : ""}` : `All (${allTasks.length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Date label when on Today tab */}
          {taskTab === "today" && (
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
              {todayLabel} · {todayTasks.filter(t => !t.done).length} pending
            </div>
          )}

          {displayTasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: 32, color: "var(--text3)" }}>
              <i className="ti ti-circle-check" style={{ fontSize: 32, opacity: .2 }} />
              <div style={{ marginTop: 10, fontSize: 14 }}>
                {taskTab === "today" ? "No tasks due today 🎉" : "No tasks assigned yet"}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 440, overflowY: "auto" }}>
              {displayTasks.map(t => {
                const ps = priorityStyle[t.priority];
                const ss = statusStyle[t.status];
                const dueInfo = formatDue(t.due);
                return (
                  <div key={t.id} style={{
                    padding: "12px 14px", borderRadius: 12,
                    border: `1px solid ${t.done ? "var(--border)" : dueInfo?.urgent ? "rgba(248,113,113,0.2)" : "var(--border2)"}`,
                    background: t.done ? "rgba(255,255,255,0.01)" : dueInfo?.urgent && !t.done ? "rgba(248,113,113,0.03)" : "rgba(255,255,255,0.03)",
                    opacity: t.done ? 0.6 : 1,
                    transition: "all .15s",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      {/* Done checkbox */}
                      <div onClick={() => updateTaskStatus(t.id, t.done ? "To Do" : "Done")}
                        style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${t.done ? "var(--green)" : "var(--border2)"}`, background: t.done ? "var(--green)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, marginTop: 1 }}>
                        {t.done && <i className="ti ti-check" style={{ fontSize: 11, color: "#fff" }} />}
                      </div>

                      {/* Task info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: t.done ? "var(--text3)" : "var(--text)", textDecoration: t.done ? "line-through" : "none", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {t.title}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          {ps && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: ps.bg, color: ps.color, border: `1px solid ${ps.border}` }}>{t.priority}</span>}
                          {t.client && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, color: "var(--text3)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}>{t.client}</span>}
                          {dueInfo && (
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, color: dueInfo.urgent ? "var(--red)" : "var(--text3)", background: dueInfo.urgent ? "var(--red-bg)" : "rgba(255,255,255,0.04)", border: `1px solid ${dueInfo.urgent ? "var(--red-border)" : "var(--border)"}`, fontWeight: dueInfo.urgent ? 700 : 400 }}>
                              {dueInfo.urgent ? "⚠ " : ""}{dueInfo.label}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Inline status dropdown */}
                      <select
                        value={t.status}
                        onChange={e => { e.stopPropagation(); updateTaskStatus(t.id, e.target.value); }}
                        style={{
                          background: ss?.bg || "rgba(255,255,255,0.05)",
                          color: ss?.color || "var(--text2)",
                          fontSize: 11, padding: "4px 8px", borderRadius: 20,
                          fontWeight: 600, border: "none", cursor: "pointer",
                          outline: "none", fontFamily: "inherit", flexShrink: 0,
                        }}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Today's Posts */}
          <div className="crm-card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
                <i className="ti ti-calendar" style={{ marginRight: 8, color: "#f472b6" }} />Today's Posts
              </div>
              {setActivePage && (
                <button onClick={() => setActivePage("calendar")} style={{ fontSize: 12, color: "var(--accent2)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                  View all <i className="ti ti-arrow-right" style={{ fontSize: 12 }} />
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 16 }}>{todayLabel}</div>
            {todayPosts.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "var(--text3)" }}>
                <i className="ti ti-calendar-off" style={{ fontSize: 28, opacity: .2 }} />
                <div style={{ marginTop: 8, fontSize: 13 }}>No posts scheduled today</div>
              </div>
            ) : todayPosts.map(p => {
              const cs = calStatusStyle[p.status] || calStatusStyle["Planned"];
              return (
                <div key={p.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.02)", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", flex: 1 }}>{p.title}</div>
                    <select value={p.status} onChange={e => { e.stopPropagation(); updatePostStatus(p.id, e.target.value); }}
                      style={{ background: cs.bg, color: cs.color, border: "none", borderRadius: 20, padding: "3px 8px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", outline: "none", flexShrink: 0 }}>
                      {CAL_STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(244,114,182,0.1)", color: "#f472b6", border: "1px solid rgba(244,114,182,0.3)", fontWeight: 600 }}>{p.platform}</span>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.04)", color: "var(--text3)", border: "1px solid var(--border)" }}>{p.client}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upcoming Posts */}
          {upcomingPosts.length > 0 && (
            <div className="crm-card" style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
                  <i className="ti ti-calendar-event" style={{ marginRight: 8, color: "var(--blue)" }} />Upcoming Posts
                </div>
                {setActivePage && (
                  <button onClick={() => setActivePage("calendar")} style={{ fontSize: 12, color: "var(--accent2)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                    View all <i className="ti ti-arrow-right" style={{ fontSize: 12 }} />
                  </button>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                {upcomingPosts.slice(0, 6).map(p => {
                  const cs = calStatusStyle[p.status] || calStatusStyle["Planned"];
                  return (
                    <div key={p.id} onClick={() => setActivePage && setActivePage("calendar")}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", cursor: setActivePage ? "pointer" : "default", transition: "background 0.15s" }}
                      onMouseEnter={e => { if (setActivePage) (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}>
                      <div style={{ fontSize: 11, color: "var(--text3)", minWidth: 52, fontWeight: 600 }}>
                        {p.scheduled_date ? new Date(p.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "TBD"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>{p.client} · {p.platform}</div>
                      </div>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: cs.bg, color: cs.color, flexShrink: 0 }}>{p.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── My D2C Board Tasks ── */}
      {boardTasks.length > 0 && (
        <div className="crm-card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
              <i className="ti ti-layout-kanban" style={{ marginRight: 8, color: "#818cf8" }} />My D2C Board Tasks
            </div>
            <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 20, background: "rgba(99,102,241,0.12)", color: "#818cf8", border: "1px solid rgba(99,102,241,0.25)", fontWeight: 600 }}>{boardTasks.length} open</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
            {boardTasks.map(t => {
              const BOARD_COL_NAMES: Record<string, string> = { task: "Task", inprogress: "In Progress", review: "Review" };
              const BOARD_COL_COLORS: Record<string, string> = { task: "#60a5fa", inprogress: "#fbbf24", review: "#a78bfa" };
              const colColor = BOARD_COL_COLORS[t.column_id] || "#94a3b8";
              const colName = BOARD_COL_NAMES[t.column_id] || t.column_id;
              const ps = priorityStyle[t.priority];
              const dueInfo = formatDue(t.due);
              return (
                <div key={t.id} style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid ${colColor}25`, background: `${colColor}06`, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 4, height: 36, borderRadius: 2, background: colColor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 4 }}>{t.title}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: `${colColor}18`, color: colColor }}>{colName}</span>
                      {t.client && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, color: "var(--text3)", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)" }}>{t.client}</span>}
                      {ps && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, fontWeight: 600, background: ps.bg, color: ps.color, border: `1px solid ${ps.border}` }}>{t.priority}</span>}
                    </div>
                  </div>
                  {dueInfo && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, color: dueInfo.urgent ? "var(--red)" : "var(--text3)", background: dueInfo.urgent ? "var(--red-bg)" : "rgba(255,255,255,0.04)", fontWeight: dueInfo.urgent ? 700 : 400, flexShrink: 0 }}>{dueInfo.urgent ? "⚠ " : ""}{dueInfo.label}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MY CREATIVES SECTION */}
      {myCreatives.length > 0 && (
        <div className="crm-card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
              <i className="ti ti-photo-video" style={{ marginRight: 8, color: "var(--accent2)" }} />My Creatives
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{myCreatives.length} total</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {myCreatives.map(c => {
              const st = c.status === "working" ? { color: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.25)", dot: "#4ade80", label: "Working" }
                       : c.status === "not_working" ? { color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.25)", dot: "#f87171", label: "Not Working" }
                       : { color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.25)", dot: "#fbbf24", label: "Testing" };
              const PLAT_COLOR: Record<string, string> = {
                "Meta Ads": "#60a5fa", "Google Ads": "#f87171", "HotStar Ads": "#a78bfa",
                "ChatGPT Ads": "#34d399", "Instagram": "#f472b6", "Facebook": "#818cf8", "YouTube": "#f87171",
              };
              return (
                <div key={c.id} style={{ padding: "14px 16px", borderRadius: 14, border: `1px solid ${st.border}`, background: st.bg, display: "flex", flexDirection: "column", gap: 8 }}>
                  {/* Header row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot, boxShadow: `0 0 6px ${st.dot}`, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: st.color, letterSpacing: ".3px" }}>{st.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "rgba(255,255,255,0.07)", color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px" }}>{c.type}</span>
                  </div>
                  {/* Title */}
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>{c.title}</div>
                  {/* Client */}
                  {c.client && <div style={{ fontSize: 12, color: "var(--text3)" }}>{c.client}</div>}
                  {/* Platforms */}
                  {Array.isArray(c.platforms) && c.platforms.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {c.platforms.map((p: string) => (
                        <span key={p} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 600, background: "rgba(255,255,255,0.06)", color: PLAT_COLOR[p] || "var(--text3)", border: "1px solid rgba(255,255,255,0.08)" }}>{p}</span>
                      ))}
                    </div>
                  )}
                  {/* Notes */}
                  {c.notes && <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.4, marginTop: 2, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 6 }}>{c.notes}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MY TIME SECTION */}
      <div className="crm-card" style={{ padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
              <i className="ti ti-clock-record" style={{ marginRight: 8, color: "var(--accent2)" }} />My Time
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>
              Today: <strong style={{ color: "var(--accent2)" }}>{fmtDuration(todayMins)}</strong> &nbsp;·&nbsp; This week: <strong style={{ color: "var(--blue)" }}>{fmtDuration(weekMins)}</strong>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {timerRunning ? (
              <button onClick={stopTimer} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, color: "var(--red)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                <i className="ti ti-player-stop-filled" /> {timerDisplay()}
              </button>
            ) : (
              <button onClick={startTimer} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", background: "var(--green-bg)", border: "1px solid var(--green-border)", borderRadius: 10, color: "var(--green)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                <i className="ti ti-player-play-filled" /> Start Timer
              </button>
            )}
            <button onClick={openAddTime} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text2)", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              <i className="ti ti-plus" /> Log Time
            </button>
          </div>
        </div>

        {timeEntries.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text3)" }}>
            <i className="ti ti-clock" style={{ fontSize: 32, opacity: .2 }} />
            <div style={{ marginTop: 10, fontSize: 14 }}>No time logged yet — start your first timer!</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
            {timeEntries.map(e => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.02)" }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: categoryColor[e.category] || "#5646e0", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.task_title}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                    {e.category}{e.client ? ` · ${e.client}` : ""} · {e.date ? new Date(e.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                  </div>
                </div>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent2)", flexShrink: 0 }}>{fmtDuration(e.duration_mins)}</span>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => openEditTime(e)} style={{ background: "transparent", border: "1px solid var(--border2)", borderRadius: 7, padding: "5px 8px", color: "var(--blue)", cursor: "pointer", fontSize: 13 }}><i className="ti ti-pencil" /></button>
                  <button onClick={() => deleteTimeEntry(e.id)} style={{ background: "transparent", border: "1px solid var(--border2)", borderRadius: 7, padding: "5px 8px", color: "var(--red)", cursor: "pointer", fontSize: 13 }}><i className="ti ti-trash" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TIME LOG MODAL */}
      {showTimeModal && (
        <div onClick={() => setShowTimeModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 500, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>{editingTimeId ? "Edit Entry" : "Log Time"}</div>
              <button onClick={() => setShowTimeModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>

            {timerRunning && (
              <div style={{ background: "var(--green-bg)", border: "1px solid var(--green-border)", borderRadius: 12, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                <i className="ti ti-clock-play" style={{ color: "var(--green)", fontSize: 20 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--green)" }}>Timer running — {timerDisplay()}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Fill in details, stop timer when done</div>
                </div>
                <button onClick={stopTimer} style={{ marginLeft: "auto", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 8, padding: "6px 14px", color: "var(--red)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Stop</button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Task / Work Done *</label>
                <input value={timeForm.task_title} onChange={e => setTimeForm({ ...timeForm, task_title: e.target.value })} placeholder="e.g. Edited 3 reels for Ozmo" style={IS} />
              </div>
              <div>
                <label style={LS}>Client</label>
                <select value={timeForm.client} onChange={e => setTimeForm({ ...timeForm, client: e.target.value })} style={IS}>
                  <option value="">No client / Internal</option>
                  {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Category</label>
                <select value={timeForm.category} onChange={e => setTimeForm({ ...timeForm, category: e.target.value })} style={IS}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Date</label>
                <input type="date" value={timeForm.date} onChange={e => setTimeForm({ ...timeForm, date: e.target.value })} style={IS} />
              </div>
              <div>
                <label style={LS}>Duration (minutes)</label>
                <input type="number" value={timeForm.duration_mins} onChange={e => setTimeForm({ ...timeForm, duration_mins: e.target.value })} placeholder="e.g. 90" style={IS} />
                {timeForm.duration_mins && <div style={{ fontSize: 12, color: "var(--accent2)", marginTop: 5 }}>= {fmtDuration(Number(timeForm.duration_mins))}</div>}
              </div>
              <div>
                <label style={LS}>Start Time</label>
                <input type="time" value={timeForm.start_time} onChange={e => handleTimeChange("start_time", e.target.value)} style={IS} />
              </div>
              <div>
                <label style={LS}>End Time</label>
                <input type="time" value={timeForm.end_time} onChange={e => handleTimeChange("end_time", e.target.value)} style={IS} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Notes</label>
                <textarea value={timeForm.notes} onChange={e => setTimeForm({ ...timeForm, notes: e.target.value })} placeholder="Any details…" rows={2} style={{ ...IS, resize: "vertical" as const }} />
              </div>
            </div>
            <button onClick={saveTimeEntry} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15, marginTop: 20 }}>
              {editingTimeId ? "Save Changes" : "Log Time"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}