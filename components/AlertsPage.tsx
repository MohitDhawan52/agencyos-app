"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const QUICK_INTERVALS = [10, 15, 20, 30, 45, 60, 90, 120];

const formatInterval = (mins: number) => {
  if (!mins || mins < 1) return "–";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m === 0 ? `${h} hr` : `${h}h ${m}m`;
};

const emptyForm = { title: "", message: "", assignees: [] as string[], interval_mins: 60, active: true };

export default function AlertsPage() {
  const [alerts,      setAlerts]      = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [showModal,   setShowModal]   = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [form,        setForm]        = useState<any>(emptyForm);
  const [loading,     setLoading]     = useState(true);
  const [deleteId,    setDeleteId]    = useState<string | null>(null);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);
  const [fetchError,  setFetchError]  = useState<string | null>(null);

  useEffect(() => { fetchAlerts(); fetchTeam(); }, []);

  const fetchAlerts = async () => {
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase.from("alerts").select("*").order("created_at", { ascending: false });
    if (error) {
      setFetchError(error.message);
    } else {
      setAlerts(data || []);
    }
    setLoading(false);
  };

  const fetchTeam = async () => {
    const { data } = await supabase.from("profiles").select("id, name, color").neq("status", "left").order("name");
    if (data) setTeamMembers(data);
  };

  const toggleMember = (name: string) =>
    setForm((p: any) => {
      const cur: string[] = p.assignees || [];
      return { ...p, assignees: cur.includes(name) ? cur.filter((n: string) => n !== name) : [...cur, name] };
    });

  const openAdd = () => { setEditingId(null); setForm({ ...emptyForm, assignees: [] }); setSaveError(null); setShowModal(true); };
  const openEdit = (a: any) => {
    setEditingId(a.id);
    setForm({ ...a, assignees: a.assignees?.split(", ").filter(Boolean) || [] });
    setSaveError(null);
    setShowModal(true);
  };

  const saveAlert = async () => {
    if (!form.title.trim() || !form.message.trim()) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      title:         form.title.trim(),
      message:       form.message.trim(),
      assignees:     (form.assignees || []).join(", "),
      interval_mins: Number(form.interval_mins) || 60,
      active:        form.active !== false,
    };
    const { error } = editingId
      ? await supabase.from("alerts").update(payload).eq("id", editingId)
      : await supabase.from("alerts").insert([payload]);
    setSaving(false);
    if (error) { setSaveError(error.message); return; }
    setShowModal(false);
    fetchAlerts();
  };

  const toggleActive = async (id: string, cur: boolean) => {
    await supabase.from("alerts").update({ active: !cur }).eq("id", id);
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, active: !cur } : a));
  };

  const deleteAlert = async (id: string) => {
    await supabase.from("alerts").delete().eq("id", id);
    setDeleteId(null);
    fetchAlerts();
  };

  const IS: React.CSSProperties = {
    width: "100%", background: "#1a1a27", border: "1px solid var(--border2)",
    borderRadius: 10, padding: "10px 14px", color: "#ffffff",
    fontFamily: "inherit", fontSize: 14, outline: "none",
  };
  const LS: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block",
    marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px",
  };

  return (
    <div className="page-wrap">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px" }}>Team Alerts</div>
          <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 6 }}>
            Recurring pop-up reminders that fire on a schedule for selected team members
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary" style={{ padding: "10px 20px", fontSize: 14, flexShrink: 0 }}>
          <i className="ti ti-plus" /> New Alert
        </button>
      </div>

      {/* ── Fetch error banner ───────────────────────────────────────────── */}
      {fetchError && (
        <div style={{ marginBottom: 20, padding: "14px 18px", borderRadius: 12, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <i className="ti ti-alert-triangle" style={{ color: "#f87171", fontSize: 18, flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f87171", marginBottom: 4 }}>Could not load alerts</div>
            <div style={{ fontSize: 12, color: "var(--text3)", fontFamily: "monospace", wordBreak: "break-all" }}>{fetchError}</div>
            {fetchError.includes("does not exist") && (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text2)", lineHeight: 1.6 }}>
                The <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 6px", borderRadius: 4 }}>alerts</code> table is missing. Run this SQL in your Supabase dashboard → SQL Editor:
                <pre style={{ marginTop: 8, padding: "10px 12px", background: "rgba(0,0,0,0.3)", borderRadius: 8, fontSize: 11, overflowX: "auto", color: "#c0c0d0" }}>{`CREATE TABLE alerts (\n  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n  title         TEXT NOT NULL,\n  message       TEXT NOT NULL,\n  assignees     TEXT NOT NULL DEFAULT '',\n  interval_mins INTEGER NOT NULL DEFAULT 60,\n  active        BOOLEAN DEFAULT true,\n  created_by    TEXT,\n  created_at    TIMESTAMPTZ DEFAULT now()\n);`}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total",  val: alerts.length,                       color: "var(--text)",  icon: "ti-bell" },
          { label: "Active", val: alerts.filter(a => a.active).length,  color: "#4ade80",      icon: "ti-bell-ringing" },
          { label: "Paused", val: alerts.filter(a => !a.active).length, color: "var(--text3)", icon: "ti-bell-off" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "18px 20px", borderRadius: 14, background: "var(--modal-bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: `${s.color}18`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Alert list ───────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} />
          <div style={{ marginTop: 12, fontSize: 14 }}>Loading alerts…</div>
        </div>
      ) : alerts.length === 0 ? (
        <div style={{ textAlign: "center", padding: 80, color: "var(--text3)" }}>
          <i className="ti ti-bell-off" style={{ fontSize: 48, opacity: .2 }} />
          <div style={{ marginTop: 16, fontSize: 18, fontWeight: 600, color: "var(--text2)" }}>No alerts yet</div>
          <div style={{ marginTop: 8, fontSize: 14 }}>Create your first recurring team alert</div>
          <button onClick={openAdd} className="btn-primary" style={{ marginTop: 20, padding: "10px 24px", fontSize: 14 }}>
            <i className="ti ti-plus" /> Create Alert
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {alerts.map(a => {
            const assigneeList: string[] = a.assignees?.split(", ").filter(Boolean) || [];
            return (
              <div key={a.id} style={{
                padding: "20px 24px", borderRadius: 16,
                border: `1px solid ${a.active ? "rgba(251,191,36,0.22)" : "var(--border)"}`,
                background: a.active ? "rgba(251,191,36,0.03)" : "rgba(255,255,255,0.01)",
                display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 18, alignItems: "center",
              }}>

                {/* Bell icon */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: a.active ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${a.active ? "rgba(251,191,36,0.3)" : "var(--border2)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <i className={`ti ${a.active ? "ti-bell-ringing" : "ti-bell-off"}`} style={{ fontSize: 20, color: a.active ? "#fbbf24" : "var(--text3)" }} />
                </div>

                {/* Content */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{a.title}</span>
                    <span style={{
                      fontSize: 11, padding: "2px 9px", borderRadius: 20, fontWeight: 700,
                      background: a.active ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.05)",
                      color: a.active ? "#4ade80" : "var(--text3)",
                      border: `1px solid ${a.active ? "rgba(74,222,128,0.25)" : "var(--border2)"}`,
                    }}>{a.active ? "Active" : "Paused"}</span>
                    <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 20, fontWeight: 600, background: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>
                      <i className="ti ti-clock" style={{ marginRight: 4, fontSize: 10 }} />
                      Every {formatInterval(a.interval_mins)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 10, lineHeight: 1.55 }}>{a.message}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>To:</span>
                    {assigneeList.length === 0 ? (
                      <span style={{ fontSize: 12, color: "var(--text3)", fontStyle: "italic" }}>Everyone</span>
                    ) : assigneeList.map((name: string) => {
                      const m = teamMembers.find(tm => tm.name === name);
                      const col = m?.color || "#5646e0";
                      return (
                        <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, padding: "3px 8px", borderRadius: 20, background: `${col}18`, color: col, border: `1px solid ${col}30`, fontWeight: 600 }}>
                          <span style={{ width: 16, height: 16, borderRadius: 5, background: col, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{name[0]}</span>
                          {name}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                  <button onClick={() => toggleActive(a.id, a.active)} style={{
                    padding: "7px 14px", borderRadius: 9, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    background: a.active ? "rgba(248,113,113,0.1)" : "rgba(74,222,128,0.1)",
                    border: `1px solid ${a.active ? "rgba(248,113,113,0.3)" : "rgba(74,222,128,0.3)"}`,
                    color: a.active ? "#f87171" : "#4ade80",
                  }}>
                    <i className={`ti ${a.active ? "ti-pause" : "ti-play"}`} style={{ marginRight: 4 }} />
                    {a.active ? "Pause" : "Resume"}
                  </button>
                  <button onClick={() => openEdit(a)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 9, padding: "7px 10px", color: "var(--blue)", cursor: "pointer", fontSize: 14 }}>
                    <i className="ti ti-pencil" />
                  </button>
                  <button onClick={() => setDeleteId(a.id)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 9, padding: "7px 10px", color: "var(--red)", cursor: "pointer", fontSize: 14 }}>
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add / Edit modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div onClick={() => setShowModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 520, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{editingId ? "Edit Alert" : "New Alert"}</div>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Alert Title *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Daily Stand-up Reminder" style={IS} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Alert Message *</label>
              <textarea
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                placeholder="What should team members do or know?"
                rows={3}
                style={{ ...IS, resize: "vertical" as const, lineHeight: 1.55 }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={LS}>Repeat Every (minutes)</label>
                <input
                  type="number" min={1} max={1440}
                  value={form.interval_mins}
                  onChange={e => setForm({ ...form, interval_mins: Math.max(1, Number(e.target.value) || 1) })}
                  style={IS}
                  placeholder="e.g. 25"
                />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                  {QUICK_INTERVALS.map(v => (
                    <button key={v} type="button" onClick={() => setForm({ ...form, interval_mins: v })}
                      style={{
                        padding: "4px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        background: form.interval_mins === v ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${form.interval_mins === v ? "rgba(251,191,36,0.5)" : "var(--border2)"}`,
                        color: form.interval_mins === v ? "#fbbf24" : "var(--text3)",
                        transition: "all .12s",
                      }}>
                      {formatInterval(v)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={LS}>Status</label>
                <select value={form.active ? "active" : "paused"} onChange={e => setForm({ ...form, active: e.target.value === "active" })} style={IS}>
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <label style={LS}>
                Show To
                <span style={{ color: "var(--text3)", fontWeight: 400, textTransform: "none", fontSize: 11, letterSpacing: 0, marginLeft: 6 }}>
                  — click to select (leave blank = everyone)
                </span>
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {teamMembers.map(m => {
                  const selected = (form.assignees || []).includes(m.name);
                  return (
                    <div key={m.id} onClick={() => toggleMember(m.name)} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 10, cursor: "pointer",
                      border: `1.5px solid ${selected ? m.color : "var(--border2)"}`,
                      background: selected ? `${m.color}18` : "rgba(255,255,255,0.03)",
                      transition: "all .15s", userSelect: "none",
                    }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>
                        {m.name[0]}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: selected ? 600 : 400, color: selected ? "var(--text)" : "var(--text2)" }}>{m.name}</span>
                      {selected && <i className="ti ti-check" style={{ fontSize: 12, color: m.color }} />}
                    </div>
                  );
                })}
              </div>
            </div>

            {saveError && (
              <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", fontSize: 12, color: "#f87171", display: "flex", gap: 8, alignItems: "flex-start" }}>
                <i className="ti ti-alert-triangle" style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{saveError}</span>
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowModal(false)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 12, fontSize: 14 }} disabled={saving}>Cancel</button>
              <button onClick={saveAlert} className="btn-primary" style={{ flex: 2, padding: 12, fontSize: 14, opacity: saving ? 0.7 : 1 }} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save Changes" : "Create Alert"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ───────────────────────────────────────────────── */}
      {deleteId && (
        <div onClick={() => setDeleteId(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 360, textAlign: "center" }}>
            <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 16 }}>🔔</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete Alert?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24, lineHeight: 1.6 }}>
              This will permanently delete the alert and stop all recurring notifications for assignees.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteId(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={() => deleteAlert(deleteId)} style={{ flex: 1, padding: 11, background: "var(--red, #6d5dfc)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
