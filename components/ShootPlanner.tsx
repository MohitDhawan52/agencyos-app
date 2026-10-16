"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const SCRIPTING_OPTIONS = ["Ideation", "In Process", "Done"];
const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const STATUS_OPTIONS = ["Scheduled", "Shooting", "Done", "Cancelled"];

const scriptingStyle: Record<string, { color: string; bg: string }> = {
  "Ideation":    { color: "var(--accent2)", bg: "var(--accent-bg)" },
  "In Process":  { color: "var(--amber)",   bg: "var(--amber-bg)" },
  "Done":        { color: "var(--green)",   bg: "var(--green-bg)" },
};
const priorityStyle: Record<string, { color: string; bg: string }> = {
  High:   { color: "var(--red)",    bg: "var(--red-bg)" },
  Medium: { color: "var(--amber)",  bg: "var(--amber-bg)" },
  Low:    { color: "var(--green)",  bg: "var(--green-bg)" },
};
const statusStyle: Record<string, { color: string; bg: string }> = {
  Scheduled: { color: "var(--blue)",   bg: "var(--blue-bg)" },
  Shooting:  { color: "var(--amber)",  bg: "var(--amber-bg)" },
  Done:      { color: "var(--green)",  bg: "var(--green-bg)" },
  Cancelled: { color: "var(--text3)", bg: "rgba(255,255,255,0.05)" },
};

const emptyForm = {
  shoot_date: new Date().toISOString().split("T")[0],
  client: "", video_count: 1,
  scripting: "Ideation", assignees: [] as string[],
  priority: "Medium", status: "Scheduled", notes: "",
};

