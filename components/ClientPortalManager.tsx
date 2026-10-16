"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/components/supabase";
import { authedFetch } from "@/lib/org";

const portalUrl = () => (typeof window !== "undefined" ? window.location.origin : "") + "/client";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClientAccount {
  id: string;
  client_name: string;
  contact_name: string;
  email: string;
  created_at: string;
  disabled?: boolean;
}

interface ContentEntry {
  id: string;
  title: string;
  platform: string;
  content_type: string;
  status: string;
  scheduled_date: string;
  client_approval: string;
  client_comment: string;
  client: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const SS: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--border2)",
  borderRadius: 10,
  padding: "10px 14px",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 14,
  outline: "none",
  width: "100%",
  WebkitAppearance: "none" as any,
  appearance: "none" as any,
};

function genPassword(len = 12) {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClientPortalManager() {
  const [clients, setClients] = useState<ClientAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [viewClient, setViewClient] = useState<ClientAccount | null>(null);
  const [clientContent, setClientContent] = useState<ContentEntry[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [toast, setToast] = useState("");

  // Create form state
  const [form, setForm] = useState({ client_name: "", contact_name: "", email: "", password: "" });
  const [allClients, setAllClients] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null);

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<ClientAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchClients(); fetchAllClientNames(); }, []);

  const fetchClients = async () => {
    setLoading(true);
    const { data } = await supabase.from("client_profiles").select("*").order("created_at", { ascending: false });
    setClients(data || []);
    setLoading(false);
  };

  const fetchAllClientNames = async () => {
    const { data } = await supabase.from("clients").select("name").eq("status", "Active").order("name");
    if (data) setAllClients(data.map((c: any) => c.name));
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  // ── Create client account ──────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.client_name || !form.email || !form.password) {
      setCreateError("Client, email and password are required.");
      return;
    }
    setCreating(true);
    setCreateError("");

    const { ok, json } = await authedFetch("/api/client-portal/create", {
      email: form.email,
      password: form.password,
      client_name: form.client_name,
      contact_name: form.contact_name,
    });
    if (!ok) {
      setCreateError(json.error || "Could not create client login.");
      setCreating(false);
      return;
    }

    setCreatedCreds({ email: form.email, password: form.password });
    setForm({ client_name: "", contact_name: "", email: "", password: "" });
    fetchClients();
    setCreating(false);
  };

  // ── View client content ────────────────────────────────────────────────────
  const handleViewClient = async (client: ClientAccount) => {
    setViewClient(client);
    setContentLoading(true);
    const { data } = await supabase
      .from("content_calendar")
      .select("id,title,platform,content_type,status,scheduled_date,client_approval,client_comment,client")
      .eq("client", client.client_name)
      .order("scheduled_date", { ascending: false });
    setClientContent(data || []);
    setContentLoading(false);
  };

  // ── Delete client access ───────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await authedFetch("/api/client-portal/delete", { id: deleteTarget.id });
    setDeleteTarget(null);
    setDeleting(false);
    showToast("Client access removed.");
    fetchClients();
    if (viewClient?.id === deleteTarget.id) setViewClient(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="page-wrap">
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 999, background: "var(--green-bg)", border: "1px solid var(--green-border)", borderRadius: 12, padding: "12px 20px", fontSize: 14, color: "var(--green)", fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          ✓ {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px", margin: 0 }}>
            <i className="ti ti-portal" style={{ marginRight: 10, color: "var(--accent2)" }} />
            Client Portal Manager
          </h1>
          <p style={{ fontSize: 14, color: "var(--text3)", marginTop: 6, margin: 0 }}>
            Create and manage client logins for the content calendar portal
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreatedCreds(null); setCreateError(""); }}
          className="btn-primary"
        >
          <i className="ti ti-plus" /> Add Client Access
        </button>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Total Client Logins", val: clients.length, icon: "ti-users", color: "var(--accent2)" },
          { label: "Active Portals", val: clients.filter(c => !c.disabled).length, icon: "ti-circle-check", color: "var(--green)" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px" }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${s.color}18`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 17 }} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: "-0.5px", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Client list */}
      <div className="crm-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>Client Accounts</div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>{clients.length} accounts</div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>Loading...</div>
        ) : clients.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--text3)" }}>
            <i className="ti ti-portal" style={{ fontSize: 40, opacity: .2 }} />
            <div style={{ marginTop: 12, fontSize: 15 }}>No client accounts yet</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Click "Add Client Access" to create the first one</div>
          </div>
        ) : (
          <div>
            {clients.map((client, i) => (
              <div key={client.id} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
                borderBottom: i < clients.length - 1 ? "1px solid var(--border)" : "none",
                flexWrap: "wrap",
              }}>
                {/* Avatar */}
                <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--accent-bg)", border: "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 700, color: "var(--accent2)", flexShrink: 0 }}>
                  {client.client_name?.[0]?.toUpperCase() || "C"}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px" }}>{client.client_name}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                    {client.contact_name && <span>{client.contact_name} · </span>}
                    {client.email}
                  </div>
                </div>

                {/* Created */}
                <div style={{ fontSize: 12, color: "var(--text3)", flexShrink: 0 }}>
                  <i className="ti ti-calendar" style={{ marginRight: 4 }} />
                  {new Date(client.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </div>

                {/* Status badge */}
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "var(--green-bg)", color: "var(--green)", border: "1px solid var(--green-border)", flexShrink: 0 }}>
                  Active
                </span>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => handleViewClient(client)}
                    style={{ padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border2)", background: "rgba(255,255,255,0.04)", color: "var(--text2)", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <i className="ti ti-eye" /> View Activity
                  </button>
                  <button
                    onClick={() => setDeleteTarget(client)}
                    style={{ padding: "7px 12px", borderRadius: 8, fontSize: 13, cursor: "pointer", border: "1px solid var(--red-border)", background: "var(--red-bg)", color: "var(--red)", fontFamily: "inherit", display: "flex", alignItems: "center" }}
                  >
                    <i className="ti ti-trash" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Portal link info */}
      <div className="crm-card" style={{ marginTop: 16, padding: "14px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-link" style={{ color: "var(--accent2)", fontSize: 16 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Client Portal URL</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Share this link with your clients to access their content calendar</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <code style={{ fontSize: 13, color: "var(--accent2)", background: "var(--accent-bg)", padding: "6px 12px", borderRadius: 8, border: "1px solid var(--accent-border)" }}>
            {portalUrl().replace(/^https?:\/\//, "")}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(portalUrl()); showToast("Link copied!"); }}
            style={{ padding: "6px 10px", borderRadius: 8, fontSize: 13, cursor: "pointer", border: "1px solid var(--border2)", background: "rgba(255,255,255,0.04)", color: "var(--text2)", fontFamily: "inherit" }}
          >
            <i className="ti ti-copy" />
          </button>
        </div>
      </div>

      {/* ── CREATE MODAL ───────────────────────────────────────────────────── */}
      {showCreate && (
        <div onClick={() => !creating && setShowCreate(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ maxWidth: 500 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>
                <i className="ti ti-user-plus" style={{ marginRight: 8, color: "var(--accent2)" }} />
                Add Client Access
              </div>
              <button onClick={() => setShowCreate(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "5px 9px", color: "var(--text2)", cursor: "pointer" }}>
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Created successfully */}
            {createdCreds ? (
              <div>
                <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 14, padding: "20px 20px", marginBottom: 20, textAlign: "center" }}>
                  <i className="ti ti-circle-check" style={{ fontSize: 36, color: "#4ade80", display: "block", marginBottom: 10 }} />
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#4ade80" }}>Client account created!</div>
                  <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 4 }}>Share these credentials with your client</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 5 }}>Login URL</div>
                    <code style={{ fontSize: 13, color: "var(--accent2)" }}>{portalUrl()}</code>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 5 }}>Email</div>
                    <code style={{ fontSize: 13, color: "var(--text)" }}>{createdCreds.email}</code>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 5 }}>Password</div>
                    <code style={{ fontSize: 14, color: "var(--amber)", letterSpacing: 1 }}>{createdCreds.password}</code>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`Client Portal Login\nURL: ${portalUrl()}\nEmail: ${createdCreds.email}\nPassword: ${createdCreds.password}`);
                      showToast("Credentials copied!");
                    }}
                    className="btn-ghost" style={{ flex: 1 }}
                  >
                    <i className="ti ti-copy" /> Copy Credentials
                  </button>
                  <button
                    onClick={() => { setShowCreate(false); setCreatedCreds(null); }}
                    className="btn-primary" style={{ flex: 1 }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Client name dropdown */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" }}>Client Name *</label>
                  <div style={{ position: "relative" }}>
                    <select
                      value={form.client_name}
                      onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                      style={{ ...SS, paddingRight: 36 }}
                    >
                      <option value="">Select a client...</option>
                      {allClients.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <i className="ti ti-chevron-down" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text3)", pointerEvents: "none", fontSize: 14 }} />
                  </div>
                </div>

                {/* Contact name */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" }}>Contact Person Name</label>
                  <input
                    value={form.contact_name}
                    onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                    placeholder="e.g. Rahul Sharma"
                    style={SS}
                  />
                </div>

                {/* Email */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" }}>Login Email *</label>
                  <input
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="client@example.com"
                    type="email"
                    autoCapitalize="none"
                    style={SS}
                  />
                </div>

                {/* Password */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" }}>Password *</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      placeholder="Set a password"
                      style={{ ...SS, flex: 1 }}
                    />
                    <button
                      onClick={() => setForm(f => ({ ...f, password: genPassword() }))}
                      style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, cursor: "pointer", border: "1px solid var(--border2)", background: "rgba(255,255,255,0.04)", color: "var(--text2)", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                      <i className="ti ti-refresh" /> Generate
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 5 }}>You'll be shown the credentials to share with your client after creation.</div>
                </div>

                {createError && (
                  <div style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--red)", margin: "12px 0" }}>
                    {createError}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                  <button onClick={() => setShowCreate(false)} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
                  <button onClick={handleCreate} disabled={creating} className="btn-primary" style={{ flex: 2 }}>
                    {creating ? "Creating..." : <><i className="ti ti-user-plus" /> Create Account</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VIEW CLIENT ACTIVITY MODAL ────────────────────────────────────── */}
      {viewClient && (
        <div onClick={() => setViewClient(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ maxWidth: 640 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>{viewClient.client_name}</div>
                <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>{viewClient.contact_name} · {viewClient.email}</div>
              </div>
              <button onClick={() => setViewClient(null)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "5px 9px", color: "var(--text2)", cursor: "pointer" }}>
                <i className="ti ti-x" />
              </button>
            </div>

            {/* Summary counts */}
            {!contentLoading && (
              <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                {[
                  { label: "Total", val: clientContent.length, color: "var(--text2)" },
                  { label: "Approved", val: clientContent.filter(e => e.client_approval === "Approved").length, color: "#4ade80" },
                  { label: "Changes Needed", val: clientContent.filter(e => e.client_approval === "Changes Needed").length, color: "var(--red)" },
                  { label: "No Response", val: clientContent.filter(e => !e.client_approval).length, color: "var(--text3)" },
                ].map((s, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 16px", textAlign: "center", flex: 1, minWidth: 80 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {contentLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>Loading content...</div>
            ) : clientContent.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--text3)" }}>
                <i className="ti ti-calendar" style={{ fontSize: 32, opacity: .2 }} />
                <div style={{ marginTop: 10, fontSize: 14 }}>No content calendar entries for this client yet.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 420, overflowY: "auto", WebkitOverflowScrolling: "touch" as any }}>
                {clientContent.map(e => (
                  <div key={e.id} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{e.title}</div>
                        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>
                          {e.platform} · {e.content_type}
                          {e.scheduled_date && ` · ${new Date(e.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, flexShrink: 0,
                        background: e.client_approval === "Approved" ? "rgba(74,222,128,0.1)" : e.client_approval === "Changes Needed" ? "var(--red-bg)" : "rgba(255,255,255,0.05)",
                        color: e.client_approval === "Approved" ? "#4ade80" : e.client_approval === "Changes Needed" ? "var(--red)" : "var(--text3)",
                        border: `1px solid ${e.client_approval === "Approved" ? "rgba(74,222,128,0.2)" : e.client_approval === "Changes Needed" ? "var(--red-border)" : "var(--border)"}`,
                      }}>
                        {e.client_approval || "No Response"}
                      </span>
                    </div>
                    {e.client_comment && (
                      <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(109,93,252,0.06)", borderRadius: 8, borderLeft: "2px solid var(--accent)", fontSize: 12, color: "var(--text2)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                        <div style={{ fontWeight: 600, color: "var(--accent2)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 4 }}>Client Comment</div>
                        {e.client_comment}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ──────────────────────────────────────────── */}
      {deleteTarget && (
        <div onClick={() => !deleting && setDeleteTarget(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ maxWidth: 420, textAlign: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--red-bg)", border: "1px solid var(--red-border)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22, color: "var(--red)" }}>
              <i className="ti ti-trash" />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Remove Client Access?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24 }}>
              <strong style={{ color: "var(--text2)" }}>{deleteTarget.client_name}</strong> ({deleteTarget.email}) will no longer be able to log into the client portal. This cannot be undone.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteTarget(null)} className="btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid var(--red-border)", background: "var(--red-bg)", color: "var(--red)", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                {deleting ? "Removing..." : "Yes, Remove Access"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}