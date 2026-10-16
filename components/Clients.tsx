"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const SERVICE_OPTIONS = ["Content", "Meta Ads", "Strategy", "Full Service", "WhatsApp Automation", "Website"];
const STATUS_OPTIONS = ["Active", "In Onboarding", "Paused", "Stop working", "Not Working"];
const COLORS = ["#5646e0","#f472b6","#60a5fa","#4ade80","#fbbf24","#f87171","#9d92ff","#34d399","#a78bfa","#fb7185","#5DCAA5","#f59e0b"];

const ASSIGNMENT_ROLES = [
  { key: "video_editor",      label: "Video Editor",      icon: "ti-video" },
  { key: "ads_manager",       label: "Ads Manager",       icon: "ti-speakerphone" },
  { key: "social_manager",    label: "Social Manager",    icon: "ti-brand-instagram" },
  { key: "graphic_designer",  label: "Graphic Designer",  icon: "ti-brush" },
];

const statusStyle: Record<string, { color: string; bg: string; border: string }> = {
  Active:          { color: "var(--green)",  bg: "var(--green-bg)",          border: "var(--green-border)" },
  "In Onboarding": { color: "var(--blue)",   bg: "var(--blue-bg)",           border: "rgba(96,165,250,0.3)" },
  Paused:          { color: "var(--amber)",  bg: "var(--amber-bg)",          border: "var(--amber-border)" },
  "Stop working":  { color: "var(--red)",    bg: "var(--red-bg)",            border: "var(--red-border)" },
  "Not Working":   { color: "var(--text3)",  bg: "rgba(255,255,255,0.03)",   border: "var(--border)" },
};

const emptyForm = { name: "", industry: "", services: ["Content"], retainer: "", status: "Active", manager: "", contact: "", phone: "", notes: "", color: "#5646e0", brand_type: "Local", followers_at_joining: "", joined_date: "" };

const formatFollowers = (n: number | null | undefined) => {
  if (!n) return "—";
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
};

