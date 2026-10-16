"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

interface MeetingsProps {
  profile: any;
  isAdmin: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Scheduled:  { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)"  },
  Completed:  { bg: "rgba(16,185,129,0.15)",  color: "#34d399", border: "rgba(16,185,129,0.3)"  },
  Cancelled:  { bg: "rgba(239,68,68,0.15)",   color: "#f87171", border: "rgba(239,68,68,0.3)"   },
  Rescheduled:{ bg: "rgba(245,158,11,0.15)",  color: "#fbbf24", border: "rgba(245,158,11,0.3)"  },
};

const emptyForm = {
  client_name: "", contact_name: "", contact_mobile: "",
  date: "", time: "", reason: "", remarks: "", status: "Scheduled",
};

export default function Meetings({ profile, isAdmin }: MeetingsProps) {
  const [meetings, setMeetings] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editMeeting, setEditMeeting] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"upcoming" | "past" | "all">("upcoming");
  const [toast, setToast] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const ch = supabase.channel("meetings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from("meetings").select("*").order("date", { ascending: true }),
      supabase.from("clients").select("id, name").eq("status", "Active").order("name"),
    ]);
    if (m) setMeetings(m);
    if (c) setClients(c);
    setLoading(false);
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const openAdd = () => { setForm({ ...emptyForm }); setEditMeeting(null); setShowModal(true); };
  const openEdit = (m: any) => { setForm({ ...emptyForm, ...m }); setEditMeeting(m); setShowModal(true); };

  const saveMeeting = async () => {
    if (!form.client_name.trim() || !form.date) return;
    setSaving(true);
    const payload = { ...form, updated_at: new Date().toISOString() };
    const { error } = editMeeting
      ? await supabase.from("meetings").update(payload).eq("id", editMeeting.id)
      : await supabase.from("meetings").insert([{ ...payload, created_at: new Date().toISOString(), created_by: profile?.id }]);
    setSaving(false);
    if (error) { showToast("Save failed. Please try again."); return; }
    setShowModal(false);
    fetchAll();
    showToast(editMeeting ? "Meeting updated!" : "Meeting scheduled!");
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("meetings").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    fetchAll();
  };

  const deleteMeeting = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("meetings").delete().eq("id", deleteId);
    setDeleteId(null);
    if (error) { showToast("Error deleting meeting. Please try again."); return; }
    fetchAll();
    showToast("Meeting deleted.");
  };

  const today = new Date().toISOString().split("T")[0];
  const filtered = meetings.filter(m => {
    const matchSearch = m.client_name?.toLowerCase().includes(search.toLowerCase()) || m.contact_name?.toLowerCase().includes(search.toLowerCase()) || m.reason?.toLowerCase().includes(search.toLowerCase());
    const matchTab = filterTab === "all" ? true : filterTab === "upcoming" ? m.date >= today : m.date < today;
    return matchSearch && matchTab;
  });

  const fmt = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "";
  const isToday = (d: string) => d === today;
  const isPast = (d: string) => d < today;

  const upcoming = meetings.filter(m => m.date >= today).length;
  const todayCount = meetings.filter(m => isToday(m.date)).length;
  const completed = meetings.filter(m => m.status === "Completed").length;

  return (
    <div className="page-wrap">
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, right: 28, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", padding: "12px 22px", borderRadius: 14, fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: "0 8px 24px rgba(99,102,241,0.4)" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Meetings</div>
          <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 4 }}>{upcoming} upcoming · {todayCount} today · {completed} completed</div>
        </div>
        <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(99,102,241,0.4)" }}>
          <i className="ti ti-plus" style={{ fontSize: 16 }} /> Schedule Meeting
        </button>
      </div>

      {/* Stat cards */}
      <div className="stat-grid-3" style={{ marginBottom: 24 }}>
        {[
          { label: "Today",     val: todayCount, icon: "ti-calendar-today", gradient: "linear-gradient(135deg,#f59e0b,#fbbf24)", glow: "rgba(245,158,11,0.3)" },
          { label: "Upcoming",  val: upcoming,   icon: "ti-calendar-event", gradient: "linear-gradient(135deg,#6366f1,#8b5cf6)", glow: "rgba(99,102,241,0.3)" },
          { label: "Completed", val: completed,  icon: "ti-circle-check",   gradient: "linear-gradient(135deg,#10b981,#34d399)", glow: "rgba(16,185,129,0.3)" },
        ].map((s, i) => (
          <div key={i} style={{ borderRadius: 16, padding: "18px 20px", background: s.gradient, boxShadow: `0 6px 24px ${s.glow}`, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className={`ti ${s.icon}`} style={{ fontSize: 20, color: "#fff" }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 22, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text3)", fontSize: 15 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search meetings..." style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: 20, padding: 3 }}>
          {(["upcoming", "past", "all"] as const).map(tab => (
            <button key={tab} onClick={() => setFilterTab(tab)} style={{ padding: "6px 16px", borderRadius: 16, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: filterTab === tab ? "rgba(99,102,241,0.5)" : "transparent", color: filterTab === tab ? "#fff" : "var(--text2)", textTransform: "capitalize" }}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Meetings list */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}><i className="ti ti-loader" style={{ fontSize: 32 }} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)", fontSize: 15 }}>No meetings found.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(meeting => {
            const st = STATUS_COLORS[meeting.status] || STATUS_COLORS["Scheduled"];
            const todayBadge = isToday(meeting.date);
            const pastItem = isPast(meeting.date) && meeting.status !== "Completed";
            return (
              <div key={meeting.id} style={{ borderRadius: 16, background: "var(--glass)", border: `1px solid ${todayBadge ? "rgba(245,158,11,0.4)" : "var(--border)"}`, padding: "18px 22px", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 18, alignItems: "start", boxShadow: todayBadge ? "0 0 0 1px rgba(245,158,11,0.1)" : "none" }}>
                {/* Date block */}
                <div style={{ width: 60, textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: todayBadge ? "#fbbf24" : pastItem ? "var(--text3)" : "var(--text)", lineHeight: 1 }}>
                    {new Date(meeting.date).getDate()}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginTop: 2 }}>
                    {new Date(meeting.date).toLocaleString("en", { month: "short" })}
                  </div>
                  {todayBadge && <div style={{ fontSize: 9, background: "#fbbf24", color: "#000", borderRadius: 4, padding: "2px 6px", fontWeight: 700, marginTop: 4 }}>TODAY</div>}
                </div>

                {/* Info */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{meeting.client_name}</div>
                    {meeting.source === "lead" && <span style={{ fontSize: 10, background: "rgba(245,158,11,0.2)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, padding: "2px 8px", fontWeight: 700 }}>FROM LEAD</span>}
                    <span style={{ fontSize: 11, background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: 20, padding: "2px 10px", fontWeight: 700 }}>{meeting.status}</span>
                  </div>
                  {meeting.contact_name && <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 4 }}><i className="ti ti-user" style={{ fontSize: 12, marginRight: 5, color: "var(--text3)" }} />{meeting.contact_name}{meeting.contact_mobile && ` · ${meeting.contact_mobile}`}</div>}
                  {meeting.reason && <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 4 }}><i className="ti ti-file-text" style={{ fontSize: 12, marginRight: 5, color: "var(--text3)" }} />{meeting.reason}</div>}
                  {meeting.remarks && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4, background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px" }}>{meeting.remarks}</div>}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openEdit(meeting)} style={{ background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 8px", cursor: "pointer", color: "var(--text2)", fontSize: 13 }}><i className="ti ti-edit" /></button>
                    {isAdmin && <button onClick={() => setDeleteId(meeting.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "5px 8px", cursor: "pointer", color: "#f87171", fontSize: 13 }}><i className="ti ti-trash" /></button>}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {["Scheduled", "Completed", "Cancelled", "Rescheduled"].map(s => {
                      const c = STATUS_COLORS[s]; const isActive = meeting.status === s;
                      return <button key={s} onClick={() => updateStatus(meeting.id, s)} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, cursor: "pointer", border: isActive ? `1px solid ${c.border}` : "1px solid var(--border)", background: isActive ? c.bg : "transparent", color: isActive ? c.color : "var(--text3)" }}>{s}</button>;
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: "var(--sidebar-bg,#0d0d12)", border: "1px solid var(--border)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{editMeeting ? "Edit Meeting" : "Schedule Meeting"}</div>
              <button onClick={() => setShowModal(false)} style={{ background: "transparent", border: "none", color: "var(--text3)", fontSize: 20, cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>

            {/* Client picker */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6, fontWeight: 600 }}>Client *</div>
              <select value={form.client_name} onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: form.client_name ? "var(--text)" : "var(--text3)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
                <option value="">Select a client or type below...</option>
                {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              {/* Allow typing custom name too */}
              <input value={form.client_name} onChange={e => setForm(p => ({ ...p, client_name: e.target.value }))} placeholder="Or type client / lead name"
                style={{ width: "100%", padding: "8px 12px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none", marginTop: 6, boxSizing: "border-box" }} />
            </div>

            {[
              { key: "contact_name",   label: "Contact Person",  placeholder: "Name",          type: "text" },
              { key: "contact_mobile", label: "Mobile",          placeholder: "+91 ...",        type: "tel"  },
              { key: "reason",         label: "Reason to Meet",  placeholder: "Purpose...",     type: "text" },
              { key: "remarks",        label: "Remarks",         placeholder: "Extra notes...", type: "textarea" },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6, fontWeight: 600 }}>{f.label}</div>
                {f.type === "textarea" ? (
                  <textarea value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} rows={3}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
                ) : (
                  <input type={f.type} value={(form as any)[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                )}
              </div>
            ))}

            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6, fontWeight: 600 }}>Meeting Date *</div>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6, fontWeight: 600 }}>Meeting Time</div>
                <input type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8, fontWeight: 600 }}>Status</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.keys(STATUS_COLORS).map(s => {
                  const c = STATUS_COLORS[s]; const isActive = form.status === s;
                  return <button key={s} onClick={() => setForm(p => ({ ...p, status: s }))} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: isActive ? `1px solid ${c.border}` : "1px solid var(--border)", background: isActive ? c.bg : "transparent", color: isActive ? c.color : "var(--text3)" }}>{s}</button>;
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveMeeting} disabled={saving || !form.client_name.trim() || !form.date} style={{ flex: 2, padding: "11px", borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving..." : editMeeting ? "Update Meeting" : "Schedule Meeting"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
          <div style={{ background: "var(--sidebar-bg,#0d0d12)", border: "1px solid var(--border)", borderRadius: 16, padding: 28, width: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Delete Meeting?</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 22 }}>This action cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteId(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={deleteMeeting} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}