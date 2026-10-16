"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const P: Record<string, { bg: string; border: string; text: string }> = {
  High:   { bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.35)", text: "#ef4444" },
  Medium: { bg: "rgba(251,191,36,0.15)",  border: "rgba(251,191,36,0.35)",  text: "#d97706" },
  Low:    { bg: "rgba(52,211,153,0.15)",  border: "rgba(52,211,153,0.35)",  text: "#059669" },
};

const today = new Date().toISOString().split("T")[0];
const dayName = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

export default function AgentDashboard({ setActivePage }: { setActivePage?: (p: string) => void }) {
  const [members,       setMembers]       = useState<any[]>([]);
  const [attendance,    setAttendance]    = useState<any[]>([]);
  const [leaves,        setLeaves]        = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [dueTasks,      setDueTasks]      = useState<any[]>([]);
  const [overdueTasks,  setOverdueTasks]  = useState<any[]>([]);
  const [openTasks,     setOpenTasks]     = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [
        { data: membersData },
        { data: attData },
        { data: leavesData },
        { data: pendingData },
        { data: dueData },
        { data: overdueData },
        { data: openData },
      ] = await Promise.all([
        supabase.from("profiles").select("id, name, color, role").neq("status", "left").order("created_at"),
        supabase.from("attendance").select("*").eq("date", today),
        supabase.from("leave_requests").select("*").eq("date", today),
        supabase.from("leave_requests").select("*").eq("status", "pending"),
        supabase.from("board_tasks").select("*").eq("due", today).neq("column_id", "done"),
        supabase.from("board_tasks").select("*").lt("due", today).neq("column_id", "done"),
        supabase.from("board_tasks").select("id, assignee, column_id").neq("column_id", "done"),
      ]);
      setMembers(membersData || []);
      setAttendance(attData || []);
      setLeaves(leavesData || []);
      setPendingLeaves(pendingData || []);
      setDueTasks(dueData || []);
      setOverdueTasks(overdueData || []);
      setOpenTasks(openData || []);
    } catch (e: any) {
      console.error("AgentDashboard fetchAll error:", e);
      setError(e?.message || "Failed to load briefing data");
    } finally {
      setLoading(false);
    }
  };

  // Derive per-member status
  const memberStatus = (m: any) => {
    const rec  = attendance.find((a: any) => a.employee_name === m.name);
    const lReq = leaves.find((l: any) => l.employee_name === m.name);
    const isHalfDay = rec?.leave_type === "half_day" || lReq?.leave_type === "half_day";
    if (rec?.is_absent) return "absent";
    if (rec?.clock_in && rec?.clock_out) return "done";
    if (rec?.clock_in) return isHalfDay ? "half_day_in" : "in";
    if (rec?.on_leave && rec?.leave_type !== "half_day") return "leave";
    if (lReq) return isHalfDay ? "half_day_leave" : "leave";
    return "out";
  };

  const statusLabel = (s: string) => {
    if (s === "in")            return { label: "In Office",      color: "#34d399", bg: "rgba(52,211,153,0.15)",  border: "rgba(52,211,153,0.3)" };
    if (s === "half_day_in")   return { label: "½ Day In",       color: "#34d399", bg: "rgba(52,211,153,0.1)",   border: "rgba(52,211,153,0.25)" };
    if (s === "done")          return { label: "Clocked Out",    color: "#60a5fa", bg: "rgba(96,165,250,0.15)",  border: "rgba(96,165,250,0.3)" };
    if (s === "leave")         return { label: "On Leave",       color: "#f87171", bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.3)" };
    if (s === "half_day_leave")return { label: "½ Day Leave",    color: "#fbbf24", bg: "rgba(251,191,36,0.15)",  border: "rgba(251,191,36,0.3)" };
    if (s === "absent")        return { label: "Absent",         color: "#f87171", bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.3)" };
    return { label: "Not Clocked In", color: "var(--text3)", bg: "var(--glass2)", border: "var(--border2)" };
  };

  // Capacity: open tasks per member
  const taskCount = (name: string) =>
    openTasks.filter((t: any) => t.assignee?.split(", ").map((s: string) => s.trim()).includes(name)).length;

  const maxTasks = Math.max(1, ...members.map(m => taskCount(m.name)));

  const inCount     = members.filter(m => ["in","half_day_in","done"].includes(memberStatus(m))).length;
  const leaveCount  = members.filter(m => ["leave","half_day_leave","absent"].includes(memberStatus(m))).length;

  const SS: React.CSSProperties = {
    background: "var(--glass)", border: "1px solid var(--border2)", borderRadius: 16,
    padding: "20px 22px", backdropFilter: "blur(12px)",
  };
  const SH: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase",
    letterSpacing: ".8px", marginBottom: 14,
  };

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 14 }}>
      Loading briefing…
    </div>
  );

  if (error) return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <i className="ti ti-alert-circle" style={{ fontSize: 32, color: "#f87171" }} />
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text2)" }}>Could not load briefing</div>
      <div style={{ fontSize: 12, color: "var(--text3)", maxWidth: 320, textAlign: "center" }}>{error}</div>
      <button onClick={() => { setError(null); fetchAll(); }} style={{ padding: "8px 18px", borderRadius: 10, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
        Retry
      </button>
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px 40px" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>🤖</span>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px" }}>Morning Briefing</div>
        </div>
        <div style={{ fontSize: 13, color: "var(--text3)", marginLeft: 2 }}>{dayName} · Auto-refreshes on load</div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "In Office",          val: inCount,                color: "#34d399", icon: "ti-building" },
          { label: "On Leave / Absent",  val: leaveCount,             color: "#f87171", icon: "ti-beach" },
          { label: "Pending Approvals",  val: pendingLeaves.length,   color: "#fbbf24", icon: "ti-clock-pause", action: "hr" },
          { label: "Due Today",          val: dueTasks.length,        color: "#60a5fa", icon: "ti-calendar-due", action: "board" },
          { label: "Overdue",            val: overdueTasks.length,    color: "#f87171", icon: "ti-alert-circle",action: "board" },
        ].map(s => (
          <div key={s.label}
            onClick={() => s.action && setActivePage?.(s.action)}
            style={{
              ...SS, cursor: s.action ? "pointer" : "default",
              display: "flex", flexDirection: "column", gap: 8,
              transition: "border-color .15s",
            }}
            onMouseEnter={e => { if (s.action) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent-border)"; }}
            onMouseLeave={e => { if (s.action) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border2)"; }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <i className={`ti ${s.icon}`} style={{ fontSize: 18, color: s.color, opacity: .8 }} />
              {s.action && <i className="ti ti-arrow-up-right" style={{ fontSize: 11, color: "var(--text3)" }} />}
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>

        {/* Team Status */}
        <div style={SS}>
          <div style={SH}>Today's Team Status</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map(m => {
              const s  = memberStatus(m);
              const sl = statusLabel(s);
              const rec = attendance.find((a: any) => a.employee_name === m.name);
              const clockIn = rec?.clock_in ? rec.clock_in.slice(11, 16) : null;
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: m.color || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                      {m.name[0]}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{m.name}</div>
                      {clockIn && <div style={{ fontSize: 10, color: "var(--text3)" }}>In at {clockIn}</div>}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: sl.bg, color: sl.color, border: `1px solid ${sl.border}`, whiteSpace: "nowrap" }}>
                    {sl.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Capacity view */}
        <div style={SS}>
          <div style={SH}>Workload Capacity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[...members]
              .sort((a, b) => taskCount(b.name) - taskCount(a.name))
              .map(m => {
                const cnt = taskCount(m.name);
                const pct = Math.round((cnt / maxTasks) * 100);
                const overloaded = cnt >= 8;
                const barColor = overloaded ? "#ef4444" : cnt >= 5 ? "#fbbf24" : "#34d399";
                return (
                  <div key={m.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{m.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: overloaded ? "#ef4444" : "var(--text3)" }}>
                        {cnt} task{cnt !== 1 ? "s" : ""}{overloaded ? " ⚠️" : ""}
                      </span>
                    </div>
                    <div style={{ height: 6, background: "var(--border2)", borderRadius: 6, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 6, transition: "width .4s" }} />
                    </div>
                  </div>
                );
              })
            }
          </div>
          <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", fontSize: 11, color: "var(--text3)" }}>
            <span style={{ color: "#ef4444", fontWeight: 700 }}>Red ≥8</span> &nbsp;·&nbsp;
            <span style={{ color: "#fbbf24", fontWeight: 700 }}>Amber ≥5</span> &nbsp;·&nbsp;
            <span style={{ color: "#34d399", fontWeight: 700 }}>Green &lt;5</span>
            <span style={{ marginLeft: 8 }}>open tasks</span>
          </div>
        </div>
      </div>

      {/* Due Today */}
      {dueTasks.length > 0 && (
        <div style={{ ...SS, marginBottom: 20 }}>
          <div style={SH}>Due Today — {dueTasks.length} task{dueTasks.length !== 1 ? "s" : ""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dueTasks.map((t: any) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </div>
      )}

      {/* Overdue */}
      {overdueTasks.length > 0 && (
        <div style={{ ...SS, marginBottom: 20, borderColor: "rgba(248,113,113,0.3)" }}>
          <div style={{ ...SH, color: "#ef4444" }}>Overdue — {overdueTasks.length} task{overdueTasks.length !== 1 ? "s" : ""}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overdueTasks.map((t: any) => (
              <TaskRow key={t.id} task={t} overdue />
            ))}
          </div>
        </div>
      )}

      {/* Pending Leave Approvals */}
      {pendingLeaves.length > 0 && (
        <div style={{ ...SS, borderColor: "rgba(251,191,36,0.35)" }}>
          <div style={{ ...SH, color: "#d97706" }}>Pending Leave Approvals</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pendingLeaves.map((l: any) => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 10, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <i className="ti ti-beach" style={{ color: "#d97706", fontSize: 16 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{l.employee_name}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>
                      {l.leave_type === "half_day" ? "Half Day" : l.leave_type?.charAt(0)?.toUpperCase() + l.leave_type?.slice(1)} · {l.date}
                      {l.reason && ` · "${l.reason}"`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setActivePage?.("hr")}
                  style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 8, background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)", color: "#d97706", cursor: "pointer", whiteSpace: "nowrap" }}>
                  Review in HR
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {dueTasks.length === 0 && overdueTasks.length === 0 && pendingLeaves.length === 0 && (
        <div style={{ ...SS, textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text2)" }}>All clear!</div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 4 }}>No overdue tasks, nothing due today, no pending approvals.</div>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, overdue }: { task: any; overdue?: boolean }) {
  const p = P[task.priority] || P["Medium"];
  const daysAgo = overdue && task.due
    ? Math.round((new Date().getTime() - new Date(task.due).getTime()) / 86400000)
    : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)" }}>
      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: p.bg, color: p.text, border: `1px solid ${p.border}`, whiteSpace: "nowrap" }}>
        {task.priority}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
          {task.client && <span>{task.client} · </span>}
          {task.assignee || "Unassigned"}
        </div>
      </div>
      {overdue && daysAgo > 0 && (
        <span style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", whiteSpace: "nowrap", flexShrink: 0 }}>
          {daysAgo}d overdue
        </span>
      )}
    </div>
  );
}
