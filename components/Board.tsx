"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const COLUMNS = [
  { id: "task",        title: "Task",        icon: "ti-layout-list",  color: "#60a5fa" },
  { id: "inprogress",  title: "In Progress", icon: "ti-circle-dot",   color: "#fbbf24" },
  { id: "review",      title: "Review",      icon: "ti-eye",          color: "#a78bfa" },
  { id: "done",        title: "Done",        icon: "ti-circle-check", color: "#34d399" },
];

const P: Record<string, { bg: string; border: string; text: string }> = {
  High:   { bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.35)", text: "#ef4444" },
  Medium: { bg: "rgba(251,191,36,0.15)",  border: "rgba(251,191,36,0.35)",  text: "#d97706" },
  Low:    { bg: "rgba(52,211,153,0.15)",  border: "rgba(52,211,153,0.35)",  text: "#059669" },
};

const TAB_COLORS = [
  { bg: "rgba(96,165,250,0.18)",  border: "rgba(96,165,250,0.4)",  text: "#3b82f6" },
  { bg: "rgba(244,114,182,0.18)", border: "rgba(244,114,182,0.4)", text: "#ec4899" },
  { bg: "rgba(251,191,36,0.18)",  border: "rgba(251,191,36,0.4)",  text: "#d97706" },
  { bg: "rgba(52,211,153,0.18)",  border: "rgba(52,211,153,0.4)",  text: "#059669" },
  { bg: "rgba(248,113,113,0.18)", border: "rgba(248,113,113,0.4)", text: "#dc2626" },
  { bg: "rgba(167,139,250,0.18)", border: "rgba(167,139,250,0.4)", text: "#7c3aed" },
  { bg: "rgba(251,146,60,0.18)",  border: "rgba(251,146,60,0.4)",  text: "#ea580c" },
  { bg: "rgba(34,211,238,0.18)",  border: "rgba(34,211,238,0.4)",  text: "#0891b2" },
];

const emptyForm = { title: "", description: "", priority: "Medium", assignees: [] as string[], due: "", client: "" };

