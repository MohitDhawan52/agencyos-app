"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { getOrg, orgName } from "@/lib/org";

const PLATFORMS = ["Instagram", "Facebook", "YouTube", "LinkedIn", "WhatsApp"];
const CONTENT_TYPES = ["Reel", "Post", "Story", "Carousel", "Video", "Ad Creative"];

const contentTypeColor: Record<string, string> = {
  Reel:           "#4ade80",
  Post:           "#f97316",
  Carousel:       "#fbbf24",
  Story:          "#f472b6",
  Video:          "#a78bfa",
  "Ad Creative":  "#5646e0",
};
const STATUS_OPTIONS = ["Planned", "In Production", "Ready for Review", "Ready", "Scheduled", "Posted", "Cancelled"];

const statusStyle: Record<string, { color: string; bg: string }> = {
  "Planned":          { color: "var(--text2)",   bg: "var(--glass2)" },
  "In Production":    { color: "var(--blue)",    bg: "var(--blue-bg)" },
  "Ready for Review": { color: "#f59e0b",        bg: "rgba(245,158,11,0.1)" },
  "Ready":            { color: "var(--accent2)", bg: "var(--accent-bg)" },
  "Scheduled":        { color: "var(--amber)",   bg: "var(--amber-bg)" },
  "Posted":           { color: "var(--green)",   bg: "var(--green-bg)" },
  "Cancelled":        { color: "var(--red)",     bg: "var(--red-bg)" },
};

const platformIcon: Record<string, string> = {
  Instagram: "ti-brand-instagram", Facebook: "ti-brand-facebook",
  YouTube: "ti-brand-youtube", LinkedIn: "ti-brand-linkedin", WhatsApp: "ti-brand-whatsapp",
};

const emptyForm = {
  title: "", client: "", platform: "Instagram",
  content_type: "Reel", assignees: [] as string[], scheduled_date: "", status: "Planned", notes: "", drive_link: ""
};

const emptyBulkForm = {
  client: "", platform: "Instagram", content_type: "Reel",
  assignees: [] as string[], status: "Planned", notes: ""
};

// One row in bulk add: a title + its own date
type BulkRow = { title: string; scheduled_date: string };