export default function ShootPlanner() {
  const [shoots, setShoots] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterClient, setFilterClient] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: s }, { data: c }, { data: m }] = await Promise.all([
      supabase.from("shoot_plans").select("*").order("shoot_date", { ascending: true }),
      supabase.from("clients").select("id, name").eq("status", "Active").order("name"),
      supabase.from("profiles").select("id, name, color").neq("status", "left"),
    ]);
    if (s) setShoots(s);
    if (c) setClients(c);
    if (m) setMembers(m);
    setLoading(false);
  };

  const openAdd = () => { setEditingId(null); setForm({ ...emptyForm }); setShowModal(true); };
  const parseAssignees = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    if (typeof val === "string" && val) {
      try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch {}
      return val.split(",").map((s: string) => s.trim()).filter(Boolean);
    }
    return [];
  };

  const openEdit = (shoot: any) => {
    setEditingId(shoot.id);
    setForm({ shoot_date: shoot.shoot_date || new Date().toISOString().split("T")[0], client: shoot.client || "", video_count: shoot.video_count || 1, scripting: shoot.scripting || "Ideation", assignees: parseAssignees(shoot.assignees), priority: shoot.priority || "Medium", status: shoot.status || "Scheduled", notes: shoot.notes || "" });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.client || !form.shoot_date) return;
    setSaving(true);
    const payload = { shoot_date: form.shoot_date, client: form.client, video_count: Number(form.video_count) || 1, scripting: form.scripting, assignees: form.assignees, priority: form.priority, status: form.status, notes: form.notes };
    if (editingId) await supabase.from("shoot_plans").update(payload).eq("id", editingId);
    else await supabase.from("shoot_plans").insert([payload]);
    setSaving(false); setShowModal(false); fetchAll();
  };

  const deleteShoot = async (id: string) => {
    if (!confirm("Delete this shoot plan?")) return;
    await supabase.from("shoot_plans").delete().eq("id", id);
    fetchAll();
  };

  const updateField = async (id: string, field: string, value: string) => {
    await supabase.from("shoot_plans").update({ [field]: value }).eq("id", id);
    setShoots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const toggleAssignee = (name: string) => {
    setForm(f => ({ ...f, assignees: f.assignees.includes(name) ? f.assignees.filter(a => a !== name) : [...f.assignees, name] }));
  };

  const colorMap: Record<string, string> = {};
  members.forEach(m => { colorMap[m.name] = m.color || "var(--accent)"; });

  const todayStr = new Date().toISOString().split("T")[0];
  const filtered = shoots.filter(s => {
    if (filterStatus !== "All" && s.status !== filterStatus) return false;
    if (filterClient !== "All" && s.client !== filterClient) return false;
    if (searchQuery && !s.client?.toLowerCase().includes(searchQuery.toLowerCase()) && !s.notes?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const upcoming = shoots.filter(s => s.shoot_date >= todayStr && s.status !== "Done" && s.status !== "Cancelled");
  const totalVideos = upcoming.reduce((a, b) => a + (b.video_count || 0), 0);

  const fmtDate = (d: string) => {
    if (!d) return "--";
    const date = new Date(d + "T00:00:00");
    const diff = Math.floor((date.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const getDayDiff = (d: string) => d ? Math.floor((new Date(d + "T00:00:00").getTime() - new Date(new Date().toDateString()).getTime()) / 86400000) : null;

  const IS: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 14, outline: "none" };
  const LS: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" };

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ textAlign: "center", color: "var(--text3)" }}>
        <i className="ti ti-camera" style={{ fontSize: 40, opacity: .4 }} />
        <div style={{ marginTop: 12, fontSize: 15 }}>Loading Shoot Planner...</div>
      </div>
    </div>
  );

  return (
    <div className="page-wrap" style={{ background: "var(--bg)" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#f97316,#fb923c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(249,115,22,0.4)" }}>
            <i className="ti ti-camera" style={{ fontSize: 22, color: "#fff" }} />
          </div>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.6px" }}>Shoot Planner</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginTop: 2 }}>Plan & track all brand shoot sessions</div>
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary" style={{ background: "linear-gradient(135deg,#f97316,#fb923c)", boxShadow: "0 4px 16px rgba(249,115,22,0.35)" }}>
          <i className="ti ti-plus" /> New Shoot
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Upcoming Shoots", val: upcoming.length, color: "#f97316", icon: "ti-calendar-event" },
          { label: "Videos Planned",  val: totalVideos,     color: "var(--accent2)", icon: "ti-video" },
          { label: "In Scripting",    val: shoots.filter(s => s.scripting !== "Done" && s.status !== "Done").length, color: "var(--amber)", icon: "ti-writing" },
          { label: "Completed",       val: shoots.filter(s => s.status === "Done").length, color: "var(--green)", icon: "ti-circle-check" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px" }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: `${s.color}18`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, letterSpacing: "-0.5px", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "var(--text3)", pointerEvents: "none" }} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search client or notes…"
            style={{ paddingLeft: 34, paddingRight: 12, paddingTop: 8, paddingBottom: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", width: 210 }} />
        </div>
        <div style={{ display: "flex", background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 4, border: "1px solid var(--border)", gap: 2 }}>
          {["All", ...STATUS_OPTIONS].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", background: filterStatus === s ? "rgba(249,115,22,0.2)" : "transparent", color: filterStatus === s ? "#fb923c" : "var(--text3)" }}>{s}</button>
          ))}
        </div>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, padding: "8px 14px", color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
          <option value="All">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        {filtered.length !== shoots.length && (
          <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: "rgba(249,115,22,0.15)", color: "#fb923c", border: "1px solid rgba(249,115,22,0.25)", fontWeight: 600 }}>{filtered.length} results</span>
        )}
      </div>

      {/* Empty */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--text3)" }}>
          <i className="ti ti-camera-off" style={{ fontSize: 48, opacity: .2 }} />
          <div style={{ marginTop: 16, fontSize: 18, fontWeight: 600, color: "var(--text2)" }}>No shoots found</div>
          <div style={{ marginTop: 8, fontSize: 14 }}>{shoots.length === 0 ? 'Click "New Shoot" to plan your first session' : "Try adjusting your filters"}</div>
        </div>
      ) : (
        /* List */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 80px 130px 140px 100px 120px auto", gap: 12, padding: "8px 18px", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px" }}>
            <span>Date</span><span>Client</span><span>Videos</span><span>Scripting</span><span>Assignees</span><span>Priority</span><span>Status</span><span></span>
          </div>

          {filtered.map(shoot => {
            const ps = priorityStyle[shoot.priority] || priorityStyle.Medium;
            const dayDiff = getDayDiff(shoot.shoot_date);
            const urgent = dayDiff !== null && dayDiff >= 0 && dayDiff <= 2 && shoot.status === "Scheduled";
            return (
              <div key={shoot.id} style={{ display: "grid", gridTemplateColumns: "130px 1fr 80px 130px 140px 100px 120px auto", gap: 12, alignItems: "center", padding: "14px 18px", borderRadius: 14, background: urgent ? "rgba(249,115,22,0.05)" : "var(--glass)", border: `1px solid ${urgent ? "rgba(249,115,22,0.25)" : "var(--border)"}` }}>

                {/* Date */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: urgent ? "#fb923c" : "var(--text)" }}>
                    {urgent && "📍 "}{fmtDate(shoot.shoot_date)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                    {shoot.shoot_date ? new Date(shoot.shoot_date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" }) : ""}
                    {dayDiff !== null && dayDiff > 0 && shoot.status !== "Done" && <span style={{ marginLeft: 5, color: dayDiff <= 3 ? "#fb923c" : "var(--text3)" }}>in {dayDiff}d</span>}
                  </div>
                </div>

                {/* Client */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shoot.client}</div>
                  {shoot.notes && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shoot.notes}</div>}
                </div>

                {/* Videos */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "var(--accent2)" }}>{shoot.video_count}</div>
                  <div style={{ fontSize: 10, color: "var(--text3)" }}>videos</div>
                </div>

                {/* Scripting */}
                <select value={shoot.scripting || "Ideation"} onChange={e => updateField(shoot.id, "scripting", e.target.value)}
                  style={{ background: scriptingStyle[shoot.scripting]?.bg || "var(--accent-bg)", color: scriptingStyle[shoot.scripting]?.color || "var(--accent2)", border: "none", borderRadius: 20, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", outline: "none" }}>
                  {SCRIPTING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>

                {/* Assignees */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(Array.isArray(shoot.assignees) ? shoot.assignees : []).slice(0, 3).map((a: string) => (
                    <div key={a} title={a} style={{ width: 26, height: 26, borderRadius: 8, background: colorMap[a] || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{a[0]}</div>
                  ))}
                  {(shoot.assignees?.length || 0) > 3 && <div style={{ width: 26, height: 26, borderRadius: 8, background: "var(--glass2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "var(--text3)", fontWeight: 700 }}>+{shoot.assignees.length - 3}</div>}
                  {(shoot.assignees?.length || 0) === 0 && <span style={{ fontSize: 12, color: "var(--text3)" }}>—</span>}
                </div>

                {/* Priority */}
                <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 700, background: ps.bg, color: ps.color, whiteSpace: "nowrap", textAlign: "center" }}>{shoot.priority}</span>

                {/* Status */}
                <select value={shoot.status || "Scheduled"} onChange={e => updateField(shoot.id, "status", e.target.value)}
                  style={{ background: statusStyle[shoot.status]?.bg || "var(--blue-bg)", color: statusStyle[shoot.status]?.color || "var(--blue)", border: "none", borderRadius: 20, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", outline: "none" }}>
                  {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>

                {/* Actions */}
                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={() => openEdit(shoot)} style={{ width: 30, height: 30, borderRadius: 8, background: "var(--blue-bg)", border: "1px solid rgba(96,165,250,0.2)", color: "var(--blue)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-pencil" style={{ fontSize: 13 }} />
                  </button>
                  <button onClick={() => deleteShoot(shoot.id)} style={{ width: 30, height: 30, borderRadius: 8, background: "var(--red-bg)", border: "1px solid var(--red-border)", color: "var(--red)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <i className="ti ti-trash" style={{ fontSize: 13 }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ maxWidth: 560 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#f97316,#fb923c)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-camera" style={{ fontSize: 17, color: "#fff" }} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{editingId ? "Edit Shoot Plan" : "Plan New Shoot"}</div>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "5px 9px", color: "var(--text2)", cursor: "pointer" }}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={LS}>Shoot Date *</label>
                <input type="date" value={form.shoot_date} onChange={e => setForm({ ...form, shoot_date: e.target.value })} style={IS} />
              </div>
              <div>
                <label style={LS}>Client *</label>
                <select value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} style={IS}>
                  <option value="">Select client…</option>
                  {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>No. of Videos</label>
                <input type="number" min={1} max={100} value={form.video_count} onChange={e => setForm({ ...form, video_count: Number(e.target.value) })} style={IS} />
              </div>
              <div>
                <label style={LS}>Scripting Status</label>
                <select value={form.scripting} onChange={e => setForm({ ...form, scripting: e.target.value })} style={IS}>
                  {SCRIPTING_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} style={IS}>
                  {PRIORITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Shoot Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={IS}>
                  {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              {/* Multi assignee */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LS}>Assignees — click to select multiple</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {members.map(m => {
                    const selected = form.assignees.includes(m.name);
                    return (
                      <button key={m.id} type="button" onClick={() => toggleAssignee(m.name)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, cursor: "pointer", border: selected ? `1px solid ${m.color || "var(--accent)"}` : "1px solid var(--border2)", background: selected ? `${m.color || "var(--accent)"}22` : "rgba(255,255,255,0.03)", color: selected ? (m.color || "var(--accent2)") : "var(--text2)", fontFamily: "inherit", fontSize: 13, fontWeight: selected ? 600 : 400 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: m.color || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{m.name?.[0]}</div>
                        {m.name}
                        {selected && <i className="ti ti-check" style={{ fontSize: 12 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={LS}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any details about this shoot…" rows={2} style={{ ...IS, resize: "vertical" as const }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button onClick={() => setShowModal(false)} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button onClick={save} disabled={!form.client || !form.shoot_date || saving} className="btn-primary" style={{ flex: 2, justifyContent: "center", background: "linear-gradient(135deg,#f97316,#fb923c)", opacity: (!form.client || !form.shoot_date || saving) ? 0.5 : 1 }}>
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Shoot Plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}