export default function Clients() {
  const [clients, setClients]       = useState<any[]>([]);
  const [managers, setManagers]     = useState<string[]>([]);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading]       = useState(true);
  const [showModal, setShowModal]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [filter, setFilter]         = useState("All");
  const [search, setSearch]         = useState("");
  const [form, setForm]             = useState<any>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [viewClient, setViewClient] = useState<any>(null);
  const [saveError, setSaveError]   = useState("");
  const [healthData, setHealthData] = useState<Record<string, { score: "green" | "amber" | "red"; tips: string[] }>>({});

  useEffect(() => { fetchClients(); fetchMembers(); fetchAssignments(); fetchHealthData(); }, []);

  useEffect(() => {
    const ch = supabase.channel("clients-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => fetchClients())
      .on("postgres_changes", { event: "*", schema: "public", table: "client_assignments" }, () => fetchAssignments())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchClients = async () => {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (data) setClients(data);
    setLoading(false);
  };

  const fetchMembers = async () => {
    const { data } = await supabase.from("profiles").select("id, name, color").neq("status", "left").order("created_at");
    if (data) {
      setAllMembers(data);
      setManagers(data.map((p: any) => p.name));
    }
  };

  const fetchHealthData = async () => {
    const now = new Date();
    const day = (d: Date) => Math.floor((now.getTime() - d.getTime()) / 86400000);
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [{ data: txns }, { data: vids }, { data: meets }] = await Promise.all([
      supabase.from("transactions").select("client, date, type").eq("type", "income").order("date", { ascending: false }),
      supabase.from("videos").select("client, posted").eq("month", now.toLocaleString("en", { month: "long", year: "numeric" })),
      supabase.from("meetings").select("client, date").order("date", { ascending: false }),
    ]);
    // Re-fetch clients list for computing
    const { data: cls } = await supabase.from("clients").select("name, status");
    if (!cls) return;
    const map: Record<string, { score: "green" | "amber" | "red"; tips: string[] }> = {};
    for (const cl of cls) {
      if (cl.status !== "Active") continue;
      const tips: string[] = [];
      // Last payment
      const lastPay = (txns || []).filter((t: any) => t.client === cl.name).sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
      const payAge = lastPay ? day(new Date(lastPay.date)) : 999;
      if (payAge > 45) tips.push(payAge === 999 ? "No payment recorded" : `Last payment ${payAge}d ago`);
      // Content delivered this month
      const posted = (vids || []).filter((v: any) => v.client === cl.name).reduce((a: number, b: any) => a + (b.posted || 0), 0);
      if (posted === 0) tips.push("No content posted this month");
      // Last meeting
      const lastMeet = (meets || []).filter((m: any) => m.client === cl.name).sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
      const meetAge = lastMeet ? day(new Date(lastMeet.date)) : 999;
      if (meetAge > 60) tips.push(meetAge === 999 ? "No meeting recorded" : `Last meeting ${meetAge}d ago`);
      const score = tips.length === 0 ? "green" : tips.length === 1 ? "amber" : "red";
      map[cl.name] = { score, tips };
    }
    setHealthData(map);
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

  const saveAssignment = async (clientName: string, role: string, memberId: string, memberName: string) => {
    if (!memberId) {
      await supabase.from("client_assignments").delete().eq("client_name", clientName).eq("role", role);
    } else {
      await supabase.from("client_assignments").upsert(
        [{ client_name: clientName, role, member_id: memberId, member_name: memberName }],
        { onConflict: "org_id,client_name,role" }
      );
    }
    fetchAssignments();
  };

  const filtered = clients
    .filter(c => filter === "All" || c.status === filter)
    .filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.industry?.toLowerCase().includes(search.toLowerCase()));

  const totalRetainer = clients.filter(c => c.status === "Active").reduce((a, b) => a + b.retainer, 0);

  const openAdd  = () => { setEditingId(null); setForm({ ...emptyForm, color: COLORS[clients.length % COLORS.length] }); setShowModal(true); };
  const openEdit = (c: any) => { setEditingId(c.id); setForm({ ...c, retainer: String(c.retainer) }); setShowModal(true); };

  const saveClient = async () => {
    if (!form.name.trim()) return;
    setSaveError("");
    const payload = { ...form, retainer: Number(form.retainer), followers_at_joining: form.followers_at_joining ? Number(form.followers_at_joining) : null };
    if (editingId) {
      const { error } = await supabase.from("clients").update(payload).eq("id", editingId);
      if (error) { setSaveError("Error: " + error.message); return; }
    } else {
      const { error } = await supabase.from("clients").insert([payload]);
      if (error) { setSaveError("Error: " + error.message); return; }
    }
    setShowModal(false);
    fetchClients();
  };

  const deleteClient = async (id: string) => {
    await supabase.from("clients").delete().eq("id", id);
    setDeleteConfirm(null);
    setViewClient(null);
    fetchClients();
  };

  const toggleService = (s: string) => {
    const cur = form.services || [];
    setForm({ ...form, services: cur.includes(s) ? cur.filter((x: string) => x !== s) : [...cur, s] });
  };

  const IS = { width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 14, outline: "none" };
  const LS = { fontSize: 11, fontWeight: 600 as const, color: "var(--text3)", display: "block" as const, marginBottom: 7, textTransform: "uppercase" as const, letterSpacing: ".6px" };
  const SS = { background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "5px 10px", color: "var(--text)", fontFamily: "inherit", fontSize: 13, outline: "none", cursor: "pointer" };

  return (
    <div className="page-wrap">

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Clients</div>
          <div style={{ fontSize: 15, color: "var(--text2)", marginTop: 6 }}>
            {clients.filter(c => c.status === "Active").length} active clients · ₹{totalRetainer.toLocaleString("en-IN")}/mo total retainer
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary" style={{ padding: "10px 20px", fontSize: 14 }}>
          <i className="ti ti-plus" /> Add Client
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", flex: 1, maxWidth: 300 }}>
          <i className="ti ti-search" style={{ color: "var(--text3)", fontSize: 16 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients…"
            style={{ background: "none", border: "none", color: "var(--text)", fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%" }} />
        </div>
        <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.03)", padding: 5, borderRadius: 12, border: "1px solid var(--border)" }}>
          {["All", "Active", "In Onboarding", "Paused", "Stop working", "Not Working"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", background: filter === f ? "rgba(255,255,255,0.08)" : "transparent", color: filter === f ? "var(--text)" : "var(--text3)", transition: "all .15s" }}>{f}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} />
          <div style={{ marginTop: 12, fontSize: 15 }}>Loading clients...</div>
        </div>
      ) : (
        <div className="table-scroll">
          <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", background: "rgba(255,255,255,0.01)", minWidth: 640 }}>
            <table className="crm-table" style={{ width: "100%" }}>
              <thead>
                <tr>{["Client", "Industry", "Services", "Retainer", "Followers", "Joined", "Status", "Manager", "Team", "Actions"].map((h, i) => <th key={i}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const ss = statusStyle[c.status] || statusStyle["Not Working"];
                  const clientAssign = assignments[c.name] || {};
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${c.color}22`, border: `1px solid ${c.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: c.color, flexShrink: 0 }}>{c.name[0]}</div>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{c.name}</span>
                              {c.brand_type === "D2C" && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "rgba(124,110,245,0.15)", color: "var(--accent2)", border: "1px solid rgba(124,110,245,0.3)", letterSpacing: ".4px" }}>D2C</span>}
                              {healthData[c.name] && (() => {
                                const h = healthData[c.name];
                                const col = h.score === "green" ? "#4ade80" : h.score === "amber" ? "#fbbf24" : "#f87171";
                                return (
                                  <span title={h.tips.length ? h.tips.join(" · ") : "Client is healthy"} style={{ width: 9, height: 9, borderRadius: "50%", background: col, display: "inline-block", flexShrink: 0, boxShadow: `0 0 6px ${col}99`, cursor: "default" }} />
                                );
                              })()}
                            </div>
                            {c.contact && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>{c.contact}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: 14 }}>{c.industry}</td>
                      <td>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {(c.services || []).map((s: string, j: number) => (
                            <span key={j} style={{ background: "var(--accent-bg)", color: "var(--accent2)", fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 600, border: "1px solid var(--accent-border)" }}>{s}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700, color: "var(--text)", fontSize: 15 }}>₹{c.retainer?.toLocaleString("en-IN")}</td>
                      <td style={{ fontSize: 13, color: "var(--text2)", fontWeight: 600 }}>{formatFollowers(c.followers_at_joining)}</td>
                      <td style={{ fontSize: 13, color: "var(--text3)" }}>{c.joined_date ? new Date(c.joined_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                      <td><span style={{ background: ss.bg, color: ss.color, fontSize: 12, padding: "4px 11px", borderRadius: 20, fontWeight: 600, border: `1px solid ${ss.border}` }}>{c.status}</span></td>
                      <td style={{ fontSize: 14, color: "var(--text2)" }}>{c.manager}</td>
                      <td>
                        {/* Team assignment chips */}
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          {ASSIGNMENT_ROLES.map(r => {
                            const a = clientAssign[r.key];
                            if (!a) return null;
                            const m = allMembers.find((x: any) => x.id === a.member_id);
                            return (
                              <div key={r.key} title={`${r.label}: ${a.member_name}`}
                                style={{ width: 28, height: 28, borderRadius: 8, background: `${m?.color || "#94a3b8"}22`, border: `1.5px solid ${m?.color || "#94a3b8"}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: m?.color || "#94a3b8", cursor: "default" }}>
                                {a.member_name?.[0]}
                              </div>
                            );
                          })}
                          {Object.keys(clientAssign).length === 0 && <span style={{ fontSize: 12, color: "var(--text3)" }}>—</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          {c.phone && (
                            <a href={`https://wa.me/91${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
                              title={`WhatsApp ${c.contact || c.name}`}
                              style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)", borderRadius: 8, padding: "6px 10px", color: "#25d366", fontSize: 14, display: "flex", alignItems: "center", textDecoration: "none" }}>
                              <i className="ti ti-brand-whatsapp" />
                            </a>
                          )}
                          {[{ icon: "ti-eye", color: "var(--text2)", action: () => setViewClient(c) }, { icon: "ti-pencil", color: "var(--blue)", action: () => openEdit(c) }, { icon: "ti-trash", color: "var(--red)", action: () => setDeleteConfirm(c.id) }].map((btn, i) => (
                            <button key={i} onClick={btn.action} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: btn.color, cursor: "pointer", fontSize: 14 }}><i className={`ti ${btn.icon}`} /></button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
                <i className="ti ti-building-store" style={{ fontSize: 40, opacity: .2 }} />
                <div style={{ marginTop: 12, fontSize: 15 }}>No clients yet — add your first one!</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 540, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>{editingId ? "Edit Client" : "Add New Client"}</div>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" style={{ fontSize: 16 }} /></button>
            </div>
            <div className="modal-2col" style={{ gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}><label style={LS}>Client Name *</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Ozmo Fitness" style={IS} /></div>
              <div><label style={LS}>Industry</label><input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} placeholder="e.g. Fitness" style={IS} /></div>
              <div><label style={LS}>Contact Person</label><input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Founder name" style={IS} /></div>
              <div><label style={LS}>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 XXXXX XXXXX" style={IS} /></div>
              <div><label style={LS}>Monthly Retainer (₹)</label><input value={form.retainer} onChange={e => setForm({ ...form, retainer: e.target.value })} placeholder="75000" style={IS} type="number" /></div>
              <div><label style={LS}>Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={IS}>{STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}</select></div>
              <div><label style={LS}>Followers When Joined</label><input value={form.followers_at_joining} onChange={e => setForm({ ...form, followers_at_joining: e.target.value })} placeholder="e.g. 12400" style={IS} type="number" /></div>
              <div><label style={LS}>Date of Joining</label><input value={form.joined_date} onChange={e => setForm({ ...form, joined_date: e.target.value })} style={IS} type="date" /></div>
              <div><label style={LS}>Account Manager</label><select value={form.manager} onChange={e => setForm({ ...form, manager: e.target.value })} style={IS}>{managers.map(s => <option key={s}>{s}</option>)}</select></div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Brand Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {["Local", "D2C"].map(type => (
                    <button key={type} onClick={() => setForm({ ...form, brand_type: type })}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", border: "1px solid", transition: "all .15s", fontFamily: "inherit", borderColor: form.brand_type === type ? "var(--accent)" : "var(--border2)", background: form.brand_type === type ? "var(--accent-bg)" : "transparent", color: form.brand_type === type ? "var(--accent2)" : "var(--text3)" }}>
                      {type === "D2C" ? "D2C Brand" : "Local Brand"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Services</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {SERVICE_OPTIONS.map(s => (
                    <button key={s} onClick={() => toggleService(s)} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid", transition: "all .15s", borderColor: form.services?.includes(s) ? "var(--accent)" : "var(--border2)", background: form.services?.includes(s) ? "var(--accent-bg)" : "transparent", color: form.services?.includes(s) ? "var(--accent2)" : "var(--text3)" }}>{s}</button>
                  ))}
                </div>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Avatar Color</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {COLORS.map(col => (<div key={col} onClick={() => setForm({ ...form, color: col })} style={{ width: 26, height: 26, borderRadius: 7, background: col, cursor: "pointer", border: form.color === col ? "2px solid white" : "2px solid transparent" }} />))}
                </div>
              </div>
              <div style={{ gridColumn: "1/-1" }}><label style={LS}>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any notes about this client…" rows={3} style={{ ...IS, resize: "vertical" as const }} /></div>
            </div>
            {saveError && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, fontSize: 13, color: "var(--red)" }}>{saveError}</div>
            )}
            <button onClick={saveClient} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15, marginTop: 20 }}>{editingId ? "Save Changes" : "Add Client"}</button>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm !== null && (
        <div onClick={() => setDeleteConfirm(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 380, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🗑️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete Client?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24 }}>This will permanently remove <strong style={{ color: "var(--text)" }}>{clients.find(c => c.id === deleteConfirm)?.name}</strong>.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={() => deleteClient(deleteConfirm)} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* View Client Modal */}
      {viewClient && (
        <div onClick={() => setViewClient(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 480, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: 14, background: `${viewClient.color}22`, border: `1px solid ${viewClient.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: viewClient.color }}>{viewClient.name[0]}</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>{viewClient.name}</div>
                <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>{viewClient.industry}</div>
              </div>
              <button onClick={() => setViewClient(null)} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>

            {[
              { label: "Brand Type",            val: viewClient.brand_type || "Local" },
              { label: "Retainer",              val: `₹${viewClient.retainer?.toLocaleString("en-IN")}/mo` },
              { label: "Status",                val: viewClient.status },
              { label: "Manager",               val: viewClient.manager },
              { label: "Followers When Joined", val: formatFollowers(viewClient.followers_at_joining) },
              { label: "Date of Joining",       val: viewClient.joined_date ? new Date(viewClient.joined_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "—" },
              { label: "Contact",               val: viewClient.contact || "—" },
              { label: "Phone",                 val: viewClient.phone || "—" },
            ].map((r, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                <span style={{ color: "var(--text3)" }}>{r.label}</span>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{r.val}</span>
              </div>
            ))}

            {/* Services */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 600 }}>Services</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(viewClient.services || []).map((s: string, i: number) => (<span key={i} style={{ background: "var(--accent-bg)", color: "var(--accent2)", fontSize: 13, padding: "4px 12px", borderRadius: 20, fontWeight: 600, border: "1px solid var(--accent-border)" }}>{s}</span>))}
              </div>
            </div>

            {/* Team Assignments */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".6px", fontWeight: 600 }}>
                <i className="ti ti-robot" style={{ marginRight: 6 }} />Team Assignments
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>Agent uses these to auto-assign tasks for this client.</div>
              {ASSIGNMENT_ROLES.map(role => {
                const assigned = assignments[viewClient.name]?.[role.key];
                const assignedMember = assigned ? allMembers.find((m: any) => m.id === assigned.member_id) : null;
                return (
                  <div key={role.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <i className={`ti ${role.icon}`} style={{ color: "var(--text3)", fontSize: 15 }} />
                      <span style={{ fontSize: 13, color: "var(--text2)", fontWeight: 600 }}>{role.label}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {assignedMember && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 24, height: 24, borderRadius: 7, background: `${assignedMember.color}22`, border: `1.5px solid ${assignedMember.color}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: assignedMember.color }}>
                            {assignedMember.name[0]}
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{assignedMember.name}</span>
                        </div>
                      )}
                      <select
                        value={assigned?.member_id || ""}
                        onChange={e => {
                          const m = allMembers.find((x: any) => x.id === e.target.value);
                          saveAssignment(viewClient.name, role.key, e.target.value, m?.name || "");
                        }}
                        style={SS}
                      >
                        <option value="">{assigned ? "— Remove —" : "— Assign —"}</option>
                        {allMembers.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>

            {viewClient.notes && (<div style={{ marginTop: 16, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 14, fontSize: 14, color: "var(--text2)", border: "1px solid var(--border)" }}>📝 {viewClient.notes}</div>)}
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={() => { setViewClient(null); openEdit(viewClient); }} className="btn-primary" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}><i className="ti ti-pencil" /> Edit Client</button>
              <button onClick={() => { setViewClient(null); setDeleteConfirm(viewClient.id); }} style={{ padding: "11px 16px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, color: "var(--red)", cursor: "pointer", fontWeight: 600, fontSize: 14 }}><i className="ti ti-trash" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