export default function ContentCalendar() {
  const [entries, setEntries] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [clientList, setClientList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [filterClient, setFilterClient] = useState("All");
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterContentType, setFilterContentType] = useState("All");
  const [view, setView] = useState<"list" | "calendar">("calendar");
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [dayPopup, setDayPopup] = useState<{ day: number; entries: any[] } | null>(null);

  // Bulk add state
  const [showBulk, setShowBulk] = useState(false);
  const [bulkForm, setBulkForm] = useState<any>(emptyBulkForm);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([{ title: "", scheduled_date: "" }]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteBulkConfirm, setDeleteBulkConfirm] = useState(false);
  const [deleteMonthConfirm, setDeleteMonthConfirm] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, Record<string, any>>>({});
  const [agentToast, setAgentToast] = useState("");

  useEffect(() => { fetchEntries(); fetchTeam(); fetchClients(); fetchAssignments(); }, []);

  useEffect(() => { setSelectedIds([]); }, [calMonth.year, calMonth.month, view]);

  useEffect(() => {
    const ch = supabase.channel("calendar-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "content_calendar" }, () => fetchEntries(false))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchEntries = async (runAutoStatus = true) => {
    setLoading(true);
    const { data } = await supabase
      .from("content_calendar")
      .select("*")
      .order("scheduled_date", { ascending: true });
    if (data) {
      if (runAutoStatus) {
        const todayStr = new Date().toISOString().split("T")[0];
        const toPost = data.filter(e => e.status === "Scheduled" && e.scheduled_date && e.scheduled_date <= todayStr);
        if (toPost.length > 0) {
          const ids = toPost.map(e => e.id);
          await supabase.from("content_calendar").update({ status: "Posted" }).in("id", ids);
          setEntries(data.map(e => ids.includes(e.id) ? { ...e, status: "Posted" } : e));
          setLoading(false);
          return;
        }
      }
      setEntries(data);
    }
    setLoading(false);
  };

  const fetchTeam = async () => {
    const { data } = await supabase.from("profiles").select("id, name, color").neq("status", "left").order("created_at");
    if (data) setTeamMembers(data);
  };

  const fetchClients = async () => {
    const { data } = await supabase.from("clients").select("name").eq("status", "Active").order("name");
    const others = (data || []).map((c: any) => c.name).filter(Boolean).filter(n => n !== orgName()).sort();
    setClientList([orgName(), ...others]);
  };

  const fetchAssignments = async () => {
    const { data } = await supabase.from("client_assignments").select("*");
    if (data) {
      const map: Record<string, Record<string, any>> = {};
      data.forEach((a: any) => {
        if (!map[a.client_name]) map[a.client_name] = {};
        map[a.client_name][a.role] = a;
      });
      setAssignments(map);
    }
  };

  const autoCreateBoardTask = async (entry: any) => {
    if (!entry.client) return;
    // Map content type → role
    const ct = (entry.content_type || "").toLowerCase();
    const role = ct.includes("ad") || ct.includes("meta") ? "ads_manager"
      : (ct.includes("post") || ct.includes("story") || ct.includes("carousel") || ct.includes("graphic")) ? "social_manager"
      : "video_editor";

    const assigned = assignments[entry.client]?.[role];
    const assigneeName = assigned?.member_name || "";

    // Priority from days until post date
    const daysUntil = entry.scheduled_date
      ? Math.ceil((new Date(entry.scheduled_date).getTime() - Date.now()) / 86400000)
      : null;
    const priority = daysUntil === null ? "Medium" : daysUntil <= 3 ? "High" : daysUntil <= 7 ? "Medium" : "Low";

    // Due date: one day before scheduled_date
    let dueDate = "";
    if (entry.scheduled_date) {
      const d = new Date(entry.scheduled_date);
      d.setDate(d.getDate() - 1);
      dueDate = d.toISOString().split("T")[0];
    }

    // Skip if a non-done task already exists for this entry (title + client match)
    const { data: existing } = await supabase.from("board_tasks")
      .select("id").eq("client", entry.client)
      .ilike("title", `%${entry.title}%`).neq("column_id", "done").maybeSingle();
    if (existing) return;

    const taskTitle = `${entry.content_type || "Content"}: ${entry.title}`;
    const desc = `<p>🤖 Auto-created from Content Calendar.</p><p>Platform: ${entry.platform || "—"} · Type: ${entry.content_type || "—"}</p>${entry.scheduled_date ? `<p>Post date: ${new Date(entry.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>` : ""}${entry.notes ? `<p>Notes: ${entry.notes}</p>` : ""}`;

    await supabase.from("board_tasks").insert([{
      title: taskTitle, description: desc, priority,
      assignee: assigneeName, due: dueDate, column_id: "task", client: entry.client,
    }]);

    const msg = assigneeName ? `🤖 Task created → ${assigneeName}` : "🤖 Task created (no editor assigned yet)";
    setAgentToast(msg);
    setTimeout(() => setAgentToast(""), 5000);
  };

  const getAssignees = (e: any): string[] => {
    if (!e.assignees) return e.assignee ? [e.assignee] : [];
    if (Array.isArray(e.assignees)) return e.assignees;
    try { return JSON.parse(e.assignees); } catch { return e.assignee ? [e.assignee] : []; }
  };

  const toggleAssignee = (name: string, isForm: "single" | "bulk") => {
    if (isForm === "single") {
      const current = form.assignees || [];
      setForm({ ...form, assignees: current.includes(name) ? current.filter((a: string) => a !== name) : [...current, name] });
    } else {
      const current = bulkForm.assignees || [];
      setBulkForm({ ...bulkForm, assignees: current.includes(name) ? current.filter((a: string) => a !== name) : [...current, name] });
    }
  };

  const assigneeColorMap = teamMembers.reduce((acc, m) => {
    acc[m.name] = m.color;
    return acc;
  }, {} as Record<string, string>);

  const filtered = entries.filter(e =>
    (filterClient === "All" || e.client === filterClient) &&
    (filterPlatform === "All" || e.platform === filterPlatform) &&
    (filterStatus === "All" || e.status === filterStatus) &&
    (filterContentType === "All" || e.content_type === filterContentType)
  );

  const openAdd = () => {
    setEditingId(null);
    setSaveError("");
    setForm({ ...emptyForm, client: clientList[0] || "", assignees: [] });
    setShowModal(true);
  };

  const openEdit = (e: any) => {
    setEditingId(e.id);
    setSaveError("");
    setForm({ ...e, assignees: getAssignees(e) });
    setShowModal(true);
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    const maxSize = 1024 * 1024 * 1024; // 1GB
    if (file.size > maxSize) { setSaveError("File too large. Max 1GB."); return; }
    setUploading(true);
    setUploadProgress(10);
    const ext = file.name.split(".").pop();
    const fileName = `${getOrg()?.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage
      .from("content-files")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });
    setUploadProgress(90);
    if (error) { setSaveError("Upload failed: " + error.message); setUploading(false); setUploadProgress(0); return; }
    const { data: { publicUrl } } = supabase.storage.from("content-files").getPublicUrl(data.path);
    setForm((f: any) => ({ ...f, drive_link: publicUrl }));
    setUploading(false);
    setUploadProgress(0);
  };

  const openBulk = () => {
    setBulkForm({ ...emptyBulkForm, client: clientList[0] || "", assignees: [] });
    setBulkRows([{ title: "", scheduled_date: "" }, { title: "", scheduled_date: "" }, { title: "", scheduled_date: "" }]);
    setBulkError("");
    setBulkSuccess("");
    setShowBulk(true);
  };

  const saveEntry = async () => {
    if (!form.title.trim()) { setSaveError("Title is required."); return; }
    setSaveError("");
    const assigneesArr = form.assignees || [];
    const payload = {
      title: form.title, client: form.client, platform: form.platform,
      content_type: form.content_type, assignees: assigneesArr,
      assignee: assigneesArr[0] || "",
      scheduled_date: form.scheduled_date || null,
      status: form.status, notes: form.notes,
      drive_link: form.drive_link || null,
    };
    if (editingId) {
      const { error } = await supabase.from("content_calendar").update(payload).eq("id", editingId);
      if (error) { setSaveError(error.message); return; }
    } else {
      const { error } = await supabase.from("content_calendar").insert([payload]);
      if (error) { setSaveError(error.message); return; }
    }
    if (form.status === "In Production") {
      const prevStatus = editingId ? entries.find((e: any) => e.id === editingId)?.status : null;
      if (!editingId || prevStatus !== "In Production") {
        await autoCreateBoardTask(form);
      }
    }
    setShowModal(false);
    fetchEntries();
  };

  const saveBulk = async () => {
    const validRows = bulkRows.filter(r => r.title.trim());
    if (!bulkForm.client) { setBulkError("Please select a client."); return; }
    if (validRows.length === 0) { setBulkError("Add at least one content title."); return; }
    setBulkError("");
    setBulkSaving(true);
    const assigneesArr = bulkForm.assignees || [];
    const payload = validRows.map(r => ({
      title: r.title.trim(),
      client: bulkForm.client,
      platform: bulkForm.platform,
      content_type: bulkForm.content_type,
      assignees: assigneesArr,
      assignee: assigneesArr[0] || "",
      scheduled_date: r.scheduled_date || null,
      status: bulkForm.status,
      notes: bulkForm.notes,
    }));
    const { error } = await supabase.from("content_calendar").insert(payload);
    setBulkSaving(false);
    if (error) { setBulkError(error.message); return; }
    setBulkSuccess(`${validRows.length} content item${validRows.length > 1 ? "s" : ""} added successfully!`);
    fetchEntries();
    setTimeout(() => { setShowBulk(false); setBulkSuccess(""); }, 1800);
  };

  const addBulkRow = () => setBulkRows([...bulkRows, { title: "", scheduled_date: "" }]);
  const removeBulkRow = (i: number) => setBulkRows(bulkRows.filter((_, idx) => idx !== i));
  const updateBulkRow = (i: number, field: keyof BulkRow, value: string) => {
    setBulkRows(bulkRows.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const deleteEntry = async (id: string) => {
    await supabase.from("content_calendar").delete().eq("id", id);
    setDeleteConfirm(null);
    fetchEntries();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    await supabase.from("content_calendar").delete().in("id", selectedIds);
    setSelectedIds([]);
    setDeleteBulkConfirm(false);
    fetchEntries();
  };

  const deleteMonth = async () => {
    const start = `${monthStr}-01`;
    const end = `${monthStr}-31`;
    await supabase.from("content_calendar").delete()
      .gte("scheduled_date", start)
      .lte("scheduled_date", end);
    setSelectedIds([]);
    setDeleteMonthConfirm(false);
    fetchEntries();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("content_calendar").update({ status }).eq("id", id);
    if (status === "In Production") {
      const entry = entries.find((e: any) => e.id === id);
      if (entry) await autoCreateBoardTask(entry);
    }
    fetchEntries();
  };

  const today = new Date();
  const { year: calYear, month: calMonthIdx } = calMonth;
  const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonthIdx, 1).getDay();
  const monthName = new Date(calYear, calMonthIdx, 1).toLocaleString("default", { month: "long", year: "numeric" });

  const prevMonth = () => setCalMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const nextMonth = () => setCalMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
  const goToday = () => setCalMonth({ year: today.getFullYear(), month: today.getMonth() });

  const getEntriesForDay = (day: number) => {
    const dateStr = `${calYear}-${String(calMonthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return filtered.filter(e => e.scheduled_date === dateStr);
  };

  // Stats for currently viewed month
  const monthStr = `${calYear}-${String(calMonthIdx + 1).padStart(2, "0")}`;
  const monthEntries = entries.filter(e => e.scheduled_date?.startsWith(monthStr));
  const listFiltered = filtered.filter(e => e.scheduled_date?.startsWith(monthStr));

  const IS = { width: "100%", background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 14, outline: "none" };
  const LS = { fontSize: 11, fontWeight: 600 as const, color: "var(--text3)", display: "block" as const, marginBottom: 7, textTransform: "uppercase" as const, letterSpacing: ".6px" };
  const SS = { background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 10, padding: "9px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 13, outline: "none", cursor: "pointer" };

  const countSrc = view === "calendar" ? monthEntries : listFiltered;
  const counts = {
    total: countSrc.length,
    posted: countSrc.filter(e => e.status === "Posted").length,
    scheduled: countSrc.filter(e => e.status === "Scheduled").length,
    production: countSrc.filter(e => e.status === "In Production").length,
  };

  return (
    <div className="page-wrap">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Content Calendar</div>
          <div style={{ fontSize: 15, color: "var(--text2)", marginTop: 6 }}>Plan and track content for all clients</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={{ display: "flex", gap: 4, background: "var(--glass)", padding: 4, borderRadius: 10, border: "1px solid var(--border)" }}>
            {(["list", "calendar"] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: "7px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", background: view === v ? "var(--glass3)" : "transparent", color: view === v ? "var(--text)" : "var(--text3)", textTransform: "capitalize" }}>{v}</button>
            ))}
          </div>
          <button onClick={openBulk} style={{ padding: "10px 18px", fontSize: 14, background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--accent2)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
            <i className="ti ti-calendar-plus" /> Bulk Add
          </button>
          <button onClick={openAdd} className="btn-primary" style={{ padding: "10px 20px", fontSize: 14 }}>
            <i className="ti ti-plus" /> Add Content
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: view === "calendar" ? "This Month" : "Total", val: counts.total, color: "var(--text2)", icon: "ti-calendar" },
          { label: "In Production", val: counts.production, color: "var(--blue)",  icon: "ti-player-play" },
          { label: "Scheduled",     val: counts.scheduled,  color: "var(--amber)", icon: "ti-clock" },
          { label: "Posted",        val: counts.posted,     color: "var(--green)", icon: "ti-circle-check" },
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

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={SS}>
          <option value="All">All Clients</option>
          {clientList.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} style={SS}>
          <option value="All">All Platforms</option>
          {PLATFORMS.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={SS}>
          <option value="All">All Status</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterContentType} onChange={e => setFilterContentType(e.target.value)} style={SS}>
          <option value="All">All Types</option>
          {CONTENT_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} />
          <div style={{ marginTop: 12, fontSize: 15 }}>Loading calendar...</div>
        </div>
      ) : view === "calendar" ? (
        <div className="crm-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
              </button>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", minWidth: 180, textAlign: "center" }}>{monthName}</div>
              <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
              </button>
            </div>
            <button onClick={goToday} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text2)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
              Today
            </button>
          </div>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as any, margin: "0 -4px", padding: "0 4px" }}>
            <div style={{ minWidth: 560 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 8 }}>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text3)", padding: "8px 0", textTransform: "uppercase", letterSpacing: ".5px" }}>{d}</div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayEntries = getEntriesForDay(day);
                  const isToday = day === today.getDate();
                  return (
                    <div key={day} style={{ minHeight: 80, minWidth: 0, background: isToday ? "rgba(109,93,252,0.08)" : "var(--glass)", border: `1px solid ${isToday ? "var(--accent-border)" : "var(--border)"}`, borderRadius: 10, padding: 8, boxSizing: "border-box" }}>
                      <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--accent2)" : "var(--text3)", marginBottom: 4 }}>{day}</div>
                      {dayEntries.slice(0, 3).map(e => {
                        const typeColor = contentTypeColor[e.content_type] || "#888";
                        const cardBg = e.status === "Posted"    ? `${typeColor}22`
                                     : e.status === "Scheduled" ? "rgba(120,53,15,0.12)"
                                     : "var(--glass2)";
                        const cardBorder = e.status === "Posted"    ? `2px solid ${typeColor}`
                                         : e.status === "Scheduled" ? "2px solid #92400e"
                                         : "2px solid var(--border)";
                        return (
                          <div key={e.id} onClick={() => openEdit(e)}
                            style={{ background: cardBg, borderRadius: 6, padding: "4px 6px", marginBottom: 3, cursor: "pointer", borderLeft: cardBorder }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{e.client}</div>
                            <div style={{ fontSize: 9, color: "var(--text2)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                              {e.content_type} · {e.title}
                            </div>
                          </div>
                        );
                      })}
                      {dayEntries.length > 3 && (
                        <div onClick={() => setDayPopup({ day, entries: dayEntries })}
                          style={{ fontSize: 10, fontWeight: 600, color: "var(--accent2)", cursor: "pointer", padding: "2px 4px", borderRadius: 4, background: "var(--accent-bg)", border: "1px solid var(--accent-border)", textAlign: "center" }}>
                          +{dayEntries.length - 3} more
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {/* List view month navigation + bulk actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
              </button>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", minWidth: 160, textAlign: "center" }}>{monthName}</div>
              <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
              </button>
              <button onClick={goToday} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text2)", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Today</button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {selectedIds.length > 0 && (
                <button onClick={() => setDeleteBulkConfirm(true)}
                  style={{ padding: "7px 14px", fontSize: 13, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 8, color: "var(--red)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <i className="ti ti-trash" /> Delete {selectedIds.length} Selected
                </button>
              )}
              <button onClick={() => setDeleteMonthConfirm(true)}
                style={{ padding: "7px 14px", fontSize: 13, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, color: "var(--red)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <i className="ti ti-calendar-off" /> Delete This Month
              </button>
            </div>
          </div>

          <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", background: "var(--glass)" }}>
            <div className="table-scroll">
            <table className="crm-table">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: "center" }}>
                    <input type="checkbox"
                      checked={listFiltered.length > 0 && selectedIds.length === listFiltered.length}
                      onChange={ev => setSelectedIds(ev.target.checked ? listFiltered.map((e: any) => e.id) : [])}
                      style={{ cursor: "pointer", accentColor: "var(--accent)", width: 15, height: 15 }}
                    />
                  </th>
                  <th>Content</th><th>Client</th><th>Platform</th><th>Type</th>
                  <th>Assignees</th><th>Date</th><th>Status</th><th>Client Feedback</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {listFiltered.map(e => {
                  const ss = statusStyle[e.status] || statusStyle["Planned"];
                  const assignees = getAssignees(e);
                  const isSelected = selectedIds.includes(e.id);
                  return (
                    <tr key={e.id} style={{ background: isSelected ? "rgba(109,93,252,0.05)" : undefined }}>
                      <td style={{ width: 44, textAlign: "center" }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(e.id)}
                          style={{ cursor: "pointer", accentColor: "var(--accent)", width: 15, height: 15 }} />
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{e.title}</div>
                        {e.notes && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{e.notes}</div>}
                      </td>
                      <td><span style={{ fontSize: 12, color: "var(--text3)", background: "var(--glass2)", padding: "3px 10px", borderRadius: 8, border: "1px solid var(--border)" }}>{e.client}</span></td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <i className={`ti ${platformIcon[e.platform] || "ti-brand-instagram"}`} style={{ fontSize: 16, color: "var(--accent2)" }} />
                          <span style={{ fontSize: 13, color: "var(--text2)" }}>{e.platform}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                          background: `${contentTypeColor[e.content_type] || "#888"}22`,
                          color: contentTypeColor[e.content_type] || "var(--text2)",
                          border: `1px solid ${contentTypeColor[e.content_type] || "#888"}50`,
                        }}>{e.content_type}</span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                          {assignees.length === 0 ? (
                            <span style={{ fontSize: 12, color: "var(--text3)" }}>—</span>
                          ) : assignees.map((name: string, idx: number) => (
                            <div key={idx} title={name} style={{ width: 26, height: 26, borderRadius: 7, background: assigneeColorMap[name] || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0, border: "2px solid var(--bg)" }}>
                              {name?.[0] || "?"}
                            </div>
                          ))}
                          {assignees.length > 0 && (
                            <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: 4 }}>
                              {assignees.length === 1 ? assignees[0] : `${assignees.length} members`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: "var(--text2)" }}>
                        {e.scheduled_date ? new Date(e.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
                      </td>
                      <td>
                        <select value={e.status} onChange={ev => updateStatus(e.id, ev.target.value)}
                          style={{ background: ss.bg, color: ss.color, border: "none", borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", outline: "none" }}>
                          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td>
                        {e.client_approval ? (
                          <div>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, display: "inline-block",
                              background: e.client_approval === "Approved" ? "var(--green-bg)" : "var(--red-bg)",
                              color: e.client_approval === "Approved" ? "var(--green)" : "var(--red)",
                              border: `1px solid ${e.client_approval === "Approved" ? "var(--green-border)" : "var(--red-border)"}`,
                            }}>
                              {e.client_approval === "Approved" ? "✓ Approved" : "✗ Changes Needed"}
                            </span>
                            {e.client_comment && (
                              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={e.client_comment}>
                                {e.client_comment}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--text3)" }}>
                            {e.status === "Ready for Review" ? "Awaiting…" : "—"}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => openEdit(e)} style={{ background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--blue)", cursor: "pointer", fontSize: 14 }}><i className="ti ti-pencil" /></button>
                          <button onClick={() => setDeleteConfirm(e.id)} style={{ background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--red)", cursor: "pointer", fontSize: 14 }}><i className="ti ti-trash" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {listFiltered.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
                <i className="ti ti-calendar" style={{ fontSize: 40, opacity: .2 }} />
                <div style={{ marginTop: 12, fontSize: 15 }}>No content for {monthName}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── BULK ADD MODAL ─── */}
      {showBulk && (
        <div onClick={() => setShowBulk(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 680, maxWidth: "96vw", maxHeight: "92vh", overflowY: "auto" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>Bulk Add Content</div>
                <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 3 }}>Add a full month of content for one brand at once</div>
              </div>
              <button onClick={() => setShowBulk(false)} style={{ background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "var(--border)", margin: "16px 0" }} />

            {/* Shared settings */}
            <div style={{ background: "var(--glass)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--accent2)", marginBottom: 14, textTransform: "uppercase", letterSpacing: ".7px" }}>
                <i className="ti ti-settings" style={{ marginRight: 6 }} />Shared Settings (apply to all rows)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={LS}>Client *</label>
                  <select value={bulkForm.client} onChange={e => setBulkForm({ ...bulkForm, client: e.target.value })} style={IS}>
                    <option value="">Select client...</option>
                    {clientList.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Platform</label>
                  <select value={bulkForm.platform} onChange={e => setBulkForm({ ...bulkForm, platform: e.target.value })} style={IS}>
                    {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Content Type</label>
                  <select value={bulkForm.content_type} onChange={e => setBulkForm({ ...bulkForm, content_type: e.target.value })} style={IS}>
                    {CONTENT_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={LS}>Status</label>
                  <select value={bulkForm.status} onChange={e => setBulkForm({ ...bulkForm, status: e.target.value })} style={IS}>
                    {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Notes (optional)</label>
                  <input value={bulkForm.notes} onChange={e => setBulkForm({ ...bulkForm, notes: e.target.value })} placeholder="Common note for all…" style={IS} />
                </div>
              </div>
              {/* Assignees */}
              <div>
                <label style={LS}>Assignees</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {teamMembers.map(m => {
                    const selected = (bulkForm.assignees || []).includes(m.name);
                    return (
                      <button key={m.id} type="button" onClick={() => toggleAssignee(m.name, "bulk")}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 9, cursor: "pointer", border: selected ? `1px solid ${m.color || "var(--accent)"}` : "1px solid var(--border2)", background: selected ? `${m.color || "var(--accent)"}22` : "var(--glass)", color: selected ? (m.color || "var(--accent2)") : "var(--text2)", fontFamily: "inherit", fontSize: 13, fontWeight: selected ? 600 : 400 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 6, background: m.color || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>{m.name?.[0]}</div>
                        {m.name}
                        {selected && <i className="ti ti-check" style={{ fontSize: 11 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Content rows */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".6px" }}>
                  <i className="ti ti-list" style={{ marginRight: 6 }} />Content Items — {bulkRows.filter(r => r.title.trim()).length} of {bulkRows.length} filled
                </div>
                <button onClick={addBulkRow} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 8, color: "var(--accent2)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600 }}>
                  <i className="ti ti-plus" /> Add Row
                </button>
              </div>

              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 36px", gap: 8, marginBottom: 6, padding: "0 4px" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Content Title</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px" }}>Scheduled Date</div>
                <div />
              </div>

              {/* Rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {bulkRows.map((row, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 160px 36px", gap: 8, alignItems: "center" }}>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 700, color: "var(--text3)", pointerEvents: "none", userSelect: "none" }}>{i + 1}.</span>
                      <input
                        value={row.title}
                        onChange={e => updateBulkRow(i, "title", e.target.value)}
                        placeholder={`Content title ${i + 1}`}
                        style={{ ...IS, paddingLeft: 28 }}
                      />
                    </div>
                    <input
                      type="date"
                      value={row.scheduled_date}
                      onChange={e => updateBulkRow(i, "scheduled_date", e.target.value)}
                      style={{ ...IS, padding: "10px 10px" }}
                    />
                    <button onClick={() => removeBulkRow(i)} style={{ width: 36, height: 36, borderRadius: 8, background: "transparent", border: "1px solid var(--border2)", color: "var(--red)", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <i className="ti ti-x" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Error / Success */}
            {bulkError && (
              <div style={{ padding: "10px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, fontSize: 13, color: "var(--red)", marginBottom: 14 }}>
                {bulkError}
              </div>
            )}
            {bulkSuccess && (
              <div style={{ padding: "10px 14px", background: "var(--green-bg)", border: "1px solid var(--green)", borderRadius: 10, fontSize: 13, color: "var(--green)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <i className="ti ti-circle-check" /> {bulkSuccess}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
              <button onClick={() => setShowBulk(false)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 12, fontSize: 14 }}>Cancel</button>
              <button onClick={saveBulk} disabled={bulkSaving} className="btn-primary" style={{ flex: 2, justifyContent: "center", padding: 12, fontSize: 15 }}>
                {bulkSaving ? <><i className="ti ti-loader" /> Saving...</> : <><i className="ti ti-circle-check" /> Save {bulkRows.filter(r => r.title.trim()).length} Items</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD/EDIT MODAL ─── */}
      {showModal && (
        <div onClick={() => setShowModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 540, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>{editingId ? "Edit Content" : "Add Content"}</div>
              <button onClick={() => setShowModal(false)} style={{ background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Content Title *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Reel — Skin care routine" style={IS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={LS}>Client</label>
                <select value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} style={IS}>
                  <option value="">Select client...</option>
                  {clientList.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Platform</label>
                <select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })} style={IS}>
                  {PLATFORMS.map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Content Type</label>
                <select value={form.content_type} onChange={e => setForm({ ...form, content_type: e.target.value })} style={IS}>
                  {CONTENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Scheduled Date</label>
                <input type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} style={IS} />
              </div>
              <div>
                <label style={LS}>Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={IS}>
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Assignees</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {teamMembers.map(m => {
                  const selected = (form.assignees || []).includes(m.name);
                  return (
                    <button key={m.id} type="button" onClick={() => toggleAssignee(m.name, "single")}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, cursor: "pointer", border: selected ? `1px solid ${m.color || "var(--accent)"}` : "1px solid var(--border2)", background: selected ? `${m.color || "var(--accent)"}22` : "var(--glass)", color: selected ? (m.color || "var(--accent2)") : "var(--text2)", fontFamily: "inherit", fontSize: 13, fontWeight: selected ? 600 : 400 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: m.color || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{m.name?.[0]}</div>
                      {m.name}
                      {selected && <i className="ti ti-check" style={{ fontSize: 12 }} />}
                    </button>
                  );
                })}
              </div>
              {(form.assignees || []).length > 0 && (
                <div style={{ fontSize: 12, color: "var(--accent2)", marginTop: 8 }}>
                  {(form.assignees || []).length} member{(form.assignees || []).length > 1 ? "s" : ""} selected: {(form.assignees || []).join(", ")}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Notes (visible to client)</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this content…" rows={2} style={{ ...IS, resize: "vertical" as const }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Content File (Client will see this in their portal)</label>

              {/* Upload zone */}
              {!form.drive_link ? (
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); }}
                  style={{ border: `2px dashed ${dragOver ? "var(--accent2)" : "var(--border2)"}`, borderRadius: 12, padding: "28px 20px", textAlign: "center", transition: "all .15s", background: dragOver ? "var(--accent-bg)" : "var(--glass)", cursor: "pointer", position: "relative" }}
                  onClick={() => document.getElementById("content-file-input")?.click()}
                >
                  <input id="content-file-input" type="file" accept="image/*,video/*" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                  {uploading ? (
                    <div>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>⏫</div>
                      <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 10 }}>Uploading…</div>
                      <div style={{ height: 4, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${uploadProgress}%`, background: "var(--accent2)", borderRadius: 4, transition: "width .3s" }} />
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📁</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text2)", marginBottom: 4 }}>Drop file here or click to upload</div>
                      <div style={{ fontSize: 12, color: "var(--text3)" }}>Images (JPG, PNG, WebP) · Videos (MP4, MOV) · Max 1GB</div>
                    </div>
                  )}
                </div>
              ) : (
                /* Preview of uploaded / linked file */
                <div style={{ border: "1px solid var(--border2)", borderRadius: 12, overflow: "hidden", position: "relative" }}>
                  {/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(form.drive_link) ? (
                    <img src={form.drive_link} alt="preview" style={{ width: "100%", maxHeight: 200, objectFit: "contain", background: "var(--glass)", display: "block" }} />
                  ) : /\.(mp4|mov|webm)(\?|$)/i.test(form.drive_link) ? (
                    <video src={form.drive_link} controls style={{ width: "100%", maxHeight: 200, display: "block", background: "#000" }} />
                  ) : (
                    <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 28 }}>📎</span>
                      <div style={{ flex: 1, fontSize: 13, color: "var(--text2)", wordBreak: "break-all" }}>{form.drive_link}</div>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderTop: "1px solid var(--border)", background: "var(--glass)" }}>
                    <button type="button" onClick={() => document.getElementById("content-file-input")?.click()}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 8, background: "var(--glass2)", border: "1px solid var(--border2)", color: "var(--text2)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                      <i className="ti ti-upload" /> Replace
                    </button>
                    <button type="button" onClick={() => setForm((f: any) => ({ ...f, drive_link: "" }))}
                      style={{ padding: "7px 12px", borderRadius: 8, background: "var(--red-bg)", border: "1px solid var(--red-border)", color: "var(--red)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                      <i className="ti ti-trash" /> Remove
                    </button>
                  </div>
                  <input id="content-file-input" type="file" accept="image/*,video/*" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
                </div>
              )}

              {/* Paste link fallback */}
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                <span style={{ fontSize: 11, color: "var(--text3)" }}>or paste a link</span>
                <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              </div>
              <input value={form.drive_link || ""} onChange={e => setForm({ ...form, drive_link: e.target.value })}
                placeholder="https://drive.google.com/… or any URL" style={{ ...IS, marginTop: 8 }} />
            </div>
            {saveError && (
              <div style={{ padding: "10px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, fontSize: 13, color: "var(--red)", marginBottom: 14 }}>
                {saveError}
              </div>
            )}
            <button onClick={saveEntry} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15 }}>
              {editingId ? "Save Changes" : "Add Content"}
            </button>
          </div>
        </div>
      )}

      {/* DAY POPUP */}
      {dayPopup && (
        <div onClick={() => setDayPopup(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 480, maxWidth: "95vw", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>
                {new Date(calYear, calMonthIdx, dayPopup.day).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                <span style={{ fontSize: 13, color: "var(--text3)", fontWeight: 400, marginLeft: 8 }}>{dayPopup.entries.length} items</span>
              </div>
              <button onClick={() => setDayPopup(null)} style={{ background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 8, padding: "5px 9px", color: "var(--text2)", cursor: "pointer" }}>
                <i className="ti ti-x" />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dayPopup.entries.map(e => {
                const ss = statusStyle[e.status] || statusStyle["Planned"];
                return (
                  <div key={e.id} style={{ background: ss.bg, border: `1px solid ${ss.color}30`, borderRadius: 10, padding: "12px 14px", borderLeft: `3px solid ${ss.color}`, cursor: "pointer" }}
                    onClick={() => { openEdit(e); setDayPopup(null); }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>{e.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text3)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {e.client && <span style={{ color: "var(--text2)", fontWeight: 600 }}>{e.client}</span>}
                          <span style={{ color: "var(--text3)" }}>{e.platform}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 10,
                            background: `${contentTypeColor[e.content_type] || "#888"}22`,
                            color: contentTypeColor[e.content_type] || "var(--text3)",
                            border: `1px solid ${contentTypeColor[e.content_type] || "#888"}50`,
                          }}>{e.content_type}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: ss.bg, color: ss.color, border: `1px solid ${ss.color}40`, flexShrink: 0 }}>{e.status}</span>
                    </div>
                    {e.client_approval && (
                      <div style={{ marginTop: 6, fontSize: 11, color: e.client_approval === "Approved" ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                        {e.client_approval === "Approved" ? "✓ Client Approved" : "✗ Changes Needed"}
                        {e.client_comment && <span style={{ fontWeight: 400, color: "var(--text3)" }}> — {e.client_comment}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 340, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>&#128465;</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete Content?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={() => deleteEntry(deleteConfirm)} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRM */}
      {deleteBulkConfirm && (
        <div onClick={() => setDeleteBulkConfirm(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 360, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>&#128465;</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete {selectedIds.length} Items?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24 }}>
              This will permanently delete {selectedIds.length} selected content item{selectedIds.length !== 1 ? "s" : ""}. This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteBulkConfirm(false)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={deleteSelected} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete All</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MONTH CONFIRM */}
      {deleteMonthConfirm && (
        <div onClick={() => setDeleteMonthConfirm(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 380, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>&#128197;</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete {monthName}?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 6 }}>
              This will delete ALL {listFiltered.length} content item{listFiltered.length !== 1 ? "s" : ""} in {monthName}.
            </div>
            <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 24, fontWeight: 600 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteMonthConfirm(false)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={deleteMonth} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete Month</button>
            </div>
          </div>
        </div>
      )}

      {/* Agent toast */}
      {agentToast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, background: "#1a1a2e", border: "1px solid rgba(124,110,245,0.4)", borderRadius: 12, padding: "12px 18px", fontSize: 14, fontWeight: 600, color: "#a78bfa", boxShadow: "0 4px 20px rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", alignItems: "center", gap: 8 }}>
          {agentToast}
        </div>
      )}
    </div>
  );
}