"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const ALL_PERMISSIONS = [
  { key: "clients",        label: "Clients",           icon: "ti-building-store", desc: "View & manage clients" },
  { key: "videos",         label: "Video Tracker",     icon: "ti-video",          desc: "Access video status tracker" },
  { key: "tasks",          label: "Tasks",             icon: "ti-checkbox",       desc: "View & manage tasks" },
  { key: "board",          label: "Board",             icon: "ti-layout-kanban",  desc: "Access kanban board" },
  { key: "contentidea",    label: "Content Ideas",     icon: "ti-bulb",           desc: "View content idea board" },
  { key: "calendar",       label: "Content Calendar",  icon: "ti-calendar",       desc: "Manage content calendar" },
  { key: "postingtracker", label: "Posting Tracker",   icon: "ti-chart-line",     desc: "View posting tracker analytics" },
  { key: "leads",          label: "Leads",             icon: "ti-user-plus",      desc: "View & manage leads" },
  { key: "meetings",       label: "Meetings",          icon: "ti-calendar-event", desc: "View & manage meetings" },
  { key: "shootplanner",   label: "Shoot Planner",     icon: "ti-camera",         desc: "Access shoot planner" },
  { key: "timesheet",      label: "Timesheet",         icon: "ti-clock-record",   desc: "View own timesheet entries" },
];

// Normalize a permissions object: removes underscores + spaces, lowercases all keys
// e.g. { "shoot_planner": true, "Video Tracker": true } → { "shootplanner": true, "videotracker": true }
const normalizePerms = (perms: Record<string, any>): Record<string, boolean> =>
  Object.entries(perms).reduce((acc, [key, val]) => {
    const cleanKey = key.replace(/[_\s]/g, "").toLowerCase().trim();
    return { ...acc, [cleanKey]: val };
  }, {} as Record<string, boolean>);

// Normalize permissions on every member object coming from Supabase
const normalizeMember = (m: any) => ({
  ...m,
  permissions: m.permissions ? normalizePerms(m.permissions) : {},
});