const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export default function Board() {
  const [d2cClients, setD2cClients]       = useState<string[]>([]);
  const [selectedBrand, setSelectedBrand] = useState("Master");
  const [tasks, setTasks]                 = useState<any[]>([]);
  const [assignees, setAssignees]         = useState<any[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showModal, setShowModal]         = useState(false);
  const [targetCol, setTargetCol]         = useState("task");
  const [form, setForm]                   = useState<any>(emptyForm);
  const [dragTask, setDragTask]           = useState<any>(null);
  const [dragOverCol, setDragOverCol]     = useState<string | null>(null);
  const [deleteInfo, setDeleteInfo]       = useState<{ id: string } | null>(null);
  const [expandedTask, setExpandedTask]   = useState<any>(null);
  const [assignments, setAssignments]     = useState<any[]>([]);
  const [agentSuggestion, setAgentSuggestion] = useState<{ name: string; warning?: string; type: "info" | "warn" | "danger" } | null>(null);

  const rteRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchD2cClients(); fetchAssignees(); fetchAssignments(); }, []);
  useEffect(() => { fetchTasks(); }, [selectedBrand]);

  // Restore RTE content whenever the add modal opens
  useEffect(() => {
    if (showModal) {
      setTimeout(() => {
        if (rteRef.current) rteRef.current.innerHTML = form.description || "";
      }, 30);
    }
  }, [showModal]);

  const fetchD2cClients = async () => {
    const { data } = await supabase.from("clients").select("name")
      .eq("status", "Active").eq("brand_type", "D2C").order("name");
    setD2cClients(data ? data.map((c: any) => c.name) : []);
  };

  const fetchAssignees = async () => {
    const { data } = await supabase.from("profiles").select("id, name, color").neq("status", "left").order("created_at");
    if (data) setAssignees(data);
  };

  const fetchAssignments = async () => {
    const { data } = await supabase.from("client_assignments").select("*");
    if (data) setAssignments(data);
  };

  const handleClientChange = async (clientName: string) => {
    setForm((p: any) => ({ ...p, client: clientName }));
    setAgentSuggestion(null);

    const assignment = assignments.find((a: any) => a.client_name === clientName && a.role === "video_editor");
    if (!assignment) return;

    const memberName: string = assignment.member_name;
    setForm((p: any) => ({ ...p, client: clientName, assignees: [memberName] }));

    const today = new Date().toISOString().split("T")[0];
    const memberProfile = assignees.find((a: any) => a.name === memberName);
    const { data: leaveData } = memberProfile
      ? await supabase.from("attendance")
          .select("on_leave, is_absent, clock_in, leave_type")
          .eq("user_id", memberProfile.id)
          .eq("date", today)
          .maybeSingle()
      : { data: null };

    const onLeave = leaveData?.on_leave && !leaveData?.clock_in && leaveData?.leave_type !== "half_day";

    const { data: taskData } = await supabase.from("board_tasks")
      .select("id")
      .ilike("assignee", `%${memberName}%`)
      .neq("column_id", "done");

    const openCount = taskData?.length || 0;

    if (onLeave) {
      setAgentSuggestion({ name: memberName, warning: `${memberName} is on leave today`, type: "danger" });
    } else if (openCount >= 8) {
      setAgentSuggestion({ name: memberName, warning: `${memberName} has ${openCount} open tasks — may be overloaded`, type: "warn" });
    } else {
      setAgentSuggestion({ name: memberName, type: "info" });
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    let q = supabase.from("board_tasks").select("*").order("created_at", { ascending: true });
    if (selectedBrand !== "Master") q = q.eq("client", selectedBrand);
    const { data } = await q;
    if (data) setTasks(data);
    setLoading(false);
  };

  const openAdd = (colId: string) => {
    setTargetCol(colId);
    setForm({ ...emptyForm });
    setAgentSuggestion(null);
    setShowModal(true);
  };

  const addTask = async () => {
    if (!form.title.trim()) return;
    const brand = selectedBrand === "Master" ? (form.client || d2cClients[0] || "") : selectedBrand;
    await supabase.from("board_tasks").insert([{
      title: form.title,
      description: form.description,
      priority: form.priority,
      assignee: form.assignees.join(", "),
      due: form.due,
      column_id: targetCol,
      client: brand,
    }]);
    setShowModal(false);
    fetchTasks();
  };

  const moveTask = async (taskId: string, toColId: string) => {
    const prevCol = tasks.find(t => t.id === taskId)?.column_id;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, column_id: toColId } : t));
    if (expandedTask?.id === taskId) setExpandedTask((p: any) => ({ ...p, column_id: toColId }));
    const { error } = await supabase.from("board_tasks").update({ column_id: toColId }).eq("id", taskId);
    if (error) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, column_id: prevCol } : t));
      if (expandedTask?.id === taskId) setExpandedTask((p: any) => ({ ...p, column_id: prevCol }));
    }
  };

  const deleteTask = async (id: string) => {
    await supabase.from("board_tasks").delete().eq("id", id);
    setDeleteInfo(null);
    setExpandedTask(null);
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const onDragStart = (task: any) => setDragTask(task);
  const onDragEnd = () => { setDragTask(null); setDragOverCol(null); };

  const onDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCol !== colId) setDragOverCol(colId);
  };

  const onDragLeave = (e: React.DragEvent) => {
    // Only clear if truly leaving the column (not hovering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null);
  };

  const onDrop = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (dragTask && dragTask.column_id !== colId) moveTask(dragTask.id, colId);
    setDragTask(null);
    setDragOverCol(null);
  };

  const colTasks = (colId: string) => tasks.filter(t =>
    colId === "task" ? (t.column_id === "task" || t.column_id === "backlog") : t.column_id === colId
  );

  const allBrands = ["Master", ...d2cClients];
  const isMaster = selectedBrand === "Master";

  const brandColor = (name: string) => TAB_COLORS[Math.max(0, d2cClients.indexOf(name)) % TAB_COLORS.length];

  const assigneeColor = (name: string) =>
    assignees.find(a => a.name === name)?.color || "var(--accent)";

  const toggleAssignee = (name: string) =>
    setForm((p: any) => ({
      ...p,
      assignees: p.assignees.includes(name)
        ? p.assignees.filter((n: string) => n !== name)
        : [...p.assignees, name],
    }));

  const IS: React.CSSProperties = {
    width: "100%", background: "var(--input-bg)", border: "1px solid var(--border2)",
    borderRadius: 10, padding: "10px 14px", color: "var(--text)",
    fontFamily: "inherit", fontSize: 14, outline: "none",
  };
  const LS: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block",
    marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px",
  };
  const tbBtn: React.CSSProperties = {
    background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer",
    padding: "4px 8px", borderRadius: 5, fontSize: 13, fontFamily: "inherit", lineHeight: 1,
  };

  const stats = [
    { label: isMaster ? "All Tasks" : "Total",  val: tasks.length, color: "var(--text)" },
    { label: "In Progress", val: colTasks("inprogress").length, color: "#fbbf24" },
    { label: "High Priority", val: tasks.filter(t => t.priority === "High").length, color: "#ef4444" },
    { label: "Done", val: colTasks("done").length, color: "#34d399" },
  ];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "28px 28px 0" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px" }}>D2C Board</div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4 }}>
            {isMaster ? "All D2C brands overview" : `${selectedBrand} tasks`}
          </div>
        </div>
      </div>

      {/* ── Stats pills ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexShrink: 0, flexWrap: "wrap" }}>
        {stats.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, background: "var(--glass2)", border: "1px solid var(--border2)" }}>
            <span style={{ fontSize: 11, color: "var(--text3)", fontWeight: 500 }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.val}</span>
          </div>
        ))}
      </div>

      {/* ── Brand Tabs ── */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 16, paddingBottom: 2, flexShrink: 0, scrollbarWidth: "none" as any }}>
        {allBrands.map((brand, idx) => {
          const isActive = selectedBrand === brand;
          const isMasterTab = brand === "Master";
          const c = isMasterTab ? null : TAB_COLORS[(idx - 1) % TAB_COLORS.length];
          return (
            <button key={brand} onClick={() => setSelectedBrand(brand)}
              style={{
                padding: "5px 13px", borderRadius: 20, border: "1px solid", whiteSpace: "nowrap",
                cursor: "pointer", fontFamily: "inherit", fontSize: 11, transition: "all .15s", flexShrink: 0,
                fontWeight: isActive ? 700 : 600,
                background: isMasterTab ? (isActive ? "var(--accent-bg)" : "var(--glass2)") : c!.bg,
                borderColor: isMasterTab
                  ? (isActive ? "var(--accent-border)" : "var(--border2)")
                  : (isActive ? c!.text : c!.border),
                color: isMasterTab ? (isActive ? "var(--accent2)" : "var(--text3)") : c!.text,
                boxShadow: isActive && !isMasterTab ? `0 0 0 1.5px ${c!.text}` : "none",
              }}>
              {isMasterTab && <i className="ti ti-layout-dashboard" style={{ marginRight: 4, fontSize: 10 }} />}
              {brand}
            </button>
          );
        })}
      </div>

      {/* ── Kanban ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 28, opacity: .4 }} />
          <div style={{ marginTop: 10, fontSize: 14 }}>Loading board...</div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14, overflowX: "auto", flex: 1, paddingBottom: 28 }}>
          {COLUMNS.map(col => {
            const cards = colTasks(col.id);
            const isOver = dragOverCol === col.id;
            return (
              <div key={col.id}
                onDragOver={e => onDragOver(e, col.id)}
                onDragLeave={onDragLeave}
                onDrop={e => onDrop(e, col.id)}
                style={{
                  minWidth: 272, maxWidth: 272,
                  background: isOver ? "var(--glass2)" : "var(--glass)",
                  backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
                  border: `1.5px solid ${isOver ? col.color + "60" : "var(--border)"}`,
                  borderRadius: "var(--radius)",
                  padding: 12,
                  display: "flex", flexDirection: "column", gap: 9,
                  minHeight: 220,
                  maxHeight: "calc(100vh - 280px)",
                  overflowY: "auto",
                  transition: "border-color .1s, background .1s",
                  boxShadow: isOver ? `0 0 0 2px ${col.color}30` : "none",
                }}>

                {/* Column header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: col.color,
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 11px", borderRadius: 20,
                    background: col.color + "18", border: `1px solid ${col.color}35`,
                  }}>
                    <i className={`ti ${col.icon}`} style={{ fontSize: 12 }} />
                    {col.title}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "var(--text3)", background: "var(--glass2)", padding: "1px 8px", borderRadius: 8, fontWeight: 600, border: "1px solid var(--border)" }}>
                      {cards.length}
                    </span>
                    <button onClick={() => openAdd(col.id)}
                      style={{ background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 7, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
                      <i className="ti ti-plus" />
                    </button>
                  </div>
                </div>

                {/* Cards */}
                {cards.map(task => {
                  const pc = P[task.priority] || P.Medium;
                  const isDone = task.column_id === "done";
                  const names: string[] = task.assignee?.split(", ").filter(Boolean) || [];
                  return (
                    <div key={task.id}
                      draggable
                      onDragStart={e => { e.stopPropagation(); onDragStart(task); }}
                      onDragEnd={onDragEnd}
                      onClick={() => setExpandedTask(task)}
                      style={{
                        background: "var(--glass2)",
                        borderTop: "1px solid var(--border2)",
                        borderRight: "1px solid var(--border2)",
                        borderBottom: "1px solid var(--border2)",
                        borderLeft: `3px solid ${pc.text}`,
                        borderRadius: "var(--radius2)",
                        padding: "11px 13px",
                        cursor: "grab",
                        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                        transition: "transform .1s, box-shadow .1s",
                        opacity: isDone ? 0.6 : 1,
                        userSelect: "none",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.2)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = ""; }}>

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: pc.bg, border: `1px solid ${pc.border}`, color: pc.text, letterSpacing: ".3px" }}>
                          {task.priority}
                        </span>
                        {isMaster && task.client && (() => {
                          const bc = brandColor(task.client);
                          return (
                            <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 5, background: bc.bg, color: bc.text, border: `1px solid ${bc.border}`, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {task.client}
                            </span>
                          );
                        })()}
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textDecoration: isDone ? "line-through" : "none", opacity: isDone ? .5 : 1, marginBottom: 6, lineHeight: 1.4 }}>
                        {task.title}
                      </div>

                      {task.description && (
                        <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 8, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
                          {stripHtml(task.description)}
                        </div>
                      )}

                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        {/* Multi-assignee avatars */}
                        {names.length > 0 ? (
                          <div style={{ display: "flex", alignItems: "center" }}>
                            {names.slice(0, 3).map((name, i) => (
                              <div key={name} title={name} style={{
                                width: 20, height: 20, borderRadius: 6,
                                background: assigneeColor(name),
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 9, fontWeight: 700, color: "#fff",
                                marginLeft: i > 0 ? -5 : 0,
                                border: "1.5px solid var(--glass)",
                                flexShrink: 0,
                              }}>{name[0]}</div>
                            ))}
                            {names.length > 3 && (
                              <div style={{ width: 20, height: 20, borderRadius: 6, background: "var(--glass2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "var(--text3)", marginLeft: -5, border: "1.5px solid var(--border)" }}>
                                +{names.length - 3}
                              </div>
                            )}
                          </div>
                        ) : <div />}

                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {task.due && (
                            <span style={{ fontSize: 10, color: "var(--text3)" }}>
                              <i className="ti ti-calendar" style={{ fontSize: 10, marginRight: 3, verticalAlign: -1 }} />
                              {task.due}
                            </span>
                          )}
                          <div style={{ display: "flex", gap: 3 }}>
                            {COLUMNS.filter(c => c.id !== col.id).map(c => (
                              <button key={c.id}
                                onClick={e => { e.stopPropagation(); moveTask(task.id, c.id); }}
                                title={`Move to ${c.title}`}
                                style={{ background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 5, padding: "2px 5px", color: "var(--text3)", cursor: "pointer", fontSize: 10 }}>
                                <i className={`ti ${c.icon}`} style={{ fontSize: 10 }} />
                              </button>
                            ))}
                            <button onClick={e => { e.stopPropagation(); setDeleteInfo({ id: task.id }); }}
                              style={{ background: "transparent", border: "1px solid var(--border2)", borderRadius: 5, padding: "2px 5px", color: "#ef4444", cursor: "pointer", fontSize: 10 }}>
                              <i className="ti ti-trash" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {cards.length === 0 && (
                  <div onClick={() => openAdd(col.id)}
                    style={{ border: "1px dashed var(--border2)", borderRadius: "var(--radius2)", padding: 20, textAlign: "center", color: "var(--text3)", fontSize: 12, cursor: "pointer", opacity: .5, flex: 1 }}>
                    + Add task
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add Modal ── */}
      {showModal && (
        <div onClick={() => setShowModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 520, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>
                  Add Task{isMaster ? "" : ` — ${selectedBrand}`}
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>
                  {COLUMNS.find(c => c.id === targetCol)?.title} column
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="btn-ghost" style={{ padding: "6px 10px", minHeight: "unset" }}>
                <i className="ti ti-x" style={{ fontSize: 15 }} />
              </button>
            </div>

            {/* Title */}
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Task Title *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                onKeyDown={e => e.key === "Enter" && addTask()}
                placeholder="e.g. Write reel script for product launch" style={IS} autoFocus />
            </div>

            {/* Rich Text Description */}
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Description</label>
              <div style={{ border: "1px solid var(--border2)", borderRadius: 10, overflow: "hidden", background: "var(--input-bg)" }}>
                {/* Toolbar */}
                <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "7px 10px", borderBottom: "1px solid var(--border)", background: "rgba(128,128,128,0.05)", flexWrap: "wrap" }}>
                  {([
                    ["bold",      <b key="b" style={{ fontSize: 12 }}>B</b>],
                    ["italic",    <i key="i" style={{ fontStyle: "italic", fontSize: 12 }}>I</i>],
                    ["underline", <u key="u" style={{ fontSize: 12 }}>U</u>],
                  ] as [string, React.ReactNode][]).map(([cmd, label]) => (
                    <button key={cmd} style={tbBtn}
                      onMouseDown={e => { e.preventDefault(); rteRef.current?.focus(); document.execCommand(cmd, false); }}>
                      {label}
                    </button>
                  ))}
                  <div style={{ width: 1, height: 16, background: "var(--border2)", margin: "0 3px" }} />
                  <button style={tbBtn}
                    onMouseDown={e => { e.preventDefault(); rteRef.current?.focus(); document.execCommand("hiliteColor", false, "#fef08a"); document.execCommand("backColor", false, "#fef08a"); }}
                    title="Highlight">
                    <i className="ti ti-highlight" style={{ fontSize: 13 }} />
                  </button>
                  <div style={{ width: 1, height: 16, background: "var(--border2)", margin: "0 3px" }} />
                  <button style={tbBtn}
                    onMouseDown={e => { e.preventDefault(); rteRef.current?.focus(); document.execCommand("insertUnorderedList", false); }}
                    title="Bullet list">
                    <i className="ti ti-list" style={{ fontSize: 13 }} />
                  </button>
                  <button style={tbBtn}
                    onMouseDown={e => { e.preventDefault(); rteRef.current?.focus(); document.execCommand("insertOrderedList", false); }}
                    title="Numbered list">
                    <i className="ti ti-list-numbers" style={{ fontSize: 13 }} />
                  </button>
                </div>
                {/* Editable area */}
                <div
                  ref={rteRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={() => setForm((p: any) => ({ ...p, description: rteRef.current?.innerHTML || "" }))}
                  onKeyDown={e => e.stopPropagation()}
                  style={{ minHeight: 100, padding: "12px 14px", outline: "none", fontSize: 13, lineHeight: 1.7, color: "var(--text2)" }}
                />
              </div>
            </div>

            {/* Brand (master only) */}
            {isMaster && d2cClients.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={LS}>Brand</label>
                <select value={form.client || d2cClients[0]} onChange={e => handleClientChange(e.target.value)} style={IS}>
                  {d2cClients.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            )}

            {/* Agent suggestion chip */}
            {agentSuggestion && (
              <div style={{
                marginBottom: 14, padding: "10px 14px", borderRadius: 10, display: "flex", alignItems: "flex-start", gap: 10,
                background: agentSuggestion.type === "info" ? "rgba(99,102,241,0.1)" : agentSuggestion.type === "warn" ? "rgba(251,191,36,0.1)" : "rgba(248,113,113,0.1)",
                border: `1px solid ${agentSuggestion.type === "info" ? "rgba(99,102,241,0.3)" : agentSuggestion.type === "warn" ? "rgba(251,191,36,0.35)" : "rgba(248,113,113,0.35)"}`,
              }}>
                <span style={{ fontSize: 15, marginTop: 1 }}>
                  {agentSuggestion.type === "info" ? "🤖" : agentSuggestion.type === "warn" ? "⚠️" : "🚫"}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: agentSuggestion.type === "info" ? "#818cf8" : agentSuggestion.type === "warn" ? "#d97706" : "#ef4444" }}>
                    {agentSuggestion.type === "info"
                      ? `Auto-assigned: ${agentSuggestion.name} — video editor for this client`
                      : agentSuggestion.warning}
                  </div>
                  {agentSuggestion.type !== "info" && (
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                      Auto-assigned based on client ownership — you can override above
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Priority + Due */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={LS}>Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={IS}>
                  {["High", "Medium", "Low"].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Due Date</label>
                <input type="date" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} style={IS} />
              </div>
            </div>

            {/* Multi-Assignee picker */}
            <div style={{ marginBottom: 20 }}>
              <label style={LS}>Assign To {form.assignees.length > 0 && `(${form.assignees.length} selected)`}</label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {assignees.map(a => {
                  const sel = form.assignees.includes(a.name);
                  return (
                    <div key={a.id} onClick={() => toggleAssignee(a.name)}
                      style={{
                        background: sel ? "var(--accent-bg)" : "var(--glass2)",
                        border: `1px solid ${sel ? "var(--accent-border)" : "var(--border2)"}`,
                        borderRadius: 10, padding: "10px 6px",
                        textAlign: "center", cursor: "pointer", transition: "all .15s",
                      }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: a.color || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", margin: "0 auto 6px", border: sel ? "2px solid var(--accent2)" : "2px solid transparent" }}>
                        {a.name[0]}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: sel ? 700 : 500, color: sel ? "var(--accent2)" : "var(--text2)", lineHeight: 1.3, wordBreak: "break-word" }}>{a.name.split(" ")[0]}</div>
                      {sel && <i className="ti ti-check" style={{ fontSize: 10, color: "var(--accent2)", marginTop: 2, display: "block" }} />}
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={addTask} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 14 }}>
              <i className="ti ti-plus" /> Add Task
            </button>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {expandedTask && (
        <div onClick={() => setExpandedTask(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 500 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ flex: 1, paddingRight: 12 }}>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: P[expandedTask.priority]?.bg, color: P[expandedTask.priority]?.text, border: `1px solid ${P[expandedTask.priority]?.border}` }}>
                    {expandedTask.priority}
                  </span>
                  {expandedTask.client && (() => { const bc = brandColor(expandedTask.client); return (
                    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: bc.bg, color: bc.text, border: `1px solid ${bc.border}` }}>
                      {expandedTask.client}
                    </span>
                  );}  )()}
                  <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "var(--glass2)", color: "var(--text3)", border: "1px solid var(--border)" }}>
                    {COLUMNS.find(c => c.id === expandedTask.column_id || (expandedTask.column_id === "backlog" && c.id === "task"))?.title}
                  </span>
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", lineHeight: 1.35, letterSpacing: "-0.3px" }}>
                  {expandedTask.title}
                </div>
              </div>
              <button onClick={() => setExpandedTask(null)} className="btn-ghost" style={{ padding: "6px 10px", minHeight: "unset", flexShrink: 0 }}>
                <i className="ti ti-x" style={{ fontSize: 15 }} />
              </button>
            </div>

            {expandedTask.description ? (
              <div
                dangerouslySetInnerHTML={{ __html: expandedTask.description }}
                style={{ background: "var(--glass)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", padding: "13px 15px", fontSize: 13, color: "var(--text2)", lineHeight: 1.7, marginBottom: 18, backdropFilter: "blur(8px)" }}
              />
            ) : (
              <div style={{ background: "var(--glass)", border: "1px dashed var(--border2)", borderRadius: "var(--radius2)", padding: "11px 15px", fontSize: 12, color: "var(--text3)", marginBottom: 18, fontStyle: "italic" }}>
                No description added.
              </div>
            )}

            {/* Assignees */}
            {expandedTask.assignee && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
                <span style={{ color: "var(--text3)" }}>Assignees</span>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {expandedTask.assignee.split(", ").filter(Boolean).map((name: string) => (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, background: assigneeColor(name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff" }}>{name[0]}</div>
                      <span style={{ color: "var(--text)", fontWeight: 600 }}>{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ color: "var(--text3)" }}>Due Date</span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{expandedTask.due || "—"}</span>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <select value={expandedTask.column_id === "backlog" ? "task" : expandedTask.column_id}
                onChange={e => moveTask(expandedTask.id, e.target.value)}
                style={{ ...IS, flex: 1 }}>
                {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <button onClick={() => setDeleteInfo({ id: expandedTask.id })}
                style={{ padding: "10px 14px", background: "rgba(248,113,113,0.15)", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 10, color: "#ef4444", cursor: "pointer", fontSize: 13 }}>
                <i className="ti ti-trash" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteInfo && (
        <div onClick={() => setDeleteInfo(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 340, textAlign: "center" }}>
            <i className="ti ti-trash" style={{ fontSize: 36, color: "#ef4444", opacity: .7 }} />
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: "14px 0 6px" }}>Delete this card?</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 22 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteInfo(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11 }}>Cancel</button>
              <button onClick={() => deleteTask(deleteInfo!.id)} style={{ flex: 1, padding: 11, background: "#ef4444", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
