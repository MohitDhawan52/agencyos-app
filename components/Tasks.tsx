"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { orgName } from "@/lib/org";
import { createNotification } from "./NotificationBell";
import TaskComments from "./TaskComments";

const STATUS_OPTIONS = ["To Do", "In Progress", "Review", "Done", "Overdue"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const DATE_FILTER_OPTIONS = ["All Dates", "Today", "This Week", "This Month", "Overdue"];

const priorityStyle: Record<string, { color: string; bg: string; border: string }> = {
  High:   { color: "var(--red)",   bg: "var(--red-bg)",   border: "var(--red-border)" },
  Medium: { color: "var(--amber)", bg: "var(--amber-bg)", border: "var(--amber-border)" },
  Low:    { color: "var(--green)", bg: "var(--green-bg)", border: "var(--green-border)" },
};
const statusStyle: Record<string, { color: string; bg: string }> = {
  "To Do":       { color: "var(--text2)",   bg: "rgba(255,255,255,0.05)" },
  "In Progress": { color: "var(--blue)",    bg: "var(--blue-bg)" },
  "Review":      { color: "var(--accent2)", bg: "var(--accent-bg)" },
  "Done":        { color: "var(--green)",   bg: "var(--green-bg)" },
  "Overdue":     { color: "var(--red)",     bg: "var(--red-bg)" },
};

const emptyForm = {
  title: "", client: "", priority: "High",
  assignees: [] as string[], due: "", status: "To Do", flagged: false,
};



export default function Tasks({ profile, isAdmin }: { profile: any; isAdmin: boolean }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [filterClient, setFilterClient] = useState("All Clients");
  const [filterAssignee, setFilterAssignee] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterDate, setFilterDate] = useState("All Dates");
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [prevAssignees, setPrevAssignees] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"active" | "done" | "board" | "standup">("active");
  const [saveError, setSaveError] = useState("");
  const [boardTasks, setBoardTasks] = useState<any[]>([]);
  const [filterBoardAssignee, setFilterBoardAssignee] = useState("All");
  const [filterBoardPriority, setFilterBoardPriority] = useState("All");
  const [filterBoardDate, setFilterBoardDate] = useState("All Dates");
  const [filterBoardColumn, setFilterBoardColumn] = useState("All");
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [boardEditForm, setBoardEditForm] = useState<any>({});
  const [showBoardModal, setShowBoardModal] = useState(false);
  const [boardSaveError, setBoardSaveError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [commentTaskId, setCommentTaskId] = useState<string | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => { fetchTasks(); fetchTeam(); fetchClients(); fetchBoardTasks(); fetchCommentCounts(); }, []);

  const fetchCommentCounts = async () => {
    const { data } = await supabase.from("task_comments").select("task_id, read_by, user_name");
    if (data) {
      const counts: Record<string, number> = {};
      const myName = profile?.name;
      data.forEach((r: any) => {
        // Count as unread if my name is not in read_by (works for both sender and receiver)
        if (myName && !(r.read_by || []).includes(myName)) {
          counts[r.task_id] = (counts[r.task_id] || 0) + 1;
        }
      });
      setCommentCounts(counts);
    }
  };

  useEffect(() => {
    const ch = supabase.channel("tasks-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => fetchTasks())
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, () => fetchCommentCounts())
      .subscribe();
    // Fallback poll every 2 min in case realtime WebSocket drops
    const poll = setInterval(() => fetchTasks(), 2 * 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, []);

  const fetchTasks = async () => {
    setLoading(true);
    let query = supabase.from("tasks").select("*")
      .order("flagged", { ascending: false })
      .order("position", { ascending: true, nullsFirst: false })
      .order("due", { ascending: true, nullsFirst: false });
    if (!isAdmin && profile?.name) query = query.contains("assignees", [profile.name]);
    let { data, error } = await query;
    if (error) {
      // flagged/position columns don't exist yet — fall back to simple fetch
      let fallback = supabase.from("tasks").select("*").order("due", { ascending: true, nullsFirst: false });
      if (!isAdmin && profile?.name) fallback = fallback.contains("assignees", [profile.name]);
      const res = await fallback;
      data = res.data;
    }
    if (data) setTasks(data);
    setLoading(false);
  };

  const fetchTeam = async () => {
    const { data } = await supabase.from("profiles").select("id, name, color").neq("status", "left").order("created_at");
    if (data) setTeamMembers(data);
  };

  const fetchClients = async () => {
    let { data } = await supabase.from("clients").select("name").eq("status", "Active").order("name");
    if (!data || data.length === 0) {
      const res = await supabase.from("contacts").select("name").order("name");
      data = res.data;
    }
    setClients([orgName(), ...(data || []).map((c: any) => c.name).filter(Boolean)]);
  };

  const fetchBoardTasks = async () => {
    const { data } = await supabase.from("board_tasks").select("*").order("created_at", { ascending: false });
    if (data) {
      const sorted = [...data].sort((a, b) => {
        if (a.flagged && !b.flagged) return -1;
        if (!a.flagged && b.flagged) return 1;
        return 0;
      });
      if (!isAdmin && profile?.name) {
        setBoardTasks(sorted.filter(t => {
          const names: string[] = t.assignee?.split(", ").filter(Boolean) || [];
          return names.includes(profile.name);
        }));
      } else {
        setBoardTasks(sorted);
      }
    }
  };

  const sortTasks = (list: any[]) => [...list].sort((a, b) => {
    if (a.flagged && !b.flagged) return -1;
    if (!a.flagged && b.flagged) return 1;
    const posA = a.position ?? 9999999;
    const posB = b.position ?? 9999999;
    if (posA !== posB) return posA - posB;
    if (a.due && b.due) return new Date(a.due).getTime() - new Date(b.due).getTime();
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });

  const toggleFlag = async (id: string, current: boolean) => {
    const newVal = !current;
    await supabase.from("tasks").update({ flagged: newVal }).eq("id", id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, flagged: newVal } : t));
  };

  const toggleBoardFlag = async (id: string, current: boolean) => {
    const newVal = !current;
    await supabase.from("board_tasks").update({ flagged: newVal }).eq("id", id);
    setBoardTasks(prev => prev.map(t => t.id === id ? { ...t, flagged: newVal } : t));
  };

  const openBoardEdit = (t: any) => {
    setEditingBoardId(t.id);
    setBoardEditForm({ ...t, boardAssignees: t.assignee?.split(", ").filter(Boolean) || [] });
    setShowBoardModal(true);
  };

  const toggleBoardAssignee = (name: string) => {
    setBoardEditForm((prev: any) => {
      const cur: string[] = prev.boardAssignees || [];
      return { ...prev, boardAssignees: cur.includes(name) ? cur.filter((n: string) => n !== name) : [...cur, name] };
    });
  };

  const saveBoardTask = async () => {
    if (!editingBoardId || !boardEditForm.title?.trim()) return;
    setBoardSaveError("");
    const taskId = editingBoardId;
    const targetColumn = boardEditForm.column_id;
    const payload = {
      title: boardEditForm.title,
      priority: boardEditForm.priority,
      due: boardEditForm.due || null,
      client: boardEditForm.client,
      column_id: targetColumn,
      assignee: (boardEditForm.boardAssignees || []).join(", "),
      flagged: boardEditForm.flagged || false,
    };
    console.log("[BoardSave] Updating task", taskId, "→ column:", targetColumn);
    const { data, error } = await supabase
      .from("board_tasks")
      .update(payload)
      .eq("id", taskId)
      .select("id, column_id, title");
    console.log("[BoardSave] Result:", { data, error });
    if (error) { setBoardSaveError(`DB error: ${error.message} (code: ${error.code})`); return; }
    if (!data || data.length === 0) {
      setBoardSaveError(`Blocked: 0 rows updated. ID="${taskId}" column="${targetColumn}" — check RLS policy in Supabase`);
      return;
    }
    console.log("[BoardSave] Success — DB column is now:", data[0].column_id);
    setShowBoardModal(false);
    setEditingBoardId(null);
    // Always re-fetch from DB so local state matches reality
    await fetchBoardTasks();
  };

  const memberByName = teamMembers.reduce((acc, m) => { acc[m.name] = m; return acc; }, {} as Record<string, any>);
  const assigneeColor = teamMembers.reduce((acc, m) => { acc[m.name] = m.color; return acc; }, {} as Record<string, string>);

  const getAssignees = (t: any): string[] => {
    if (Array.isArray(t.assignees)) return t.assignees;
    if (typeof t.assignees === "string" && t.assignees) return t.assignees.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (t.assignee) return [t.assignee];
    return [];
  };

  const matchesDateFilter = (t: any) => {
    if (filterDate === "All Dates") return true;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!t.due) return false;
    const due = new Date(t.due);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    if (filterDate === "Today") return dueDay.getTime() === today.getTime();
    if (filterDate === "This Week") {
      const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
      return dueDay >= today && dueDay <= weekEnd;
    }
    if (filterDate === "This Month") return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear();
    if (filterDate === "Overdue") return dueDay < today && !t.done;
    return true;
  };

  // Split tasks — flagged always rises to top within each group
  const activeTasks = sortTasks(tasks.filter(t => !t.done));
  const doneTasks   = sortTasks(tasks.filter(t => t.done));

  const applyFilters = (list: any[]) => list.filter(t =>
    (!filterFlagged || t.flagged) &&
    (filterClient === "All Clients" || t.client === filterClient) &&
    (filterAssignee === "All" || getAssignees(t).includes(filterAssignee)) &&
    (filterStatus === "All" || t.status === filterStatus) &&
    matchesDateFilter(t) &&
    t.title.toLowerCase().includes(search.toLowerCase())
  );

  const filtered = activeTab === "active" ? applyFilters(activeTasks) : applyFilters(doneTasks);

  const handleDrop = async (dropTargetId: string) => {
    if (!dragId || dragId === dropTargetId) { setDragId(null); setDropId(null); return; }
    const fromIdx = filtered.findIndex(t => t.id === dragId);
    const toIdx   = filtered.findIndex(t => t.id === dropTargetId);
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); setDropId(null); return; }
    const reordered = [...filtered];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const updates = reordered.map((t, idx) => ({ id: t.id, position: (idx + 1) * 10 }));
    setTasks(prev => {
      const posMap = new Map(updates.map(u => [u.id, u.position]));
      return prev.map(t => posMap.has(t.id) ? { ...t, position: posMap.get(t.id) } : t);
    });
    await Promise.all(updates.map(u => supabase.from("tasks").update({ position: u.position }).eq("id", u.id)));
    setDragId(null); setDropId(null);
  };

  const filteredBoardTasks = boardTasks.filter(t => {
    const names: string[] = t.assignee?.split(", ").filter(Boolean) || [];
    if (filterBoardAssignee !== "All" && !names.includes(filterBoardAssignee)) return false;
    if (filterBoardPriority !== "All" && t.priority !== filterBoardPriority) return false;
    if (filterBoardColumn !== "All" && t.column_id !== filterBoardColumn) return false;
    if (filterBoardDate !== "All Dates") {
      if (!t.due) return false;
      const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const due = new Date(t.due); const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      if (filterBoardDate === "Today" && dueDay.getTime() !== today.getTime()) return false;
      if (filterBoardDate === "This Week") { const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7); if (!(dueDay >= today && dueDay <= weekEnd)) return false; }
      if (filterBoardDate === "Overdue" && !(dueDay < today)) return false;
    }
    return true;
  });

  const counts = {
    total:      tasks.length,
    inprogress: activeTasks.filter(t => t.status === "In Progress").length,
    overdue:    activeTasks.filter(t => t.status === "Overdue" || (t.due && new Date(t.due) < new Date())).length,
    done:       doneTasks.length,
    flagged:    activeTasks.filter(t => t.flagged).length,
  };

  const openAdd = () => {
    setEditingId(null); setPrevAssignees([]);
    setForm({ ...emptyForm, client: clients[0] || "", assignees: [] });
    setShowModal(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    const current = getAssignees(t);
    setPrevAssignees(current);
    setForm({ ...t, assignees: current, due: t.due || "" });
    setShowModal(true);
  };

  const toggleAssignee = (name: string) => {
    setForm((prev: any) => {
      const current: string[] = prev.assignees || [];
      return { ...prev, assignees: current.includes(name) ? current.filter((n: string) => n !== name) : [...current, name] };
    });
  };

  const saveTask = async () => {
    if (!form.title.trim()) return;
    setSaveError("");
    const assignees: string[] = form.assignees || [];
    const payload = {
      title: form.title, client: form.client, priority: form.priority,
      assignees, assignee: assignees[0] || "",
      due: form.due || null, status: form.status, done: form.status === "Done",
      flagged: form.flagged || false,
    };
    const isNewTask = !editingId;
    if (editingId) {
      const { error } = await supabase.from("tasks").update(payload).eq("id", editingId);
      if (error) { setSaveError(error.message); return; }
    } else {
      const { error } = await supabase.from("tasks").insert([payload]);
      if (error) { setSaveError(error.message); return; }
    }
    const newlyAdded = isNewTask ? assignees : assignees.filter(n => !prevAssignees.includes(n));
    for (const name of newlyAdded) {
      const member = memberByName[name];
      if (!member?.id) continue;
      const notifTitle = isNewTask ? "New task assigned to you 📋" : "Task reassigned to you 📋";
      const notifBody = `${form.title} · ${form.client} · ${form.priority} priority`;
      await createNotification({ userId: member.id, type: "task", title: notifTitle, body: notifBody, meta: { task_title: form.title } });
    }
    setShowModal(false);
    fetchTasks();
  };

  const toggleDone = async (id: string, currentDone: boolean, task: any) => {
    const newDone = !currentDone;
    await supabase.from("tasks").update({ done: newDone, status: newDone ? "Done" : "In Progress" }).eq("id", id);
    if (newDone) {
      for (const name of getAssignees(task)) {
        const member = memberByName[name];
        if (!member?.id) continue;
        await createNotification({ userId: member.id, type: "task", title: "Task completed ✓", body: task.title, meta: { task_title: task.title } });
        }
      // Switch to done tab so user sees it move
      setActiveTab("done");
    }
    fetchTasks();
  };

  const updateStatus = async (id: string, status: string) => {
    const isDone = status === "Done";
    await supabase.from("tasks").update({ status, done: isDone }).eq("id", id);
    if (isDone) setActiveTab("done");
    fetchTasks();
  };

  const deleteTask = async (id: string) => {
    await supabase.from("tasks").delete().eq("id", id);
    setDeleteConfirm(null);
    fetchTasks();
  };

  const IS = { width: "100%", background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "#ffffff", fontFamily: "inherit", fontSize: 14, outline: "none" } as React.CSSProperties;
  const LS = { fontSize: 11, fontWeight: 600 as const, color: "var(--text3)", display: "block" as const, marginBottom: 7, textTransform: "uppercase" as const, letterSpacing: ".6px" };
  const SS = { background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 10, padding: "9px 14px", color: "#ffffff", fontFamily: "inherit", fontSize: 13, outline: "none", cursor: "pointer" } as React.CSSProperties;

  const formatDue = (due: string) => {
    if (!due) return "—";
    const d = new Date(due);
    const today = new Date();
    const diff = Math.floor((d.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff <= 7) return `${diff}d left`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const isDueSoon = (due: string, done: boolean) => {
    if (!due || done) return false;
    const diff = Math.floor((new Date(due).getTime() - Date.now()) / 86400000);
    return diff <= 2;
  };

  return (
    <div className="page-wrap">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Tasks</div>
          <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 4 }}>
            {counts.inprogress} in progress · {counts.overdue} overdue · {counts.done} done{counts.flagged > 0 ? ` · 🚩 ${counts.flagged} flagged` : ""}
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary" style={{ padding: "10px 20px", fontSize: 14 }}>
          <i className="ti ti-plus" /> New Task
        </button>
      </div>

      {/* Stats */}
      <div className="stat-grid-4">
        {[
          { label: "Total Tasks", val: counts.total,      color: "var(--text)",  icon: "ti-list"          },
          { label: "In Progress", val: counts.inprogress, color: "var(--blue)",  icon: "ti-player-play"   },
          { label: "Overdue",     val: counts.overdue,    color: "var(--red)",   icon: "ti-alert-circle"  },
          { label: "Completed",   val: counts.done,       color: "var(--green)", icon: "ti-circle-check"  },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px" }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: `${s.color}18`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, letterSpacing: "-0.6px", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Active / Done / D2C Board Tabs ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, overflowX: "auto", WebkitOverflowScrolling: "touch" as any }}>
        <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 12, padding: 4, gap: 4 }}>
          <button
            onClick={() => setActiveTab("active")}
            style={{ padding: "8px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
              background: activeTab === "active" ? "var(--accent)" : "transparent",
              color:      activeTab === "active" ? "#fff" : "var(--text2)" }}
          >
            <i className="ti ti-list-check" style={{ marginRight: 6 }} />
            Active <span style={{ marginLeft: 6, fontSize: 11, background: activeTab === "active" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)", padding: "2px 7px", borderRadius: 20, fontWeight: 700 }}>{activeTasks.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("done")}
            style={{ padding: "8px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
              background: activeTab === "done" ? "var(--green)" : "transparent",
              color:      activeTab === "done" ? "#fff" : "var(--text2)" }}
          >
            <i className="ti ti-circle-check" style={{ marginRight: 6 }} />
            Done <span style={{ marginLeft: 6, fontSize: 11, background: activeTab === "done" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)", padding: "2px 7px", borderRadius: 20, fontWeight: 700 }}>{doneTasks.length}</span>
          </button>
          <button
            onClick={() => { setActiveTab("board"); fetchBoardTasks(); }}
            style={{ padding: "8px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
              background: activeTab === "board" ? "#6366f1" : "transparent",
              color:      activeTab === "board" ? "#fff" : "var(--text2)" }}
          >
            <i className="ti ti-layout-kanban" style={{ marginRight: 6 }} />
            D2C Board <span style={{ marginLeft: 6, fontSize: 11, background: activeTab === "board" ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)", padding: "2px 7px", borderRadius: 20, fontWeight: 700 }}>{boardTasks.length}</span>
          </button>
          <button
            onClick={() => setActiveTab("standup")}
            style={{ padding: "8px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
              background: activeTab === "standup" ? "#f59e0b" : "transparent",
              color:      activeTab === "standup" ? "#fff" : "var(--text2)" }}
          >
            <i className="ti ti-sun" style={{ marginRight: 6 }} />
            Standup
          </button>
        </div>
      </div>

      {/* ── D2C Board Tasks ── */}
      {activeTab === "board" && (() => {
        const BOARD_COL_NAMES: Record<string, string> = { task: "Task", inprogress: "In Progress", review: "Review", done: "Done", backlog: "Backlog" };
        const BOARD_COL_COLORS: Record<string, string> = { task: "#60a5fa", inprogress: "#fbbf24", review: "#a78bfa", done: "#4ade80", backlog: "#94a3b8" };
        const hasFilter = filterBoardAssignee !== "All" || filterBoardPriority !== "All" || filterBoardDate !== "All Dates" || filterBoardColumn !== "All";
        return (
          <>
            {/* Board Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <select value={filterBoardColumn} onChange={e => setFilterBoardColumn(e.target.value)} style={SS}>
                <option value="All">All Columns</option>
                {Object.entries(BOARD_COL_NAMES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
              {isAdmin && (
                <select value={filterBoardAssignee} onChange={e => setFilterBoardAssignee(e.target.value)} style={SS}>
                  <option value="All">All Assignees</option>
                  {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              )}
              <select value={filterBoardPriority} onChange={e => setFilterBoardPriority(e.target.value)} style={SS}>
                <option value="All">All Priorities</option>
                {["High", "Medium", "Low"].map(p => <option key={p}>{p}</option>)}
              </select>
              <select value={filterBoardDate} onChange={e => setFilterBoardDate(e.target.value)} style={{ ...SS, borderColor: filterBoardDate !== "All Dates" ? "var(--accent)" : "var(--border2)", color: filterBoardDate !== "All Dates" ? "var(--accent2)" : "#fff" }}>
                {DATE_FILTER_OPTIONS.map(d => <option key={d}>{d}</option>)}
              </select>
              {hasFilter && (
                <button onClick={() => { setFilterBoardAssignee("All"); setFilterBoardPriority("All"); setFilterBoardDate("All Dates"); setFilterBoardColumn("All"); }}
                  style={{ padding: "9px 14px", borderRadius: 10, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
                  <i className="ti ti-x" /> Clear
                </button>
              )}
              <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text3)" }}>
                {filteredBoardTasks.length} of {boardTasks.length} tasks
              </span>
            </div>

            {/* Board Table */}
            <div className="table-scroll">
            <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", background: "rgba(255,255,255,0.01)", minWidth: 560 }}>
              {boardTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
                  <i className="ti ti-layout-kanban" style={{ fontSize: 40, opacity: .2 }} />
                  <div style={{ marginTop: 12, fontSize: 15 }}>No open D2C Board tasks</div>
                </div>
              ) : filteredBoardTasks.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
                  <i className="ti ti-filter-off" style={{ fontSize: 40, opacity: .2 }} />
                  <div style={{ marginTop: 12, fontSize: 15 }}>No tasks match filters</div>
                </div>
              ) : (
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Client</th>
                      <th>Column</th>
                      <th>Priority</th>
                      <th>Assignees</th>
                      <th>Due Date</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBoardTasks.map(t => {
                      const ps = priorityStyle[t.priority];
                      const colName = BOARD_COL_NAMES[t.column_id] || t.column_id;
                      const colColor = BOARD_COL_COLORS[t.column_id] || "#94a3b8";
                      const taskAssignees: string[] = t.assignee?.split(", ").filter(Boolean) || [];
                      const isOverdue = t.due && new Date(t.due) < new Date();
                      return (
                        <tr key={t.id}>
                          <td><span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{t.title}</span></td>
                          <td><span style={{ fontSize: 12, color: "var(--text3)", background: "rgba(255,255,255,0.05)", padding: "3px 10px", borderRadius: 8, border: "1px solid var(--border)", fontWeight: 500 }}>{t.client || "—"}</span></td>
                          <td>
                            <select
                              value={t.column_id}
                              onChange={async e => {
                                const newCol = e.target.value;
                                const { error } = await supabase.from("board_tasks").update({ column_id: newCol }).eq("id", t.id);
                                if (error) {
                                  alert("Save failed: " + error.message + " | code: " + error.code);
                                } else {
                                  setBoardTasks(prev => prev.map(bt => bt.id === t.id ? { ...bt, column_id: newCol } : bt));
                                }
                              }}
                              style={{ fontSize: 12, padding: "4px 11px", borderRadius: 20, fontWeight: 600, background: `${colColor}18`, color: colColor, border: `1px solid ${colColor}40`, cursor: "pointer", outline: "none", fontFamily: "inherit" }}
                            >
                              {Object.entries(BOARD_COL_NAMES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                            </select>
                          </td>
                          <td>{ps ? <span style={{ background: ps.bg, color: ps.color, fontSize: 12, padding: "4px 11px", borderRadius: 20, fontWeight: 600, border: `1px solid ${ps.border}` }}>{t.priority}</span> : <span style={{ color: "var(--text3)", fontSize: 13 }}>—</span>}</td>
                          <td>
                            {taskAssignees.length === 0 ? <span style={{ fontSize: 13, color: "var(--text3)" }}>—</span> : (
                              <div style={{ display: "flex", alignItems: "center" }}>
                                {taskAssignees.slice(0, 3).map((name, idx) => (
                                  <div key={name} title={name} style={{ width: 26, height: 26, borderRadius: 7, background: assigneeColor[name] || "#5646e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", border: "2px solid var(--bg)", marginLeft: idx === 0 ? 0 : -8, zIndex: taskAssignees.length - idx, position: "relative" }}>{name[0]}</div>
                                ))}
                                {taskAssignees.length > 3 && <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(255,255,255,0.1)", border: "2px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--text2)", marginLeft: -8, position: "relative" }}>+{taskAssignees.length - 3}</div>}
                                {taskAssignees.length === 1 && <span style={{ fontSize: 13, color: "var(--text2)", marginLeft: 8 }}>{taskAssignees[0]}</span>}
                              </div>
                            )}
                          </td>
                          <td>
                            <span style={{ fontSize: 13, fontWeight: isOverdue ? 700 : 400, color: isOverdue ? "var(--red)" : t.due ? "var(--text2)" : "var(--text3)", background: isOverdue ? "var(--red-bg)" : "transparent", padding: isOverdue ? "3px 8px" : "0", borderRadius: 6, border: isOverdue ? "1px solid var(--red-border)" : "none" }}>
                              {formatDue(t.due)}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => toggleBoardFlag(t.id, t.flagged)} title={t.flagged ? "Remove flag" : "Flag as urgent"}
                                style={{ background: t.flagged ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${t.flagged ? "rgba(239,68,68,0.35)" : "var(--border2)"}`, borderRadius: 8, padding: "6px 10px", color: t.flagged ? "#ef4444" : "var(--text3)", cursor: "pointer", fontSize: 14 }}>
                                <i className={`ti ${t.flagged ? "ti-flag-filled" : "ti-flag"}`} />
                              </button>
                              <button onClick={() => openBoardEdit(t)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--blue)", cursor: "pointer", fontSize: 14 }}>
                                <i className="ti ti-pencil" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            </div>
          </>
        );
      })()}

      {/* ── Daily Standup View ── */}
      {activeTab === "standup" && (() => {
        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];
        const dayName = today.toLocaleDateString("en-IN", { weekday: "long" });
        const dateStr = today.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

        const allActive = tasks.filter(t => !t.done);
        const todayTasks = allActive.filter(t =>
          t.due === todayStr ||
          t.status === "In Progress" ||
          (t.due && t.due < todayStr && t.status !== "Done")
        );

        // Group by assignee
        const grouped: Record<string, any[]> = {};
        for (const t of todayTasks) {
          const names: string[] = t.assignees?.length ? t.assignees : (t.assignee ? [t.assignee] : ["Unassigned"]);
          for (const name of names) {
            if (!grouped[name]) grouped[name] = [];
            grouped[name].push(t);
          }
        }

        const getTaskColor = (t: any) => {
          if (t.status === "Done") return { color: "#4ade80", bg: "rgba(74,222,128,0.1)", label: "Done" };
          if (t.due && t.due < todayStr) return { color: "#f87171", bg: "rgba(248,113,113,0.1)", label: "Overdue" };
          if (t.status === "In Progress") return { color: "#60a5fa", bg: "rgba(96,165,250,0.1)", label: "In Progress" };
          return { color: "var(--text3)", bg: "rgba(255,255,255,0.03)", label: t.status };
        };

        const memberOrder = teamMembers.map(m => m.name);
        const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
          const ai = memberOrder.indexOf(a), bi = memberOrder.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });

        return (
          <div>
            {/* Date header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.5px" }}>
                  <i className="ti ti-sun" style={{ marginRight: 10, color: "#f59e0b" }} />{dayName} Standup
                </div>
                <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 4 }}>{dateStr} · {todayTasks.length} tasks across {sortedGroups.length} people</div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                {[
                  { label: "In Progress", color: "#60a5fa", count: todayTasks.filter(t => t.status === "In Progress").length },
                  { label: "Due Today",   color: "#fbbf24", count: todayTasks.filter(t => t.due === todayStr && t.status !== "In Progress").length },
                  { label: "Overdue",     color: "#f87171", count: todayTasks.filter(t => t.due && t.due < todayStr).length },
                ].map(chip => chip.count > 0 && (
                  <span key={chip.label} style={{ fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 20, background: `${chip.color}18`, color: chip.color, border: `1px solid ${chip.color}40` }}>
                    {chip.count} {chip.label}
                  </span>
                ))}
              </div>
            </div>

            {sortedGroups.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text3)" }}>
                <i className="ti ti-sunshine" style={{ fontSize: 44, opacity: .2 }} />
                <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600 }}>All clear!</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>No active tasks due today or in progress.</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                {sortedGroups.map(([name, memberTasks]) => {
                  const member = teamMembers.find(m => m.name === name);
                  return (
                    <div key={name} className="crm-card" style={{ padding: 0, overflow: "hidden" }}>
                      {/* Member header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", background: member?.color ? `${member.color}12` : "rgba(255,255,255,0.03)" }}>
                        <div style={{ width: 34, height: 34, borderRadius: 10, background: member?.color || "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                          {name[0]}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{name}</div>
                          <div style={{ fontSize: 11, color: "var(--text3)" }}>{memberTasks.length} task{memberTasks.length !== 1 ? "s" : ""} today</div>
                        </div>
                        {memberTasks.some(t => t.due && t.due < todayStr) && (
                          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#f87171", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 20, padding: "2px 8px" }}>
                            <i className="ti ti-alert-triangle" style={{ marginRight: 3 }} />Overdue
                          </span>
                        )}
                      </div>
                      {/* Task list */}
                      <div style={{ padding: "8px 0" }}>
                        {memberTasks.map(t => {
                          const tc = getTaskColor(t);
                          return (
                            <div key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
                              <div style={{ width: 7, height: 7, borderRadius: "50%", background: tc.color, marginTop: 5, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</div>
                                <div style={{ display: "flex", gap: 6, marginTop: 3, flexWrap: "wrap" }}>
                                  {t.client && <span style={{ fontSize: 10, color: "var(--text3)" }}>{t.client}</span>}
                                  <span style={{ fontSize: 10, fontWeight: 700, color: tc.color }}>{tc.label}</span>
                                  {t.due && <span style={{ fontSize: 10, color: "var(--text3)" }}>Due {new Date(t.due + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
                                </div>
                              </div>
                              {t.flagged && <i className="ti ti-flag-filled" style={{ color: "#ef4444", fontSize: 12, flexShrink: 0, marginTop: 2 }} />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {activeTab !== "board" && activeTab !== "standup" && <>
      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, padding: "9px 14px", flex: 1, maxWidth: 220 }}>
          <i className="ti ti-search" style={{ color: "var(--text3)", fontSize: 16 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
            style={{ background: "none", border: "none", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%" }} />
        </div>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={SS}>
          <option value="All Clients">All Clients</option>
          {clients.map(c => <option key={c}>{c}</option>)}
        </select>
        {isAdmin && (
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={SS}>
            <option value="All">All Assignees</option>
            {teamMembers.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
          </select>
        )}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={SS}>
          <option value="All">All Status</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...SS, borderColor: filterDate !== "All Dates" ? "var(--accent)" : "var(--border2)", color: filterDate !== "All Dates" ? "var(--accent2)" : "#fff" }}>
          {DATE_FILTER_OPTIONS.map(d => <option key={d}>{d}</option>)}
        </select>
        <button onClick={() => setFilterFlagged(!filterFlagged)}
          style={{ padding: "9px 14px", borderRadius: 10, background: filterFlagged ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.04)", border: filterFlagged ? "1px solid rgba(239,68,68,0.4)" : "1px solid var(--border2)", color: filterFlagged ? "#ef4444" : "var(--text2)", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <i className={`ti ${filterFlagged ? "ti-flag-filled" : "ti-flag"}`} />Flagged
        </button>
        {(filterClient !== "All Clients" || filterAssignee !== "All" || filterStatus !== "All" || filterDate !== "All Dates" || search || filterFlagged) && (
          <button onClick={() => { setFilterClient("All Clients"); setFilterAssignee("All"); setFilterStatus("All"); setFilterDate("All Dates"); setSearch(""); setFilterFlagged(false); }}
            style={{ padding: "9px 14px", borderRadius: 10, background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", color: "#f87171", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }}>
            <i className="ti ti-x" /> Clear
          </button>
        )}
      </div>

      {filtered.length !== (activeTab === "active" ? activeTasks : doneTasks).length && (
        <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 12 }}>
          Showing {filtered.length} of {activeTab === "active" ? activeTasks.length : doneTasks.length} tasks
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} />
          <div style={{ marginTop: 12, fontSize: 15 }}>Loading tasks...</div>
        </div>
      ) : (
        <div className="table-scroll">
        <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", background: "rgba(255,255,255,0.01)", minWidth: 560 }}>
          {/* Done tab banner */}
          {activeTab === "done" && (
            <div style={{ padding: "12px 20px", background: "rgba(74,222,128,0.06)", borderBottom: "1px solid rgba(74,222,128,0.15)", display: "flex", alignItems: "center", gap: 8 }}>
              <i className="ti ti-circle-check" style={{ color: "var(--green)", fontSize: 16 }} />
              <span style={{ fontSize: 13, color: "var(--green)", fontWeight: 600 }}>{doneTasks.length} completed tasks</span>
              <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: 4 }}>— uncheck any task to move it back to Active</span>
            </div>
          )}
          <table className="crm-table">
            <thead>
              <tr>
                <th style={{ width: 24 }}></th>
                <th style={{ width: 40 }}></th>
                <th>Task</th>
                <th>Client</th>
                <th>Priority</th>
                <th>Assignees</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const ps = priorityStyle[t.priority];
                const ss = statusStyle[t.status];
                const taskAssignees = getAssignees(t);
                const dueSoon = isDueSoon(t.due, t.done);
                const isDragging = t.id === dragId;
                const isDropTarget = t.id === dropId && !isDragging;
                return (
                  <tr
                    key={t.id}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragOver={e => { e.preventDefault(); setDropId(t.id); }}
                    onDrop={() => handleDrop(t.id)}
                    onDragEnd={() => { setDragId(null); setDropId(null); }}
                    style={{
                      opacity: isDragging ? 0.35 : t.done ? 0.7 : 1,
                      background: t.flagged ? "rgba(239,68,68,0.05)" : isDropTarget ? "rgba(255,255,255,0.06)" : undefined,
                      borderLeft: t.flagged ? "3px solid #ef4444" : isDropTarget ? "3px solid var(--accent)" : "3px solid transparent",
                      transition: "background .1s, opacity .1s",
                    }}
                  >
                    <td style={{ width: 24, textAlign: "center", cursor: "grab", paddingLeft: 8, paddingRight: 0 }}>
                      <i className="ti ti-grip-vertical" style={{ fontSize: 14, color: "var(--text3)", opacity: 0.4 }} />
                    </td>
                    <td>
                      <div onClick={() => toggleDone(t.id, t.done, t)} style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${t.done ? "var(--green)" : "var(--border2)"}`, background: t.done ? "var(--green)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s" }}>
                        {t.done && <i className="ti ti-check" style={{ fontSize: 12, color: "#fff" }} />}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {t.flagged && (
                          <span style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, border: "1px solid rgba(239,68,68,0.3)", flexShrink: 0, whiteSpace: "nowrap" }}>🚩 Urgent</span>
                        )}
                        <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14, textDecoration: t.done ? "line-through" : "none", opacity: t.done ? 0.6 : 1 }}>
                          {t.title}
                        </span>
                        {commentCounts[t.id] > 0 && (
                          <button onClick={() => {
                            setCommentCounts(prev => ({ ...prev, [t.id]: 0 }));
                            setCommentTaskId(t.id);
                          }} title="View comments"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(99,102,241,0.35)", background: "rgba(99,102,241,0.12)", color: "#818cf8", cursor: "pointer", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            <i className="ti ti-message-circle" style={{ fontSize: 12 }} />{commentCounts[t.id]}
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: "var(--text3)", background: "rgba(255,255,255,0.05)", padding: "3px 10px", borderRadius: 8, border: "1px solid var(--border)", fontWeight: 500 }}>
                        {t.client || "—"}
                      </span>
                    </td>
                    <td>
                      <span style={{ background: ps?.bg, color: ps?.color, fontSize: 12, padding: "4px 11px", borderRadius: 20, fontWeight: 600, border: `1px solid ${ps?.border}` }}>
                        {t.priority}
                      </span>
                    </td>
                    <td>
                      {taskAssignees.length === 0 ? (
                        <span style={{ fontSize: 13, color: "var(--text3)" }}>—</span>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center" }}>
                          {taskAssignees.slice(0, 3).map((name, idx) => (
                            <div key={name} title={name} style={{ width: 26, height: 26, borderRadius: 7, background: assigneeColor[name] || "#5646e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", border: "2px solid var(--bg)", marginLeft: idx === 0 ? 0 : -8, zIndex: taskAssignees.length - idx, position: "relative" }}>
                              {name[0]}
                            </div>
                          ))}
                          {taskAssignees.length > 3 && (
                            <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(255,255,255,0.1)", border: "2px solid var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "var(--text2)", marginLeft: -8, position: "relative" }}>
                              +{taskAssignees.length - 3}
                            </div>
                          )}
                          {taskAssignees.length === 1 && (
                            <span style={{ fontSize: 13, color: "var(--text2)", marginLeft: 8 }}>{taskAssignees[0]}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: dueSoon ? 700 : 400, color: dueSoon ? "var(--red)" : t.done ? "var(--text3)" : "var(--text2)", background: dueSoon ? "var(--red-bg)" : "transparent", padding: dueSoon ? "3px 8px" : "0", borderRadius: 6, border: dueSoon ? "1px solid var(--red-border)" : "none" }}>
                        {formatDue(t.due)}
                      </span>
                    </td>
                    <td>
                      <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)}
                        style={{ background: ss?.bg, color: ss?.color, fontSize: 12, padding: "4px 8px", borderRadius: 20, fontWeight: 600, border: "1px solid transparent", cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => toggleFlag(t.id, t.flagged)} title={t.flagged ? "Remove flag" : "Flag as urgent"}
                          style={{ background: t.flagged ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.04)", border: `1px solid ${t.flagged ? "rgba(239,68,68,0.35)" : "var(--border2)"}`, borderRadius: 8, padding: "6px 10px", color: t.flagged ? "#ef4444" : "var(--text3)", cursor: "pointer", fontSize: 14 }}>
                          <i className={`ti ${t.flagged ? "ti-flag-filled" : "ti-flag"}`} />
                        </button>
                        <button onClick={() => setCommentTaskId(t.id)} title="Comments"
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text3)", cursor: "pointer", fontSize: 14 }}>
                          <i className="ti ti-message-circle" />
                        </button>
                        <button onClick={() => openEdit(t)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--blue)", cursor: "pointer", fontSize: 14 }}>
                          <i className="ti ti-pencil" />
                        </button>
                        <button onClick={() => setDeleteConfirm(t.id)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--red)", cursor: "pointer", fontSize: 14 }}>
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
              <i className={activeTab === "done" ? "ti ti-clipboard-check" : "ti ti-clipboard-x"} style={{ fontSize: 40, opacity: .2 }} />
              <div style={{ marginTop: 12, fontSize: 15 }}>{activeTab === "done" ? "No completed tasks yet" : "No tasks found"}</div>
            </div>
          )}
        </div>
        </div>
      )}
      </>}

      {/* Add/Edit Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 500, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>{editingId ? "Edit Task" : "New Task"}</div>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}>
                <i className="ti ti-x" style={{ fontSize: 16 }} />
              </button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Task Title *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Write reel scripts" style={IS} />
            </div>
            <div className="modal-2col">
              <div>
                <label style={LS}>Client</label>
                <select value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} style={IS}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={IS}>
                  {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={IS}>
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Deadline</label>
                <input type="date" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} style={IS} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={LS}>Assignees <span style={{ color: "var(--text3)", fontWeight: 400, textTransform: "none", fontSize: 11 }}>— select one or more</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {teamMembers.map(m => {
                  const selected = (form.assignees || []).includes(m.name);
                  return (
                    <div key={m.id} onClick={() => toggleAssignee(m.name)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${selected ? m.color : "var(--border2)"}`, background: selected ? `${m.color}18` : "rgba(255,255,255,0.03)", transition: "all .15s", userSelect: "none" }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{m.name[0]}</div>
                      <span style={{ fontSize: 13, fontWeight: selected ? 600 : 400, color: selected ? "var(--text)" : "var(--text2)" }}>{m.name}</span>
                      {selected && <i className="ti ti-check" style={{ fontSize: 12, color: m.color, marginLeft: 2 }} />}
                    </div>
                  );
                })}
              </div>
              {(form.assignees || []).length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>No assignees selected yet</div>
              )}
            </div>
            <div style={{ marginBottom: 20 }}>
              <div onClick={() => setForm({ ...form, flagged: !form.flagged })}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${form.flagged ? "rgba(239,68,68,0.5)" : "var(--border2)"}`, background: form.flagged ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)", transition: "all .15s" }}>
                <i className={`ti ${form.flagged ? "ti-flag-filled" : "ti-flag"}`} style={{ color: form.flagged ? "#ef4444" : "var(--text3)", fontSize: 20, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: form.flagged ? "#ef4444" : "var(--text)" }}>
                    {form.flagged ? "🚩 Flagged — Urgent & Important" : "Flag as Urgent & Important"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>Flagged tasks appear at top · must do today</div>
                </div>
              </div>
            </div>
            {saveError && (
              <div style={{ padding: "10px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, fontSize: 13, color: "var(--red)", marginBottom: 14 }}>
                <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{saveError}
              </div>
            )}
            <button onClick={saveTask} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15 }}>
              {editingId ? "Save Changes" : "Add Task"}
            </button>
          </div>
        </div>
      )}

      {/* Board Edit Modal */}
      {showBoardModal && (
        <div onClick={() => setShowBoardModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 500, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>Edit Board Task</div>
              <button onClick={() => setShowBoardModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}>
                <i className="ti ti-x" style={{ fontSize: 16 }} />
              </button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Task Title *</label>
              <input value={boardEditForm.title || ""} onChange={e => setBoardEditForm({ ...boardEditForm, title: e.target.value })} placeholder="Task title" style={IS} />
            </div>
            <div className="modal-2col">
              <div>
                <label style={LS}>Client</label>
                <select value={boardEditForm.client || ""} onChange={e => setBoardEditForm({ ...boardEditForm, client: e.target.value })} style={IS}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Priority</label>
                <select value={boardEditForm.priority || "Medium"} onChange={e => setBoardEditForm({ ...boardEditForm, priority: e.target.value })} style={IS}>
                  {["High", "Medium", "Low"].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Column</label>
                <select value={boardEditForm.column_id || "task"} onChange={e => setBoardEditForm({ ...boardEditForm, column_id: e.target.value })} style={IS}>
                  <option value="task">Task</option>
                  <option value="inprogress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="done">Done</option>
                  <option value="backlog">Backlog</option>
                </select>
              </div>
              <div>
                <label style={LS}>Due Date</label>
                <input type="date" value={boardEditForm.due || ""} onChange={e => setBoardEditForm({ ...boardEditForm, due: e.target.value })} style={IS} />
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={LS}>Assignees <span style={{ color: "var(--text3)", fontWeight: 400, textTransform: "none", fontSize: 11 }}>— select one or more</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {teamMembers.map(m => {
                  const selected = (boardEditForm.boardAssignees || []).includes(m.name);
                  return (
                    <div key={m.id} onClick={() => toggleBoardAssignee(m.name)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${selected ? m.color : "var(--border2)"}`, background: selected ? `${m.color}18` : "rgba(255,255,255,0.03)", transition: "all .15s", userSelect: "none" }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{m.name[0]}</div>
                      <span style={{ fontSize: 13, fontWeight: selected ? 600 : 400, color: selected ? "var(--text)" : "var(--text2)" }}>{m.name}</span>
                      {selected && <i className="ti ti-check" style={{ fontSize: 12, color: m.color, marginLeft: 2 }} />}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div onClick={() => setBoardEditForm({ ...boardEditForm, flagged: !boardEditForm.flagged })}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${boardEditForm.flagged ? "rgba(239,68,68,0.5)" : "var(--border2)"}`, background: boardEditForm.flagged ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)", transition: "all .15s" }}>
                <i className={`ti ${boardEditForm.flagged ? "ti-flag-filled" : "ti-flag"}`} style={{ color: boardEditForm.flagged ? "#ef4444" : "var(--text3)", fontSize: 20, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: boardEditForm.flagged ? "#ef4444" : "var(--text)" }}>
                    {boardEditForm.flagged ? "🚩 Flagged — Urgent & Important" : "Flag as Urgent & Important"}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>Flagged tasks appear at top · must do today</div>
                </div>
              </div>
            </div>
            {boardSaveError && (
              <div style={{ padding: "10px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, fontSize: 13, color: "var(--red)", marginBottom: 14 }}>
                <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{boardSaveError}
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowBoardModal(false)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 12, fontSize: 14 }}>Cancel</button>
              <button onClick={saveBoardTask} className="btn-primary" style={{ flex: 2, padding: 12, fontSize: 14 }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm !== null && (
        <div onClick={() => setDeleteConfirm(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 360, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>&#128465;</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete Task?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24 }}>This action cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={() => deleteTask(deleteConfirm!)} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Comment Drawer */}
      {commentTaskId && (() => {
        const task = tasks.find(t => t.id === commentTaskId);
        return (
          <>
            <div onClick={() => setCommentTaskId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9000, backdropFilter: "blur(4px)" }} />
            <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 420, maxWidth: "95vw", zIndex: 9001, background: "var(--sidebar)", borderLeft: "1px solid var(--border2)", display: "flex", flexDirection: "column", boxShadow: "-16px 0 48px rgba(0,0,0,0.5)" }}>
              <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 4 }}>
                    <i className="ti ti-message-circle" style={{ marginRight: 5 }} />Task Comments
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", lineHeight: 1.4 }}>{task?.title}</div>
                  {task?.client && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>{task.client}</div>}
                </div>
                <button onClick={() => setCommentTaskId(null)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer", flexShrink: 0 }}>
                  <i className="ti ti-x" style={{ fontSize: 15 }} />
                </button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 20px" }}>
                <TaskComments taskId={commentTaskId} taskTitle={task?.title || ""} profile={profile} teamMembers={teamMembers} onRead={fetchCommentCounts} />
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}