export default function Permissions() {
  const [members, setMembers]               = useState<any[]>([]);
  const [clients, setClients]               = useState<string[]>([]);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [saving, setSaving]                 = useState(false);
  const [saved, setSaved]                   = useState(false);
  const [loading, setLoading]               = useState(true);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: clientsData }] = await Promise.all([
      supabase.from("profiles").select("*").neq("role", "admin").order("created_at"),
      supabase.from("clients").select("name").eq("status", "Active").order("name"),
    ]);

    // Normalize all member permissions on load so UI always uses clean keys
    const memberList = (profiles || []).map(normalizeMember);
    setMembers(memberList);
    if (memberList.length > 0 && !selectedMember) setSelectedMember(memberList[0]);

    if (clientsData) setClients(clientsData.map((c: any) => c.name));
    setLoading(false);
  };

  const currentPerms   = selectedMember?.permissions  || {};
  const currentClients = selectedMember?.client_access || {};

  const togglePerm = (key: string) => {
    setSelectedMember((prev: any) => ({
      ...prev,
      permissions: { ...prev.permissions, [key]: !prev.permissions?.[key] },
    }));
    setMembers(prev => prev.map(m =>
      m.id === selectedMember.id
        ? { ...m, permissions: { ...m.permissions, [key]: !m.permissions?.[key] } }
        : m
    ));
  };

  const toggleClient = (client: string) => {
    setSelectedMember((prev: any) => ({
      ...prev,
      client_access: { ...prev.client_access, [client]: !prev.client_access?.[client] },
    }));
    setMembers(prev => prev.map(m =>
      m.id === selectedMember.id
        ? { ...m, client_access: { ...m.client_access, [client]: !m.client_access?.[client] } }
        : m
    ));
  };

  const grantAll = () => {
    const all = ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: true }), {});
    setSelectedMember((prev: any) => ({ ...prev, permissions: all }));
    setMembers(prev => prev.map(m => m.id === selectedMember.id ? { ...m, permissions: all } : m));
  };

  const revokeAll = () => {
    const none = ALL_PERMISSIONS.reduce((acc, p) => ({ ...acc, [p.key]: false }), {});
    setSelectedMember((prev: any) => ({ ...prev, permissions: none }));
    setMembers(prev => prev.map(m => m.id === selectedMember.id ? { ...m, permissions: none } : m));
  };

  const grantAllClients = () => {
    const all = clients.reduce((acc, c) => ({ ...acc, [c]: true }), {});
    setSelectedMember((prev: any) => ({ ...prev, client_access: all }));
    setMembers(prev => prev.map(m => m.id === selectedMember.id ? { ...m, client_access: all } : m));
  };

  const revokeAllClients = () => {
    const none = clients.reduce((acc, c) => ({ ...acc, [c]: false }), {});
    setSelectedMember((prev: any) => ({ ...prev, client_access: none }));
    setMembers(prev => prev.map(m => m.id === selectedMember.id ? { ...m, client_access: none } : m));
  };

  const handleSave = async () => {
    if (!selectedMember) return;
    setSaving(true);

    // Always normalize keys before writing to DB
    // This permanently fixes any old bad keys (shoot_planner → shootplanner)
    const cleanPerms = normalizePerms(selectedMember.permissions || {});

    const { error } = await supabase.from("profiles").update({
      permissions:   cleanPerms,
      client_access: selectedMember.client_access || {},
    }).eq("id", selectedMember.id);

    if (!error) {
      // Update local state with clean perms too
      setSelectedMember((prev: any) => ({ ...prev, permissions: cleanPerms }));
      setMembers(prev => prev.map(m =>
        m.id === selectedMember.id ? { ...m, permissions: cleanPerms } : m
      ));
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const enabledCount = ALL_PERMISSIONS.filter(p => currentPerms[p.key]).length;
  const clientCount  = clients.filter(c => currentClients[c]).length;

  const avatarColor = (m: any) => m.color || "var(--accent)";

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "var(--text3)" }}>
        <i className="ti ti-loader" style={{ fontSize: 32, opacity: .3 }} />
        <div style={{ marginTop: 12 }}>Loading...</div>
      </div>
    </div>
  );

  if (members.length === 0) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "var(--text3)" }}>
        <i className="ti ti-users" style={{ fontSize: 40, opacity: .2 }} />
        <div style={{ marginTop: 12, fontSize: 15 }}>No team members found</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Add members in the Team section first</div>
      </div>
    </div>
  );

  return (
    <div className="page-wrap">

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Permissions</div>
        <div style={{ fontSize: 14, color: "var(--text3)", marginTop: 6 }}>Control what each team member can access</div>
      </div>

      {/* Member selector */}
      <div style={{ display: "flex", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        {members.map(m => {
          const isSelected = selectedMember?.id === m.id;
          const col = avatarColor(m);
          return (
            <button key={m.id} onClick={() => setSelectedMember(m)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
              borderRadius: 10, border: "1px solid", cursor: "pointer",
              borderColor: isSelected ? col : "var(--border2)",
              background:  isSelected ? `${col}18` : "var(--bg2)",
              color:       isSelected ? col : "var(--text2)",
              fontWeight: 600, fontSize: 13, fontFamily: "inherit", transition: "all .15s",
            }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>
                {m.name?.[0] || "?"}
              </div>
              {m.name}
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* ── Page Permissions ── */}
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Page Access</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                {enabledCount} of {ALL_PERMISSIONS.length} pages enabled for {selectedMember?.name}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={grantAll}  style={{ fontSize: 11, padding: "5px 10px", background: "rgba(74,222,128,0.1)",  color: "var(--green)", border: "1px solid var(--green)", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>All</button>
              <button onClick={revokeAll} style={{ fontSize: 11, padding: "5px 10px", background: "rgba(248,113,113,0.1)", color: "var(--red)",   border: "1px solid var(--red)",   borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>None</button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {ALL_PERMISSIONS.map((p, i) => {
              const enabled = !!currentPerms[p.key];
              return (
                <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < ALL_PERMISSIONS.length - 1 ? "1px solid var(--border)" : "none" }}>
                  {/* Toggle */}
                  <div onClick={() => togglePerm(p.key)} style={{ width: 38, height: 21, borderRadius: 11, cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0, background: enabled ? "var(--accent)" : "var(--bg4)" }}>
                    <div style={{ position: "absolute", width: 15, height: 15, background: "#fff", borderRadius: "50%", top: 3, left: enabled ? 20 : 3, transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
                  </div>
                  {/* Icon */}
                  <div style={{ width: 32, height: 32, borderRadius: 9, background: enabled ? "var(--accent-bg)" : "rgba(255,255,255,0.04)", border: `1px solid ${enabled ? "var(--accent-border)" : "var(--border)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
                    <i className={`ti ${p.icon}`} style={{ fontSize: 15, color: enabled ? "var(--accent2)" : "var(--text3)" }} />
                  </div>
                  {/* Label */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: enabled ? "var(--text)" : "var(--text2)" }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)" }}>{p.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: 11, background: saved ? "var(--green)" : "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 16, transition: "background .3s", opacity: saving ? 0.7 : 1 }}>
            {saved ? "✓ Saved!" : saving ? "Saving..." : "Save Permissions"}
          </button>
        </div>

        {/* ── Client Visibility ── */}
        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Client Visibility</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                {clientCount} of {clients.length} clients visible to {selectedMember?.name}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={grantAllClients}  style={{ fontSize: 11, padding: "5px 10px", background: "rgba(74,222,128,0.1)",  color: "var(--green)", border: "1px solid var(--green)", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>All</button>
              <button onClick={revokeAllClients} style={{ fontSize: 11, padding: "5px 10px", background: "rgba(248,113,113,0.1)", color: "var(--red)",   border: "1px solid var(--red)",   borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>None</button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", maxHeight: 420, overflowY: "auto" }}>
            {clients.length === 0 && (
              <div style={{ textAlign: "center", padding: 32, color: "var(--text3)", fontSize: 13 }}>No clients found</div>
            )}
            {clients.map((client, i) => {
              const visible = !!currentClients[client];
              return (
                <div key={client} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < clients.length - 1 ? "1px solid var(--border)" : "none" }}>
                  <div onClick={() => toggleClient(client)} style={{ width: 38, height: 21, borderRadius: 11, cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0, background: visible ? "var(--accent)" : "var(--bg4)" }}>
                    <div style={{ position: "absolute", width: 15, height: 15, background: "#fff", borderRadius: "50%", top: 3, left: visible ? 20 : 3, transition: "left .2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
                  </div>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: visible ? "var(--accent)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0, transition: "background .2s" }}>
                    {client[0]}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: visible ? "var(--text)" : "var(--text3)", transition: "color .2s" }}>{client}</span>
                </div>
              );
            })}
          </div>

          <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: 11, background: saved ? "var(--green)" : "var(--accent)", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 16, transition: "background .3s", opacity: saving ? 0.7 : 1 }}>
            {saved ? "✓ Saved!" : saving ? "Saving..." : "Save Client Access"}
          </button>
        </div>
      </div>

      {/* ── Team Overview ── */}
      <div style={{ marginTop: 20, background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 14, padding: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 16 }}>Team Permission Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
          {members.map(m => {
            const mPerms   = m.permissions   || {};
            const mClients = m.client_access || {};
            const count  = ALL_PERMISSIONS.filter(p => mPerms[p.key]).length;
            const ccount = clients.filter(c => mClients[c]).length;
            const col    = avatarColor(m);
            const isSelected = selectedMember?.id === m.id;
            return (
              <div key={m.id} onClick={() => setSelectedMember(m)} style={{ background: "var(--bg3)", border: `1px solid ${isSelected ? col : "var(--border)"}`, borderRadius: 12, padding: 14, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: col, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff" }}>{m.name?.[0]}</div>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{m.name}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 4 }}>{count}/{ALL_PERMISSIONS.length} pages</div>
                <div style={{ height: 4, background: "var(--bg4)", borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{ width: `${(count / ALL_PERMISSIONS.length) * 100}%`, height: "100%", background: col, borderRadius: 3, transition: "width .3s" }} />
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)" }}>{ccount} clients visible</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}