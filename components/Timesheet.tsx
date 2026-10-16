"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const CATEGORIES = ["Content Creation", "Client Call", "Editing", "Strategy", "Design", "Meta Ads", "Reporting", "Meeting", "Other"];

const categoryColor: Record<string, string> = {
  "Content Creation": "#5646e0",
  "Client Call":      "#60a5fa",
  "Editing":          "#f472b6",
  "Strategy":         "#4ade80",
  "Design":           "#fbbf24",
  "Meta Ads":         "#f87171",
  "Reporting":        "#34d399",
  "Meeting":          "#a78bfa",
  "Other":            "#94a3b8",
};

function fmtDuration(mins: number) {
  if (!mins) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTime(timeStr: string) {
  if (!timeStr) return "—";
  const [h, m] = timeStr.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const emptyForm = {
  member_name: "",
  client: "",
  task_title: "",
  category: "Content Creation",
  date: new Date().toISOString().split("T")[0],
  start_time: "",
  end_time: "",
  duration_mins: "",
  notes: "",
};

export default function Timesheet({ profile, isAdmin }: { profile?: any; isAdmin?: boolean }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"start-timer" | "log-manual" | "edit">("log-manual");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [filterMember, setFilterMember] = useState("All");
  const [filterClient, setFilterClient] = useState("All");
  const [filterCategory, setFilterCategory] = useState("All");
  const [filterDate, setFilterDate] = useState("");
  const [activeTab, setActiveTab] = useState<"log" | "summary">("log");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const [timerRunning, setTimerRunning] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [runningEntryId, setRunningEntryId] = useState<string | null>(null);
  const [liveTick, setLiveTick] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveTickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const saveTimerLocal = (entryId: string, seconds: number, paused: boolean) => {
    try { localStorage.setItem("crm-timer", JSON.stringify({ entryId, seconds, paused, savedAt: Date.now() })); } catch {}
  };

  // Restore timer from localStorage on mount (survives page navigation)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("crm-timer");
      if (saved) {
        const { entryId, seconds, paused, savedAt } = JSON.parse(saved);
        const extra = paused ? 0 : Math.floor((Date.now() - savedAt) / 1000);
        setRunningEntryId(entryId);
        setTimerSeconds((seconds || 0) + extra);
        setTimerRunning(true);
        setTimerPaused(!!paused);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const ch = supabase.channel("timesheet-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "timesheets" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (timerRunning && !timerPaused) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning, timerPaused]);

  // Tick every 30s so live elapsed times update for other members' running timers
  useEffect(() => {
    liveTickRef.current = setInterval(() => setLiveTick(t => t + 1), 30000);
    return () => { if (liveTickRef.current) clearInterval(liveTickRef.current); };
  }, []);

  // Calculate elapsed minutes from an entry's date + start_time to now
  const calcElapsedMins = (date: string, startTime: string) => {
    if (!date || !startTime) return 0;
    const [h, m] = startTime.split(":").map(Number);
    const start = new Date(date + "T00:00:00");
    start.setHours(h, m, 0, 0);
    return Math.max(0, Math.floor((Date.now() - start.getTime()) / 60000));
  };

  const fetchAll = async () => {
    setLoading(true);
    let tsQuery = supabase.from("timesheets").select("*").order("date", { ascending: false }).order("created_at", { ascending: false });
    if (!isAdmin && profile?.id) tsQuery = tsQuery.eq("user_id", profile.id);
    const [{ data: ts, error: tsErr }, { data: team }, { data: cl }] = await Promise.all([
      tsQuery,
      supabase.from("profiles").select("id, name, color").neq("status", "left").order("created_at"),
      supabase.from("clients").select("id, name").eq("status", "Active").order("name"),
    ]);
    if (tsErr) console.error("Timesheet fetch error:", tsErr);
    if (ts) setEntries(ts);
    if (team) setTeamMembers(team);
    if (cl) setClients(cl);
    setLoading(false);
  };

  const filtered = entries.filter(e =>
    (filterMember === "All" || e.member_name === filterMember) &&
    (filterClient === "All" || e.client === filterClient) &&
    (filterCategory === "All" || e.category === filterCategory) &&
    (!filterDate || e.date === filterDate)
  );

  const totalMins = filtered.reduce((a, b) => a + (b.duration_mins || 0), 0);

  const memberSummary = teamMembers.map(m => {
    const memberEntries = filtered.filter(e => e.member_name === m.name);
    const mins = memberEntries.reduce((a, b) => a + (b.duration_mins || 0), 0);
    const byCategory = CATEGORIES.map(cat => ({
      cat,
      mins: memberEntries.filter(e => e.category === cat).reduce((a, b) => a + (b.duration_mins || 0), 0),
    })).filter(x => x.mins > 0);
    return { ...m, mins, byCategory, count: memberEntries.length };
  }).filter(m => m.mins > 0);

  const nowTimeStr = () => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`;
  };

  const timerDisplay = () => {
    const h = Math.floor(timerSeconds / 3600);
    const m = Math.floor((timerSeconds % 3600) / 60);
    const s = timerSeconds % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };

  const memberUserId = (name: string) => {
    const m = teamMembers.find((tm: any) => tm.name === name);
    return m?.id || profile?.id || null;
  };

  // Open modal to fill details & start timing (entry saved immediately when they click Save)
  const openStartTimer = () => {
    if (timerRunning) return; // already running
    const now = new Date();
    const defaultName = (!isAdmin && profile?.name) ? profile.name : (teamMembers[0]?.name || "");
    setEditingId(null);
    setSaveError("");
    setForm({ ...emptyForm, member_name: defaultName, date: now.toISOString().split("T")[0], start_time: nowTimeStr() });
    setModalMode("start-timer");
    setShowModal(true);
  };

  // Save entry and immediately start the timer (modal closes, user works, timer runs in background)
  const saveAndStartTimer = async () => {
    setSaveError("");
    if (!form.task_title?.trim()) { setSaveError("Task / Work Done is required."); return; }
    if (!form.member_name) { setSaveError("Please select a team member."); return; }

    setSaving(true);
    const startEpoch = Date.now();
    const payload = {
      user_id: memberUserId(form.member_name),
      member_name: form.member_name,
      client: form.client || null,
      task_title: form.task_title.trim(),
      category: form.category,
      date: form.date || new Date().toISOString().split("T")[0],
      start_time: form.start_time || nowTimeStr(),
      end_time: null,
      duration_mins: 0,
      notes: form.notes?.trim() || null,
    };

    const { data, error } = await supabase.from("timesheets").insert([payload]).select().single();
    setSaving(false);

    if (error || !data) {
      setSaveError(`Error: ${error?.message || "Unknown error"}`);
      return;
    }

    // Start timer and persist to localStorage so it survives navigation
    setRunningEntryId(data.id);
    setTimerSeconds(0);
    setTimerPaused(false);
    setTimerRunning(true);
    saveTimerLocal(data.id, 0, false);
    setShowModal(false);
    fetchAll();
  };

  // Stop timer and update the entry with end_time + duration
  const stopTimerAndSave = async () => {
    if (!runningEntryId) return;
    const endTime = nowTimeStr();
    const mins = Math.max(1, Math.round(timerSeconds / 60));

    setTimerRunning(false);
    setTimerPaused(false);
    const { error } = await supabase.from("timesheets")
      .update({ end_time: endTime, duration_mins: mins })
      .eq("id", runningEntryId);

    if (error) {
      console.error("Stop timer save error:", error);
      setTimerRunning(true);
      return;
    }

    try { localStorage.removeItem("crm-timer"); } catch {}
    setRunningEntryId(null);
    setTimerSeconds(0);
    fetchAll();
  };

  const pauseTimer = () => {
    setTimerPaused(true);
    if (runningEntryId) saveTimerLocal(runningEntryId, timerSeconds, true);
  };

  const resumeTimer = () => {
    setTimerPaused(false);
    if (runningEntryId) saveTimerLocal(runningEntryId, timerSeconds, false);
  };

  // Open manual log modal
  const openAdd = () => {
    const now = new Date();
    const defaultName = (!isAdmin && profile?.name) ? profile.name : (teamMembers[0]?.name || "");
    setEditingId(null);
    setSaveError("");
    setForm({ ...emptyForm, member_name: defaultName, date: now.toISOString().split("T")[0] });
    setModalMode("log-manual");
    setShowModal(true);
  };

  // Open edit modal — if it's the running entry, modal shows End Timer + Save buttons
  const openEdit = (e: any) => {
    setEditingId(e.id);
    setSaveError("");
    setForm({ ...e, duration_mins: String(e.duration_mins || "") });
    setModalMode("edit");
    setShowModal(true);
  };

  const calcDuration = (start: string, end: string) => {
    if (!start || !end) return "";
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? String(diff) : "";
  };

  const handleTimeChange = (field: "start_time" | "end_time", val: string) => {
    const updated = { ...form, [field]: val };
    updated.duration_mins = calcDuration(
      field === "start_time" ? val : form.start_time,
      field === "end_time" ? val : form.end_time
    );
    setForm(updated);
  };

  // Save edits or manual log entry
  const saveEntry = async () => {
    setSaveError("");
    if (!form.task_title?.trim()) { setSaveError("Task / Work Done is required."); return; }
    if (!form.member_name) { setSaveError("Please select a team member."); return; }

    setSaving(true);
    const payload = {
      user_id: memberUserId(form.member_name),
      member_name: form.member_name,
      client: form.client || null,
      task_title: form.task_title.trim(),
      category: form.category,
      date: form.date || new Date().toISOString().split("T")[0],
      start_time: form.start_time || null,
      end_time: form.end_time || null,
      duration_mins: Number(form.duration_mins) || 0,
      notes: form.notes?.trim() || null,
    };

    let error: any = null;
    if (editingId) {
      ({ error } = await supabase.from("timesheets").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("timesheets").insert([payload]));
    }

    setSaving(false);

    if (error) {
      setSaveError(`Error: ${error.message} (code: ${error.code})`);
      return;
    }

    setShowModal(false);
    fetchAll();
  };

  // End timer and save the running entry (called from Edit modal when entry = running entry)
  const endTimerAndSave = async () => {
    setSaveError("");
    if (!form.task_title?.trim()) { setSaveError("Task / Work Done is required."); return; }
    if (!form.member_name) { setSaveError("Please select a team member."); return; }

    const endTime = nowTimeStr();
    const mins = Math.max(1, Math.round(timerSeconds / 60));

    setSaving(true);
    const payload = {
      user_id: memberUserId(form.member_name),
      member_name: form.member_name,
      client: form.client || null,
      task_title: form.task_title.trim(),
      category: form.category,
      date: form.date || new Date().toISOString().split("T")[0],
      start_time: form.start_time || null,
      end_time: endTime,
      duration_mins: mins,
      notes: form.notes?.trim() || null,
    };

    const { error } = await supabase.from("timesheets").update(payload).eq("id", editingId!);
    setSaving(false);

    if (error) {
      setSaveError(`Error: ${error.message}`);
      return;
    }

    setTimerRunning(false);
    setTimerPaused(false);
    setTimerSeconds(0);
    setRunningEntryId(null);
    try { localStorage.removeItem("crm-timer"); } catch {}
    setShowModal(false);
    fetchAll();
  };

  const deleteEntry = async (id: string) => {
    if (id === runningEntryId) {
      setTimerRunning(false);
      setTimerPaused(false);
      setTimerSeconds(0);
      setRunningEntryId(null);
      try { localStorage.removeItem("crm-timer"); } catch {}
    }
    await supabase.from("timesheets").delete().eq("id", id);
    setDeleteConfirm(null);
    fetchAll();
  };

  const isRunningEntry = modalMode === "edit" && editingId === runningEntryId;
  const memberColor = teamMembers.reduce((acc, m) => { acc[m.name] = m.color || "#5646e0"; return acc; }, {} as Record<string, string>);

  const IS = { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 14, outline: "none" };
  const LS = { fontSize: 11, fontWeight: 600 as const, color: "var(--text3)", display: "block" as const, marginBottom: 7, textTransform: "uppercase" as const, letterSpacing: ".6px" };
  const SS = { background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, padding: "9px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 13, outline: "none", cursor: "pointer" };

  return (
    <div className="page-wrap">

      <div className="page-header-row">
        <div>
          <div className="page-title">Timesheet</div>
          <div className="page-sub">Track time your team spends on tasks & clients</div>
        </div>
        <div className="btn-row">
          {timerRunning ? (
            <>
              {timerPaused ? (
                <button onClick={resumeTimer} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "var(--green-bg)", border: "1px solid var(--green-border)", borderRadius: 12, color: "var(--green)", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  <i className="ti ti-player-play-filled" /> Resume {timerDisplay()}
                </button>
              ) : (
                <button onClick={pauseTimer} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 12, color: "#f59e0b", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  <i className="ti ti-player-pause-filled" /> {timerDisplay()}
                </button>
              )}
              <button onClick={stopTimerAndSave} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 12, color: "var(--red)", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                <i className="ti ti-player-stop-filled" /> Stop
              </button>
            </>
          ) : (
            <button onClick={openStartTimer} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "var(--green-bg)", border: "1px solid var(--green-border)", borderRadius: 12, color: "var(--green)", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
              <i className="ti ti-player-play-filled" /> Start Timer
            </button>
          )}
          <button onClick={openAdd} className="btn-primary" style={{ padding: "10px 16px", fontSize: 14 }}>
            <i className="ti ti-plus" /> Log Time
          </button>
        </div>
      </div>

      <div className="stat-grid-4">
        {[
          { label: "Total Hours", val: fmtDuration(totalMins), color: "var(--accent2)", icon: "ti-clock" },
          { label: "Entries", val: filtered.length, color: "var(--blue)", icon: "ti-list" },
          { label: "Team Members", val: memberSummary.length, color: "var(--green)", icon: "ti-users" },
          { label: "Avg per Entry", val: filtered.length ? fmtDuration(Math.round(totalMins / filtered.length)) : "—", color: "var(--amber)", icon: "ti-chart-bar" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px" }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: `${s.color}18`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: "-0.6px", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.03)", padding: 5, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 20, width: "fit-content" }}>
        {(["log", "summary"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ padding: "7px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", background: activeTab === t ? "rgba(255,255,255,0.08)" : "transparent", color: activeTab === t ? "var(--text)" : "var(--text3)", textTransform: "capitalize" }}>{t === "log" ? "Time Log" : "Summary"}</button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {isAdmin && (
          <select value={filterMember} onChange={e => setFilterMember(e.target.value)} style={SS}>
            <option value="All">All Members</option>
            {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        )}
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={SS}>
          <option value="All">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={SS}>
          <option value="All">All Categories</option>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...SS, cursor: "text" }} />
        {(filterMember !== "All" || filterClient !== "All" || filterCategory !== "All" || filterDate) && (
          <button onClick={() => { setFilterMember("All"); setFilterClient("All"); setFilterCategory("All"); setFilterDate(""); }} style={{ ...SS, color: "var(--red)", borderColor: "var(--red-border)" }}>
            <i className="ti ti-x" /> Clear
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} />
          <div style={{ marginTop: 12, fontSize: 15 }}>Loading timesheet...</div>
        </div>
      ) : activeTab === "summary" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {memberSummary.length === 0 ? (
            <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 60, color: "var(--text3)" }}>
              <i className="ti ti-clock-off" style={{ fontSize: 40, opacity: .2 }} />
              <div style={{ marginTop: 12, fontSize: 15 }}>No time logged yet</div>
            </div>
          ) : memberSummary.map((m, i) => (
            <div key={i} className="crm-card" style={{ padding: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: m.color || "#5646e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{m.name[0]}</div>
                <div>
                  <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 16 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{m.count} entries · {fmtDuration(m.mins)} total</div>
                </div>
                <div style={{ marginLeft: "auto", fontSize: 22, fontWeight: 800, color: "var(--accent2)" }}>{fmtDuration(m.mins)}</div>
              </div>
              <div style={{ display: "flex", height: 8, borderRadius: 6, overflow: "hidden", marginBottom: 14, gap: 2 }}>
                {m.byCategory.map((bc: any, j: number) => (
                  <div key={j} title={`${bc.cat}: ${fmtDuration(bc.mins)}`} style={{ flex: bc.mins, background: categoryColor[bc.cat] || "#5646e0", minWidth: 4, borderRadius: 3 }} />
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {m.byCategory.map((bc: any, j: number) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: categoryColor[bc.cat] || "#5646e0", flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: "var(--text2)", flex: 1 }}>{bc.cat}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{fmtDuration(bc.mins)}</span>
                    <span style={{ fontSize: 11, color: "var(--text3)", width: 36, textAlign: "right" }}>{Math.round((bc.mins / m.mins) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", background: "rgba(255,255,255,0.01)" }}>
          <div className="table-scroll">
          <table className="crm-table" style={{ width: "100%", minWidth: 640 }}>
            <thead>
              <tr>{["Member", "Task", "Client", "Category", "Date", "Time", "Duration", "Actions"].map((h, i) => <th key={i}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const isActive = e.id === runningEntryId; // this user's own running timer
                const isLive = e.start_time && !e.end_time; // any in-progress entry (own or another member's)
                return (
                  <tr key={e.id} style={isLive ? { background: "rgba(74,222,128,0.04)", outline: "1px solid rgba(74,222,128,0.15)" } : {}}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: memberColor[e.member_name] || "#5646e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{e.member_name?.[0] || "?"}</div>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{e.member_name}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {isLive && !isActive && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>● Live</span>}
                        {isActive && !timerPaused && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>● Live</span>}
                        {isActive && timerPaused && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(251,191,36,0.15)", color: "#f59e0b", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 6, padding: "2px 7px", whiteSpace: "nowrap" }}>⏸ Paused</span>}
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{e.task_title}</div>
                          {e.notes && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{e.notes}</div>}
                        </div>
                      </div>
                    </td>
                    <td><span style={{ fontSize: 12, color: "var(--text3)", background: "rgba(255,255,255,0.05)", padding: "3px 10px", borderRadius: 8, border: "1px solid var(--border)" }}>{e.client || "—"}</span></td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: categoryColor[e.category] || "#5646e0", padding: "3px 10px", borderRadius: 20 }}>{e.category}</span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text2)" }}>
                      {e.date ? new Date(e.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text2)" }}>
                      {e.start_time
                        ? (e.end_time ? `${fmtTime(e.start_time)} – ${fmtTime(e.end_time)}` : `${fmtTime(e.start_time)} –`)
                        : "—"}
                    </td>
                    <td>
                      {isActive
                        ? <span style={{ fontSize: 13, fontWeight: 700, color: "#4ade80" }}>{timerDisplay()}</span>
                        : isLive
                          ? <span style={{ fontSize: 14, fontWeight: 700, color: "#4ade80" }}>{fmtDuration(calcElapsedMins(e.date, e.start_time))}</span>
                          : <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent2)" }}>{fmtDuration(e.duration_mins)}</span>}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => openEdit(e)} style={{ background: isActive ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${isActive ? "rgba(74,222,128,0.3)" : "var(--border2)"}`, borderRadius: 8, padding: "6px 10px", color: isActive ? "#4ade80" : "var(--blue)", cursor: "pointer", fontSize: 14 }} title={isActive ? "End timer & save" : "Edit"}>
                          <i className={isActive ? "ti ti-player-stop" : "ti ti-pencil"} />
                        </button>
                        <button onClick={() => setDeleteConfirm(e.id)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--red)", cursor: "pointer", fontSize: 14 }}><i className="ti ti-trash" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
              <i className="ti ti-clock" style={{ fontSize: 40, opacity: .2 }} />
              <div style={{ marginTop: 12, fontSize: 15 }}>No time entries yet — log your first!</div>
            </div>
          )}
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div onClick={() => setShowModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 520, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>
                {modalMode === "start-timer" ? "Start Timer" : modalMode === "edit" ? "Edit Entry" : "Log Time"}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>

            {/* Start-timer hint */}
            {modalMode === "start-timer" && (
              <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
                <i className="ti ti-player-play-filled" style={{ color: "#4ade80", fontSize: 18 }} />
                <div style={{ fontSize: 13, color: "var(--text2)" }}>
                  <strong style={{ color: "#4ade80" }}>Fill in what you're working on</strong> — timer starts after you save. You can close this and come back.
                </div>
              </div>
            )}

            {/* Running-entry hint */}
            {isRunningEntry && (
              <div style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 12, padding: "12px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
                <i className="ti ti-clock-play" style={{ color: "#4ade80", fontSize: 20 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#4ade80" }}>Timer running — {timerDisplay()}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Click "End Timer & Save" when done. Or "Save Changes" to update details without stopping.</div>
                </div>
              </div>
            )}

            {saveError && (
              <div style={{ marginBottom: 16, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, fontSize: 13, color: "var(--red)" }}>
                ⚠ {saveError}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Task / Work Done *</label>
                <input value={form.task_title} onChange={e => setForm({ ...form, task_title: e.target.value })} placeholder="e.g. Edited 3 reels for Ozmo" style={IS} autoFocus />
              </div>
              <div>
                <label style={LS}>Team Member *</label>
                <select value={form.member_name} onChange={e => setForm({ ...form, member_name: e.target.value })} style={IS}>
                  <option value="">Select member...</option>
                  {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Client</label>
                <select value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} style={IS}>
                  <option value="">No client / Internal</option>
                  {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Category</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={IS}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Date</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={IS} />
              </div>

              {/* Start-timer mode: locked start time, no end time */}
              {modalMode === "start-timer" && (
                <div>
                  <label style={LS}>Start Time <span style={{ color: "#4ade80" }}>● Auto</span></label>
                  <div style={{ ...IS, display: "flex", alignItems: "center", gap: 8, opacity: 0.8, cursor: "default" }}>
                    <i className="ti ti-lock" style={{ fontSize: 13, color: "var(--text3)" }} />
                    <span style={{ fontWeight: 700, color: "#4ade80" }}>{fmtTime(form.start_time)}</span>
                    <span style={{ fontSize: 11, color: "var(--text3)" }}>set to now</span>
                  </div>
                </div>
              )}

              {/* Edit / log-manual mode: editable start + end times */}
              {modalMode !== "start-timer" && (
                <>
                  <div>
                    <label style={LS}>Start Time</label>
                    <input type="time" value={form.start_time} onChange={e => handleTimeChange("start_time", e.target.value)} style={IS} />
                  </div>
                  <div>
                    <label style={LS}>End Time</label>
                    <input type="time" value={form.end_time} onChange={e => handleTimeChange("end_time", e.target.value)} style={IS} />
                  </div>
                  <div>
                    <label style={LS}>Duration (auto-calculated)</label>
                    <div style={{ ...IS, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "default", opacity: form.duration_mins ? 1 : 0.5 }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent2)" }}>
                        {form.duration_mins ? fmtDuration(Number(form.duration_mins)) : "Set start & end time"}
                      </span>
                      {form.duration_mins && <span style={{ fontSize: 12, color: "var(--text3)" }}>{form.duration_mins} min</span>}
                    </div>
                  </div>
                </>
              )}

              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any details about this work…" rows={2} style={{ ...IS, resize: "vertical" as const }} />
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              {modalMode === "start-timer" && (
                <button onClick={saveAndStartTimer} disabled={saving} className="btn-primary" style={{ flex: 1, justifyContent: "center", padding: 13, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
                  <i className="ti ti-player-play-filled" /> {saving ? "Starting..." : "Save & Start Timing"}
                </button>
              )}
              {isRunningEntry && (
                <>
                  <button onClick={endTimerAndSave} disabled={saving} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 13, fontSize: 15, background: "var(--red)", border: "none", borderRadius: 12, color: "#fff", fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
                    <i className="ti ti-player-stop-filled" /> {saving ? "Saving..." : "End Timer & Save"}
                  </button>
                  <button onClick={saveEntry} disabled={saving} className="btn-ghost" style={{ justifyContent: "center", padding: "13px 18px", fontSize: 14, opacity: saving ? 0.7 : 1 }}>
                    Save Changes
                  </button>
                </>
              )}
              {!isRunningEntry && modalMode !== "start-timer" && (
                <button onClick={saveEntry} disabled={saving} className="btn-primary" style={{ flex: 1, justifyContent: "center", padding: 13, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
                  {saving ? "Saving..." : editingId ? "Save Changes" : "Log Time"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 340, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🗑️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete Entry?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={() => deleteEntry(deleteConfirm!)} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
