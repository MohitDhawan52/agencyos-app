"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { authedFetch } from "@/lib/org";

const ROLES = ["member", "admin"];
const POSITIONS = ["Video Editor", "Videographer", "Social Media Manager", "Graphic Designer", "Content Writer", "Meta Ads Manager", "Account Manager", "Operations"];
const COLORS = ["#5646e0","#f472b6","#60a5fa","#4ade80","#fbbf24","#f87171","#9d92ff","#34d399","#a78bfa","#fb7185","#5DCAA5","#f59e0b"];

// ✅ SINGLE SOURCE OF TRUTH — add new pages here only
const ALL_PAGES = [
  { key: "clients",        label: "Clients",           icon: "ti-building-store", default: false },
  { key: "videos",         label: "Video Tracker",     icon: "ti-video",          default: false },
  { key: "tasks",          label: "Tasks",             icon: "ti-checkbox",       default: true  },
  { key: "board",          label: "Board",             icon: "ti-layout-kanban",  default: true  },
  { key: "contentidea",    label: "Content Ideas",     icon: "ti-bulb",           default: true  },
  { key: "creatives",      label: "Creatives",         icon: "ti-photo-video",    default: true  },
  { key: "calendar",       label: "Content Calendar",  icon: "ti-calendar",       default: false },
  { key: "postingtracker", label: "Posting Tracker",   icon: "ti-chart-line",     default: false },
  { key: "leads",          label: "Leads",             icon: "ti-user-plus",      default: false },
  { key: "meetings",       label: "Meetings",          icon: "ti-calendar-event", default: false },
  { key: "shootplanner",   label: "Shoot Planner",     icon: "ti-camera",         default: false },
  { key: "timesheet",      label: "Timesheet",         icon: "ti-clock-record",   default: false },
  // 👆 ADD NEW PAGES HERE — they will automatically appear everywhere
];

const defaultPermissions = ALL_PAGES.reduce(
  (acc, p) => ({ ...acc, [p.key]: p.default }),
  {} as Record<string, boolean>
);

// Strip underscores/spaces from keys so old DB values (e.g. shoot_planner) map to current keys
const normalizePermKeys = (perms: Record<string, boolean>) => {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(perms)) {
    out[k.replace(/[_\s]/g, "").toLowerCase()] = v;
  }
  return out;
};

const emptyForm = {
  name: "", email: "", password: "", role: "member",
  color: "#5646e0", phone: "", position: "", permissions: { ...defaultPermissions }
};

