"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

interface LeadsProps {
  profile: any;
  isAdmin: boolean;
}

const STATUS_OPTIONS = ["Call", "Gmeet", "Meeting", "Converted", "Lost"];
const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  Call:      { bg: "rgba(59,130,246,0.15)",  color: "#60a5fa", border: "rgba(59,130,246,0.3)"  },
  Gmeet:     { bg: "rgba(139,92,246,0.15)",  color: "#a78bfa", border: "rgba(139,92,246,0.3)"  },
  Meeting:   { bg: "rgba(245,158,11,0.15)",  color: "#fbbf24", border: "rgba(245,158,11,0.3)"  },
  Converted: { bg: "rgba(16,185,129,0.15)",  color: "#34d399", border: "rgba(16,185,129,0.3)"  },
  Lost:      { bg: "rgba(239,68,68,0.15)",   color: "#f87171", border: "rgba(239,68,68,0.3)"   },
};

const emptyForm = {
  name: "", mobile: "", brand_name: "", brand_details: "",
  remarks: "", status: "Call", status_date: "", follow_up_date: "", follow_up_note: "",
};

export default function Leads({ profile, isAdmin }: LeadsProps) {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editLead, setEditLead] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [datePickerId, setDatePickerId] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<string>("");
  const [pendingDate, setPendingDate] = useState("");
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpNote, setFollowUpNote] = useState("");
  const [convertId, setConvertId] = useState<string | null>(null);
  const [convertForm, setConvertForm] = useState({ retainer: "", industry: "", notes: "" });
  const [toast, setToast] = useState<string | null>(null);
  const [deleteLeadId, setDeleteLeadId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "funnel">("list");

  useEffect(() => { fetchLeads(); }, []);

  useEffect(() => {
    const ch = supabase.channel("leads-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    const { data } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (data) setLeads(data);
    setLoading(false);
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd = () => { setForm({ ...emptyForm }); setEditLead(null); setShowModal(true); };
  const openEdit = (lead: any) => { setForm({ ...emptyForm, ...lead }); setEditLead(lead); setShowModal(true); };

  const saveLead = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      status_date:    form.status_date    || null,
      follow_up_date: form.follow_up_date || null,
      updated_at: new Date().toISOString(),
    };

    if (editLead) {
      const { error } = await supabase.from("leads").update(payload).eq("id", editLead.id);
      if (error) { setSaving(false); showToast("Save failed. Please try again."); return; }
      if (form.status === "Meeting" && form.status_date) await promotToMeeting({ ...editLead, ...payload });
    } else {
      const { data, error } = await supabase.from("leads").insert([{ ...payload, created_at: new Date().toISOString() }]).select().single();
      if (error || !data) { setSaving(false); showToast("Save failed. Please try again."); return; }
      if (form.status === "Meeting" && form.status_date) await promotToMeeting(data);
    }

    setSaving(false);
    setShowModal(false);
    fetchLeads();
    showToast(editLead ? "Lead updated!" : "Lead added!");
  };

  const promotToMeeting = async (lead: any) => {
    const { error } = await supabase.from("meetings").insert([{
      client_name: lead.brand_name || lead.name,
      contact_name: lead.name,
      contact_mobile: lead.mobile,
      reason: lead.brand_details || "",
      remarks: lead.remarks || "",
      date: lead.status_date,
      status: "Scheduled",
      source: "lead",
      lead_id: lead.id,
      created_at: new Date().toISOString(),
    }]);
    if (!error) await supabase.from("leads").update({ status: "Meeting", promoted: true }).eq("id", lead.id);
  };

  const handleStatusClick = (lead: any, status: string) => {
    if (status === "Meeting" || status === "Call" || status === "Gmeet") {
      setDatePickerId(lead.id);
      setPendingStatus(status);
      setPendingDate(lead.status_date || "");
    } else {
      applyStatus(lead.id, status, "");
    }
  };

  const applyStatus = async (id: string, status: string, date: string) => {
    await supabase.from("leads").update({ status, status_date: date || null, updated_at: new Date().toISOString() }).eq("id", id);
    if (status === "Meeting" && date) {
      const lead = leads.find(l => l.id === id);
      if (lead) await promotToMeeting({ ...lead, status_date: date });
      showToast("Lead promoted to Meetings! 🎉");
    }
    setDatePickerId(null);
    fetchLeads();
  };

  const saveFollowUp = async () => {
    if (!followUpId) return;
    await supabase.from("leads").update({ follow_up_date: followUpDate, follow_up_note: followUpNote, updated_at: new Date().toISOString() }).eq("id", followUpId);
    setFollowUpId(null); setFollowUpDate(""); setFollowUpNote("");
    fetchLeads();
    showToast("Follow-up scheduled!");
  };

  const convertToClient = async () => {
    const lead = leads.find(l => l.id === convertId);
    if (!lead) return;
    const retainer = Math.max(0, Number(convertForm.retainer) || 0);
    const { error } = await supabase.from("clients").insert([{
      name: lead.brand_name || lead.name,
      contact_name: lead.name,
      mobile: lead.mobile,
      industry: convertForm.industry,
      retainer,
      notes: convertForm.notes,
      status: "Active",
      created_at: new Date().toISOString(),
    }]);
    if (error) { showToast("Conversion failed. Please try again."); return; }
    await supabase.from("leads").update({ status: "Converted", updated_at: new Date().toISOString() }).eq("id", convertId);
    setConvertId(null); setConvertForm({ retainer: "", industry: "", notes: "" });
    fetchLeads();
    showToast("Lead converted to Client! 🎊");
  };

  const deleteLead = async () => {
    if (!deleteLeadId) return;
    const { error } = await supabase.from("leads").delete().eq("id", deleteLeadId);
    setDeleteLeadId(null);
    if (error) { showToast("Delete failed. Please try again."); return; }
    fetchLeads();
    showToast("Lead deleted.");
  };

  const filtered = leads.filter(l => {
    const matchSearch = l.name?.toLowerCase().includes(search.toLowerCase()) || l.brand_name?.toLowerCase().includes(search.toLowerCase()) || l.mobile?.includes(search);
    const matchStatus = filterStatus === "All" || l.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const fmt = (d: string) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
  const isOverdue = (d: string): boolean => !!d && new Date(d) < new Date();

  return (
    <div className="page-wrap">
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, right: 28, background: "linear-gradient(135deg,#10b981,#34d399)", color: "#fff", padding: "12px 22px", borderRadius: 14, fontSize: 14, fontWeight: 600, zIndex: 9999, boxShadow: "0 8px 24px rgba(16,185,129,0.4)", animation: "fadeIn 0.2s" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Leads</div>
          <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 4 }}>{leads.length} total · {leads.filter(l => l.status !== "Converted" && l.status !== "Lost").length} active</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)", borderRadius: 10, padding: 3 }}>
            {(["list", "funnel"] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 5, background: viewMode === m ? "rgba(255,255,255,0.1)" : "transparent", color: viewMode === m ? "var(--text)" : "var(--text3)", transition: "all .15s" }}>
                <i className={`ti ${m === "list" ? "ti-layout-grid" : "ti-filter"}`} /> {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 12, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(99,102,241,0.4)" }}>
            <i className="ti ti-plus" style={{ fontSize: 16 }} /> Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220, position: "relative" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text3)", fontSize: 15 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..." style={{ width: "100%", padding: "10px 12px 10px 36px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["All", ...STATUS_OPTIONS].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)} style={{ padding: "8px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", border: filterStatus === s ? "1px solid rgba(99,102,241,0.5)" : "1px solid var(--border)", background: filterStatus === s ? "rgba(99,102,241,0.2)" : "var(--glass2)", color: filterStatus === s ? "#a5b4fc" : "var(--text2)" }}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Stat pills */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        {STATUS_OPTIONS.map(s => {
          const count = leads.filter(l => l.status === s).length;
          const st = STATUS_COLORS[s];
          return (
            <div key={s} style={{ padding: "6px 16px", borderRadius: 20, background: st.bg, border: `1px solid ${st.border}`, fontSize: 12, fontWeight: 700, color: st.color }}>
              {count} {s}
            </div>
          );
        })}
      </div>

      {/* ── Funnel Kanban View ── */}
      {viewMode === "funnel" && (
        <div style={{ overflowX: "auto", paddingBottom: 12 }}>
          <div style={{ display: "flex", gap: 12, minWidth: "max-content", alignItems: "flex-start" }}>
            {STATUS_OPTIONS.map(stage => {
              const st = STATUS_COLORS[stage];
              const stageLeads = leads.filter(l => l.status === stage);
              const stageIdx = STATUS_OPTIONS.indexOf(stage);
              return (
                <div key={stage} style={{ width: 260, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px 10px 0 0", background: st.bg, border: `1px solid ${st.border}`, borderBottom: "none" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{stage}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: st.border, color: st.color, borderRadius: 20, padding: "1px 8px" }}>{stageLeads.length}</span>
                  </div>
                  <div style={{ border: `1px solid ${st.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", minHeight: 60, background: "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column" }}>
                    {stageLeads.length === 0 ? (
                      <div style={{ padding: "18px 12px", textAlign: "center", color: "var(--text3)", fontSize: 12 }}>No leads</div>
                    ) : stageLeads.map((lead, i) => {
                      const hasFollowUp = lead.follow_up_date;
                      const followOverdue = hasFollowUp && isOverdue(lead.follow_up_date);
                      return (
                        <div key={lead.id} style={{ padding: "10px 12px", borderTop: i > 0 ? "1px solid var(--border)" : "none" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>{lead.brand_name || lead.name}</div>
                              {lead.brand_name && <div style={{ fontSize: 11, color: "var(--text3)" }}>{lead.name}</div>}
                            </div>
                            <button onClick={() => openEdit(lead)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 13, padding: "0 2px" }}><i className="ti ti-edit" /></button>
                          </div>
                          {lead.mobile && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text3)", marginBottom: 6 }}>
                              {lead.mobile}
                              <a href={`https://wa.me/91${lead.mobile.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={{ color: "#25d366" }}>
                                <i className="ti ti-brand-whatsapp" style={{ fontSize: 13 }} />
                              </a>
                            </div>
                          )}
                          {hasFollowUp && (
                            <div style={{ fontSize: 11, fontWeight: 600, color: followOverdue ? "#f87171" : "var(--text3)", marginBottom: 6 }}>
                              <i className={`ti ${followOverdue ? "ti-alert-triangle" : "ti-clock"}`} style={{ marginRight: 3 }} />
                              {fmt(lead.follow_up_date)}
                            </div>
                          )}
                          {/* Move to next/prev stage */}
                          {isAdmin && stage !== "Converted" && stage !== "Lost" && (
                            <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                              {stageIdx > 0 && stageIdx < 3 && (
                                <button onClick={() => applyStatus(lead.id, STATUS_OPTIONS[stageIdx - 1], "")}
                                  style={{ flex: 1, padding: "4px 0", borderRadius: 6, border: "1px solid var(--border2)", background: "transparent", color: "var(--text3)", cursor: "pointer", fontSize: 10, fontFamily: "inherit" }}>← Back</button>
                              )}
                              {stageIdx < 2 ? (
                                <button onClick={() => { setDatePickerId(lead.id); setPendingStatus(STATUS_OPTIONS[stageIdx + 1]); setPendingDate(""); }}
                                  style={{ flex: 2, padding: "4px 0", borderRadius: 6, border: `1px solid ${STATUS_COLORS[STATUS_OPTIONS[stageIdx + 1]]?.border}`, background: STATUS_COLORS[STATUS_OPTIONS[stageIdx + 1]]?.bg, color: STATUS_COLORS[STATUS_OPTIONS[stageIdx + 1]]?.color, cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit" }}>
                                  → {STATUS_OPTIONS[stageIdx + 1]}
                                </button>
                              ) : stage === "Meeting" && (
                                <button onClick={() => setConvertId(lead.id)}
                                  style={{ flex: 2, padding: "4px 0", borderRadius: 6, border: "1px solid rgba(16,185,129,0.4)", background: "rgba(16,185,129,0.12)", color: "#34d399", cursor: "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit" }}>
                                  → Convert
                                </button>
                              )}
                            </div>
                          )}
                          {/* Date picker inline */}
                          {datePickerId === lead.id && (
                            <div style={{ marginTop: 8, background: "var(--card)", border: "1px solid var(--border2)", borderRadius: 8, padding: 10 }}>
                              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>Date for {pendingStatus}</div>
                              <input type="date" value={pendingDate} onChange={e => setPendingDate(e.target.value)} style={{ width: "100%", padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text)", fontSize: 12, outline: "none", boxSizing: "border-box" as const }} />
                              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                <button onClick={() => setDatePickerId(null)} style={{ flex: 1, padding: "5px 0", borderRadius: 6, border: "1px solid var(--border2)", background: "transparent", color: "var(--text3)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>Cancel</button>
                                <button onClick={() => applyStatus(lead.id, pendingStatus, pendingDate)} disabled={!pendingDate} style={{ flex: 2, padding: "5px 0", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: pendingDate ? "pointer" : "not-allowed", fontSize: 11, fontWeight: 700, fontFamily: "inherit", opacity: pendingDate ? 1 : 0.5 }}>Confirm</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Leads grid (List view) ── */}
      {viewMode === "list" && (loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}><i className="ti ti-loader" style={{ fontSize: 32 }} /></div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)", fontSize: 15 }}>No leads found. Add your first lead!</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {filtered.map(lead => {
            const st = STATUS_COLORS[lead.status] || STATUS_COLORS["Call"];
            const isDatePicking = datePickerId === lead.id;
            const hasFollowUp = lead.follow_up_date;
            const followOverdue = hasFollowUp && isOverdue(lead.follow_up_date);
            return (
              <div key={lead.id} style={{ borderRadius: 18, background: "linear-gradient(145deg,var(--glass),var(--glass2))", border: "1px solid var(--border)", padding: 20, position: "relative", overflow: "hidden" }}>
                {/* Top accent */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: st.color, borderRadius: "18px 18px 0 0" }} />

                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: st.bg, border: `1px solid ${st.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: st.color }}>
                      {(lead.brand_name || lead.name)?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{lead.brand_name || lead.name}</div>
                      {lead.brand_name && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{lead.name}</div>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => openEdit(lead)} style={{ background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 8px", cursor: "pointer", color: "var(--text2)", fontSize: 13 }}><i className="ti ti-edit" /></button>
                    {isAdmin && <button onClick={() => setDeleteLeadId(lead.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "5px 8px", cursor: "pointer", color: "#f87171", fontSize: 13 }}><i className="ti ti-trash" /></button>}
                  </div>
                </div>

                {/* Info */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {lead.mobile && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text2)" }}>
                      <i className="ti ti-phone" style={{ fontSize: 13, color: "var(--text3)" }} /> {lead.mobile}
                      <a href={`https://wa.me/91${lead.mobile.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                        title="Open WhatsApp" style={{ display: "flex", alignItems: "center", color: "#25d366", textDecoration: "none", marginLeft: 4 }}>
                        <i className="ti ti-brand-whatsapp" style={{ fontSize: 14 }} />
                      </a>
                    </div>
                  )}
                  {lead.brand_details && (
                    <div style={{ fontSize: 12, color: "var(--text3)", lineHeight: 1.5 }}>{lead.brand_details}</div>
                  )}
                  {lead.remarks && (
                    <div style={{ fontSize: 12, color: "var(--text2)", background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", marginTop: 2 }}>
                      <span style={{ color: "var(--text3)" }}>Note: </span>{lead.remarks}
                    </div>
                  )}
                </div>

                {/* Status row */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 7, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</div>
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {STATUS_OPTIONS.slice(0, 3).map(s => {
                      const c = STATUS_COLORS[s];
                      const isActive = lead.status === s;
                      return (
                        <button key={s} onClick={() => handleStatusClick(lead, s)}
                          style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", border: isActive ? `1px solid ${c.border}` : "1px solid var(--border)", background: isActive ? c.bg : "transparent", color: isActive ? c.color : "var(--text3)" }}>
                          {s}
                        </button>
                      );
                    })}
                    {lead.status !== "Converted" && lead.status !== "Lost" && (
                      <button onClick={() => { setConvertId(lead.id); setConvertForm({ retainer: "", industry: lead.brand_details || "", notes: lead.remarks || "" }); }} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.1)", color: "#34d399" }}>
                        → Client
                      </button>
                    )}
                    <button onClick={() => applyStatus(lead.id, "Lost", "")} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", border: lead.status === "Lost" ? "1px solid rgba(239,68,68,0.4)" : "1px solid var(--border)", background: lead.status === "Lost" ? "rgba(239,68,68,0.15)" : "transparent", color: lead.status === "Lost" ? "#f87171" : "var(--text3)" }}>
                      Lost
                    </button>
                  </div>

                  {/* Inline date picker */}
                  {isDatePicking && (
                    <div style={{ marginTop: 10, padding: 12, background: "var(--glass2)", border: "1px solid var(--border)", borderRadius: 12 }}>
                      <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8, fontWeight: 600 }}>Set date for {pendingStatus}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="date" value={pendingDate} onChange={e => setPendingDate(e.target.value)}
                          style={{ flex: 1, padding: "7px 10px", borderRadius: 8, background: "var(--glass)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none" }} />
                        <button onClick={() => applyStatus(lead.id, pendingStatus, pendingDate)} disabled={!pendingDate}
                          style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(99,102,241,0.8)", color: "#fff", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Confirm</button>
                        <button onClick={() => setDatePickerId(null)} style={{ padding: "7px 10px", borderRadius: 8, background: "transparent", color: "var(--text3)", border: "1px solid var(--border)", fontSize: 12, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  )}

                  {lead.status_date && (
                    <div style={{ marginTop: 8, fontSize: 12, color: STATUS_COLORS[lead.status]?.color || "var(--text2)" }}>
                      <i className="ti ti-calendar" style={{ fontSize: 11, marginRight: 4 }} />{lead.status} on {fmt(lead.status_date)}
                    </div>
                  )}
                </div>

                {/* Follow-up */}
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  {followUpId === lead.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, background: "var(--glass)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none" }} />
                      <input value={followUpNote} onChange={e => setFollowUpNote(e.target.value)} placeholder="Follow-up note..." style={{ padding: "7px 10px", borderRadius: 8, background: "var(--glass)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none" }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={saveFollowUp} style={{ flex: 1, padding: "7px", borderRadius: 8, background: "rgba(99,102,241,0.7)", color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save</button>
                        <button onClick={() => setFollowUpId(null)} style={{ padding: "7px 12px", borderRadius: 8, background: "transparent", border: "1px solid var(--border)", color: "var(--text3)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      {hasFollowUp ? (
                        <div style={{ fontSize: 12, color: followOverdue ? "#f87171" : "#fbbf24", display: "flex", alignItems: "center", gap: 5 }}>
                          <i className="ti ti-bell" style={{ fontSize: 12 }} />
                          Follow-up: {fmt(lead.follow_up_date)}
                          {lead.follow_up_note && <span style={{ color: "var(--text3)", marginLeft: 4 }}>· {lead.follow_up_note}</span>}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>No follow-up set</span>
                      )}
                      <button onClick={() => { setFollowUpId(lead.id); setFollowUpDate(lead.follow_up_date || ""); setFollowUpNote(lead.follow_up_note || ""); }}
                        style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text2)", cursor: "pointer" }}>
                        <i className="ti ti-bell" style={{ fontSize: 11, marginRight: 4 }} />{hasFollowUp ? "Edit" : "Set"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Promoted badge */}
                {lead.promoted && (
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>
                    <i className="ti ti-star-filled" style={{ fontSize: 11 }} /> Promoted to Meeting
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: "var(--sidebar-bg,#0d0d12)", border: "1px solid var(--border)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{editLead ? "Edit Lead" : "Add Lead"}</div>
              <button onClick={() => setShowModal(false)} style={{ background: "transparent", border: "none", color: "var(--text3)", fontSize: 20, cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>
            {[
              { key: "name",         label: "Contact Name *", placeholder: "Full name",       type: "text"   },
              { key: "mobile",       label: "Mobile Number",  placeholder: "+91 98765 43210", type: "tel"    },
              { key: "brand_name",   label: "Brand Name",     placeholder: "Brand / Company", type: "text"   },
              { key: "brand_details",label: "Brand Details",  placeholder: "What they do...", type: "textarea"},
              { key: "remarks",      label: "Remarks",        placeholder: "Notes...",        type: "textarea"},
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
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8, fontWeight: 600 }}>Status</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATUS_OPTIONS.map(s => {
                  const c = STATUS_COLORS[s]; const isActive = form.status === s;
                  return <button key={s} onClick={() => setForm(p => ({ ...p, status: s }))} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: isActive ? `1px solid ${c.border}` : "1px solid var(--border)", background: isActive ? c.bg : "transparent", color: isActive ? c.color : "var(--text3)" }}>{s}</button>;
                })}
              </div>
            </div>
            {(form.status === "Meeting" || form.status === "Call" || form.status === "Gmeet") && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6, fontWeight: 600 }}>Date for {form.status}</div>
                <input type="date" value={form.status_date} onChange={e => setForm(p => ({ ...p, status_date: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: "11px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveLead} disabled={saving || !form.name.trim()} style={{ flex: 2, padding: "11px", borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving..." : editLead ? "Update Lead" : "Add Lead"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to Client Modal */}
      {convertId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
          <div style={{ background: "var(--sidebar-bg,#0d0d12)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#34d399", marginBottom: 6 }}>Convert to Client 🎊</div>
            {(() => { const lead = leads.find(l => l.id === convertId); return lead ? (
              <div style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 10, padding: "10px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{lead.brand_name || lead.name}</div>
                {lead.brand_name && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Contact: {lead.name}{lead.mobile ? ` · ${lead.mobile}` : ""}</div>}
              </div>
            ) : null; })()}
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 16 }}>Review and fill in any missing details.</div>
            {[
              { key: "industry", label: "Industry", placeholder: "e.g. F&B, Fashion, Tech" },
              { key: "retainer", label: "Monthly Retainer (₹)", placeholder: "e.g. 50000" },
              { key: "notes",    label: "Notes", placeholder: "Any extra info..." },
            ].map(f => (
              <div key={f.key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 6, fontWeight: 600 }}>{f.label}</div>
                <input value={(convertForm as any)[f.key]} onChange={e => setConvertForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setConvertId(null)} style={{ flex: 1, padding: "11px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={convertToClient} style={{ flex: 2, padding: "11px", borderRadius: 10, background: "linear-gradient(135deg,#10b981,#34d399)", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Convert to Client</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Lead Confirmation */}
      {deleteLeadId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 }}>
          <div style={{ background: "var(--sidebar-bg,#0d0d12)", border: "1px solid var(--border)", borderRadius: 16, padding: 28, width: 320 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Delete Lead?</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 22 }}>This action cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteLeadId(null)} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "var(--glass2)", border: "1px solid var(--border)", color: "var(--text2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={deleteLead} style={{ flex: 1, padding: "10px", borderRadius: 10, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.35)", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}