export default function Team() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => { fetchMembers(); }, []);

  const fetchMembers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: true });
    if (data) setMembers(data);
    setLoading(false);
  };

  const openAdd = () => {
    setEditingId(null);
    setErrorMsg("");
    setForm({ ...emptyForm, color: COLORS[members.length % COLORS.length] });
    setShowModal(true);
  };

  const openEdit = (m: any) => {
    setEditingId(m.id);
    setErrorMsg("");
    setForm({
      name: m.name || "",
      email: m.email || "",
      password: "",
      role: m.role || "member",
      color: m.color || "#5646e0",
      phone: m.phone || "",
      position: m.position || "",
      permissions: { ...defaultPermissions, ...normalizePermKeys(m.permissions || {}) }
    });
    setShowModal(true);
  };

  const saveMember = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setErrorMsg("Name and email are required.");
      return;
    }
    if (!editingId && !form.password.trim()) {
      setErrorMsg("Password is required for new members.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      if (editingId) {
        const { error } = await supabase.from("profiles").update({
          name: form.name,
          email: form.email,
          role: form.role,
          color: form.color,
          phone: form.phone,
          position: form.position,
          permissions: form.permissions,
        }).eq("id", editingId);
        if (error) { setErrorMsg(error.message); setSaving(false); return; }
        setShowModal(false);
        fetchMembers();
      } else {
        const { ok, json } = await authedFetch("/api/team/create", {
          email: form.email,
          password: form.password,
          name: form.name,
          role: form.role,
          color: form.color,
          phone: form.phone,
          position: form.position,
          permissions: form.permissions,
        });
        if (!ok) {
          setErrorMsg(json.error || "Failed to create member.");
          setSaving(false);
          return;
        }
        setShowModal(false);
        fetchMembers();
      }
    } catch (e: any) {
      setErrorMsg(e.message || "Something went wrong.");
    }
    setSaving(false);
  };

  const markAsLeft = async (id: string) => {
    await supabase.from("profiles").update({ status: "left" }).eq("id", id);
    fetchMembers();
  };

  const reactivate = async (id: string) => {
    // Re-activating counts against the plan's team limit (enforced by the database).
    const { error } = await supabase.from("profiles").update({ status: "active" }).eq("id", id);
    if (error) alert(error.message);
    fetchMembers();
  };

  const deleteMember = async (id: string) => {
    const { ok, json } = await authedFetch("/api/team/delete", { userId: id });
    setDeleteConfirm(null);
    if (!ok) { alert(json.error || "Failed to remove member."); return; }
    fetchMembers();
  };

  const togglePermission = (key: string) => {
    setForm((f: any) => ({
      ...f,
      permissions: { ...f.permissions, [key]: !f.permissions[key] }
    }));
  };

  const IS = { width: "100%", background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "#ffffff", fontFamily: "inherit", fontSize: 14, outline: "none" };
  const LS = { fontSize: 11, fontWeight: 600 as const, color: "var(--text3)", display: "block" as const, marginBottom: 7, textTransform: "uppercase" as const, letterSpacing: ".6px" };

  return (
    <div className="page-wrap">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Team</div>
          <div style={{ fontSize: 15, color: "var(--text2)", marginTop: 6 }}>
            {members.filter(m => m.status !== "left").length} active · {members.filter(m => m.status === "left").length > 0 ? `${members.filter(m => m.status === "left").length} left · ` : ""}Manage access and permissions
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary" style={{ padding: "10px 20px", fontSize: 14 }}>
          <i className="ti ti-plus" /> Add Member
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} />
          <div style={{ marginTop: 12, fontSize: 15 }}>Loading team...</div>
        </div>
      ) : members.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-users" style={{ fontSize: 40, opacity: .2 }} />
          <div style={{ marginTop: 12, fontSize: 15 }}>No team members yet</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
          {members.map(m => {
            const isLeft = m.status === "left";
            return (
            <div key={m.id} className="crm-card" style={{ padding: 24, opacity: isLeft ? 0.6 : 1, border: isLeft ? "1px solid rgba(255,255,255,0.06)" : undefined }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: isLeft ? "rgba(255,255,255,0.04)" : `${m.color}22`, border: `1px solid ${isLeft ? "rgba(255,255,255,0.1)" : m.color + "40"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, color: isLeft ? "var(--text3)" : m.color, flexShrink: 0 }}>
                  {m.name?.[0] || "?"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isLeft ? "var(--text3)" : "var(--text)", letterSpacing: "-0.3px", textDecoration: isLeft ? "line-through" : "none" }}>{m.name}</div>
                  {m.position && <div style={{ fontSize: 12, fontWeight: 600, color: isLeft ? "var(--text3)" : "var(--accent2)", marginTop: 2 }}>{m.position}</div>}
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{m.email || "No email set"}</div>
                  {m.phone && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>{m.phone}</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  {isLeft ? (
                    <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 600, background: "rgba(255,255,255,0.05)", color: "var(--text3)", border: "1px solid var(--border2)" }}>Left</span>
                  ) : (
                    <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, fontWeight: 600, background: m.role === "admin" ? "rgba(109,93,252,0.15)" : "rgba(255,255,255,0.05)", color: m.role === "admin" ? "var(--accent2)" : "var(--text3)", border: `1px solid ${m.role === "admin" ? "rgba(109,93,252,0.3)" : "var(--border2)"}` }}>
                      {m.role}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 10 }}>Page Access</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {m.role === "admin" ? (
                    <span style={{ fontSize: 12, color: "var(--green)", background: "var(--green-bg)", padding: "3px 10px", borderRadius: 20, border: "1px solid var(--green-border)", fontWeight: 600 }}>
                      ✓ Full Access
                    </span>
                  ) : (
                    ALL_PAGES.map(p => {
                      const hasAccess = m.permissions?.[p.key];
                      return (
                        <span key={p.key} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, fontWeight: 600, background: hasAccess ? "var(--accent-bg)" : "rgba(255,255,255,0.03)", color: hasAccess ? "var(--accent2)" : "var(--text3)", border: `1px solid ${hasAccess ? "var(--accent-border)" : "var(--border)"}` }}>
                          {hasAccess ? "✓" : "✗"} {p.label}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                {isLeft ? (
                  <>
                    <button onClick={() => reactivate(m.id)} style={{ flex: 1, padding: "9px", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 10, color: "#4ade80", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                      <i className="ti ti-refresh" /> Reactivate
                    </button>
                    <button onClick={() => setDeleteConfirm(m.id)} style={{ padding: "9px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, color: "var(--red)", cursor: "pointer", fontSize: 14 }}>
                      <i className="ti ti-trash" />
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => openEdit(m)} className="btn-primary" style={{ flex: 1, justifyContent: "center", padding: "9px", fontSize: 13 }}>
                      <i className="ti ti-pencil" /> Edit
                    </button>
                    <button onClick={() => markAsLeft(m.id)} title="Mark as Left" style={{ padding: "9px 12px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 10, color: "#fbbf24", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit" }}>
                      <i className="ti ti-door-exit" /> Left
                    </button>
                    <button onClick={() => setDeleteConfirm(m.id)} style={{ padding: "9px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, color: "var(--red)", cursor: "pointer", fontSize: 14 }}>
                      <i className="ti ti-trash" />
                    </button>
                  </>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 560, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>
                {editingId ? "Edit Member" : "Add Team Member"}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={LS}>Full Name *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Arjun Sharma" style={IS} />
              </div>
              <div>
                <label style={LS}>Phone</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+91 XXXXX XXXXX" style={IS} />
              </div>
              <div>
                <label style={LS}>Email *</label>
                <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@youragency.com" type="email" style={IS} disabled={!!editingId} />
              </div>
              <div>
                <label style={LS}>{editingId ? "New Password (leave blank to keep)" : "Password *"}</label>
                <input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" type="password" style={IS} />
              </div>
              <div>
                <label style={LS}>Role</label>
                <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} style={IS}>
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Position / Designation</label>
                <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} style={IS}>
                  <option value="">— Select position —</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Avatar Color</label>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", paddingTop: 4 }}>
                  {COLORS.map(col => (
                    <div key={col} onClick={() => setForm({ ...form, color: col })}
                      style={{ width: 26, height: 26, borderRadius: 7, background: col, cursor: "pointer", border: form.color === col ? "2px solid white" : "2px solid transparent", transition: "border .15s" }} />
                  ))}
                </div>
              </div>
            </div>

            {form.role !== "admin" && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>
                    Page Access Permissions
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => setForm((f: any) => ({ ...f, permissions: ALL_PAGES.reduce((a: any, p) => ({ ...a, [p.key]: true }), {}) }))}
                      style={{ fontSize: 11, padding: "4px 10px", background: "rgba(74,222,128,0.1)", color: "var(--green)", border: "1px solid var(--green)", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                      Grant All
                    </button>
                    <button type="button" onClick={() => setForm((f: any) => ({ ...f, permissions: ALL_PAGES.reduce((a: any, p) => ({ ...a, [p.key]: false }), {}) }))}
                      style={{ fontSize: 11, padding: "4px 10px", background: "rgba(248,113,113,0.1)", color: "var(--red)", border: "1px solid var(--red)", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                      Revoke All
                    </button>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {ALL_PAGES.map(p => {
                    const hasAccess = form.permissions?.[p.key];
                    return (
                      <div key={p.key} onClick={() => togglePermission(p.key)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: "pointer", border: `1px solid ${hasAccess ? "var(--accent-border)" : "var(--border)"}`, background: hasAccess ? "var(--accent-bg)" : "rgba(255,255,255,0.02)", transition: "all .15s" }}>
                        <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${hasAccess ? "var(--accent)" : "var(--border2)"}`, background: hasAccess ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {hasAccess && <i className="ti ti-check" style={{ fontSize: 11, color: "#fff" }} />}
                        </div>
                        <i className={`ti ${p.icon}`} style={{ color: hasAccess ? "var(--accent2)" : "var(--text3)", fontSize: 15 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: hasAccess ? "var(--text)" : "var(--text3)" }}>{p.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {form.role === "admin" && (
              <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(109,93,252,0.08)", border: "1px solid rgba(109,93,252,0.2)", borderRadius: 10, fontSize: 13, color: "var(--accent2)" }}>
                <i className="ti ti-shield-check" /> Admins have full access to all pages automatically.
              </div>
            )}

            {errorMsg && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, fontSize: 13, color: "var(--red)" }}>
                {errorMsg}
              </div>
            )}

            <button onClick={saveMember} disabled={saving} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15, marginTop: 20, opacity: saving ? .7 : 1 }}>
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Member"}
            </button>
            {!editingId && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text3)", textAlign: "center" }}>
                Member will be created with login access using the email and password above.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm !== null && (
        <div onClick={() => setDeleteConfirm(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 380, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🗑️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Remove Member?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24 }}>
              This removes their profile. Their login account will remain in Supabase Auth — delete it there if needed.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={() => deleteMember(deleteConfirm)} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}