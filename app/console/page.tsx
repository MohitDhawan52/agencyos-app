"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/components/supabase";
import { authedFetch } from "@/lib/org";
import { PLANS, PlanId, isOrgActive } from "@/lib/plans";

// Platform-owner console. Not linked anywhere; every API call is checked
// server-side against the platform_admins table.
const TABLES = [
  "profiles", "client_profiles", "clients", "tasks", "board_tasks", "content_calendar", "content_ideas",
  "content_pillars", "creatives", "videos", "shoot_plans", "leads", "meetings", "attendance",
  "leave_requests", "leave_balance", "hr_profiles", "payouts", "timesheets", "transactions", "balances",
  "dasti_transactions", "invoices", "retainers", "company_settings", "messages", "alerts",
  "notifications", "task_comments", "client_assignments", "overtime", "payroll_overrides", "activity_logs",
];

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const d = (iso?: string) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const toInput = (iso?: string) => iso ? iso.slice(0, 10) : "";

export default function Console() {
  const [state, setState] = useState<"loading" | "login" | "denied" | "ready">("loading");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState("");
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState<any>(null);

  const check = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setState("login"); return; }
    const r = await authedFetch("/api/console", { action: "whoami" });
    if (!r.ok) { setState("denied"); return; }
    setState("ready"); load();
  };
  const load = async () => {
    const r = await authedFetch("/api/console", { action: "overview" });
    if (r.ok) setData(r.json);
  };
  useEffect(() => { check(); }, []);

  const login = async () => {
    setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setErr("Invalid credentials"); return; }
    check();
  };

  if (state === "loading") return <Shell><div style={{ color: "var(--text3)", padding: 40 }}>Loading…</div></Shell>;
  if (state === "denied") return <Shell><div style={{ color: "var(--text3)", padding: 40, textAlign: "center" }}>404 · Not found<br /><button onClick={async () => { await supabase.auth.signOut(); setState("login"); }} style={ghost}>Switch account</button></div></Shell>;
  if (state === "login") return (
    <Shell>
      <div style={{ maxWidth: 360, margin: "80px auto", padding: 24 }} className="crm-card">
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16, color: "var(--text)" }}>Console</div>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={inp} />
        <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && login()} style={{ ...inp, marginTop: 10 }} />
        {err && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button onClick={login} style={{ ...primary, width: "100%", marginTop: 14 }}>Sign in</button>
      </div>
    </Shell>
  );

  const orgs: any[] = data?.orgs || [];
  const shown = orgs.filter(o =>
    (filter === "all" || (filter === "inactive" ? !isOrgActive(o) : o.status === filter)) &&
    (!q || [o.name, o.owner?.email, o.owner?.name].some((s: string) => s?.toLowerCase().includes(q.toLowerCase()))));
  const count = (s: string) => orgs.filter(o => o.status === s).length;

  return (
    <Shell>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 24, color: "var(--text)" }}>Platform console</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={load} style={ghost}><i className="ti ti-refresh" /> Refresh</button>
            <button onClick={async () => { await supabase.auth.signOut(); setState("login"); }} style={ghost}>Sign out</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
          {[
            ["Agencies", orgs.length], ["Paying", count("active")], ["On trial", count("trialing")],
            ["Past due", count("past_due")], ["MRR", inr(data?.stats?.mrr || 0)],
            ["Collected this month", inr(data?.stats?.revenueThisMonth || 0)], ["Collected all-time", inr(data?.stats?.revenueAllTime || 0)],
          ].map(([l, v]) => (
            <div key={l as string} className="crm-card" style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>{l}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--text)", marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input placeholder="Search agency, owner, email…" value={q} onChange={e => setQ(e.target.value)} style={{ ...inp, maxWidth: 320 }} />
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ ...inp, width: 170 }}>
            {["all", "active", "trialing", "past_due", "cancelled", "suspended", "inactive"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="crm-card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: "var(--text2)" }}>
            <thead><tr style={{ textAlign: "left", color: "var(--text3)" }}>
              {["Agency", "Owner", "Plan", "Status", "Team", "Clients", "Tasks (mo)", "Renews / trial ends", "Joined"].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {shown.map(o => {
                const p = PLANS[o.plan as PlanId];
                return (
                  <tr key={o.id} onClick={() => setSel(o)} style={{ cursor: "pointer", borderTop: "1px solid var(--border)" }}>
                    <td style={td}><b style={{ color: "var(--text)" }}>{o.name}</b></td>
                    <td style={td}>{o.owner?.name}<div style={{ fontSize: 12, color: "var(--text3)" }}>{o.owner?.email}</div></td>
                    <td style={td}>{p?.name}</td>
                    <td style={td}><StatusPill org={o} /></td>
                    <td style={td}>{o.members} / {p?.teamLimit}</td>
                    <td style={td}>{o.clients}</td>
                    <td style={td}>{o.tasks_this_month} / {p?.taskLimit ?? "∞"}</td>
                    <td style={td}>{d(o.status === "trialing" ? o.trial_ends_at : o.current_period_end)}</td>
                    <td style={td}>{d(o.created_at)}</td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={9} style={{ ...td, textAlign: "center", padding: 30 }}>No agencies</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {sel && <OrgDrawer org={sel} onClose={() => setSel(null)} onSaved={() => { load(); }} />}
    </Shell>
  );
}

function OrgDrawer({ org, onClose, onSaved }: { org: any; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [edit, setEdit] = useState({ plan: org.plan, status: org.status, trial_ends_at: toInput(org.trial_ends_at), current_period_end: toInput(org.current_period_end) });
  const [table, setTable] = useState("profiles");
  const [rows, setRows] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => { authedFetch("/api/console", { action: "org", orgId: org.id }).then(r => r.ok && setDetail(r.json)); }, [org.id]);
  useEffect(() => { setRows(null); authedFetch("/api/console", { action: "table", orgId: org.id, table, page }).then(r => r.ok && setRows(r.json)); }, [org.id, table, page]);

  const save = async () => {
    setSaving(true);
    await authedFetch("/api/console", {
      action: "update-org", orgId: org.id, plan: edit.plan, status: edit.status,
      trial_ends_at: edit.trial_ends_at ? new Date(edit.trial_ends_at + "T23:59:59").toISOString() : null,
      current_period_end: edit.current_period_end ? new Date(edit.current_period_end + "T23:59:59").toISOString() : null,
    });
    setSaving(false); onSaved();
  };

  const cols = rows?.rows?.length ? Object.keys(rows.rows[0]).filter(c => c !== "org_id") : [];
  const fmt = (v: any) => v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(1000px, 100%)", height: "100%", overflowY: "auto", background: "var(--bg2)", borderLeft: "1px solid var(--border2)", padding: 20, boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, color: "var(--text)" }}>{org.name}</h2>
          <button onClick={onClose} style={ghost}><i className="ti ti-x" /></button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>ID {org.id} · Razorpay sub {org.razorpay_subscription_id || "—"}</div>

        <div className="crm-card" style={{ padding: 16, marginTop: 16 }}>
          <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>Subscription (manual override)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
            <label style={lab}>Plan<select value={edit.plan} onChange={e => setEdit({ ...edit, plan: e.target.value })} style={inp}>{Object.values(PLANS).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label style={lab}>Status<select value={edit.status} onChange={e => setEdit({ ...edit, status: e.target.value })} style={inp}>{["trialing", "active", "past_due", "cancelled", "suspended"].map(s => <option key={s}>{s}</option>)}</select></label>
            <label style={lab}>Trial ends<input type="date" value={edit.trial_ends_at} onChange={e => setEdit({ ...edit, trial_ends_at: e.target.value })} style={inp} /></label>
            <label style={lab}>Paid until<input type="date" value={edit.current_period_end} onChange={e => setEdit({ ...edit, current_period_end: e.target.value })} style={inp} /></label>
          </div>
          <button onClick={save} disabled={saving} style={{ ...primary, marginTop: 12 }}>{saving ? "Saving…" : "Save"}</button>
        </div>

        {detail && (
          <div className="crm-card" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Data</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TABLES.map(t => (
                <button key={t} onClick={() => { setTable(t); setPage(0); }} style={{ ...chip, ...(t === table ? { borderColor: "var(--accent)", color: "var(--text)" } : {}) }}>
                  {t} <span style={{ color: "var(--text3)" }}>{detail.counts[t] ?? 0}</span>
                </button>
              ))}
            </div>
            <div style={{ overflowX: "auto", marginTop: 12, maxHeight: 420, border: "1px solid var(--border)", borderRadius: 8 }}>
              {!rows ? <div style={{ padding: 16, color: "var(--text3)" }}>Loading…</div> : rows.rows.length === 0 ? <div style={{ padding: 16, color: "var(--text3)" }}>No rows</div> : (
                <table style={{ borderCollapse: "collapse", fontSize: 12, color: "var(--text2)" }}>
                  <thead><tr>{cols.map(c => <th key={c} style={{ ...th, position: "sticky", top: 0, background: "var(--bg3)" }}>{c}</th>)}</tr></thead>
                  <tbody>{rows.rows.map((r: any, i: number) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      {cols.map(c => <td key={c} title={fmt(r[c])} style={{ ...td, maxWidth: 240, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fmt(r[c])}</td>)}
                    </tr>
                  ))}</tbody>
                </table>
              )}
            </div>
            {rows && rows.total > rows.pageSize && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, fontSize: 13, color: "var(--text3)" }}>
                <button disabled={page === 0} onClick={() => setPage(page - 1)} style={ghost}>Prev</button>
                Page {page + 1} of {Math.ceil(rows.total / rows.pageSize)}
                <button disabled={(page + 1) * rows.pageSize >= rows.total} onClick={() => setPage(page + 1)} style={ghost}>Next</button>
              </div>
            )}
          </div>
        )}

        {detail?.billing?.length > 0 && (
          <div className="crm-card" style={{ padding: 16, marginTop: 16 }}>
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>Billing history</div>
            {detail.billing.map((b: any) => (
              <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, color: "var(--text2)", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                <span>{b.event}</span><span>{b.amount ? inr(b.amount) : ""}</span><span style={{ color: "var(--text3)" }}>{new Date(b.created_at).toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ org }: { org: any }) {
  const active = isOrgActive(org);
  const color = !active ? "var(--red)" : org.status === "active" ? "var(--green)" : org.status === "trialing" ? "var(--blue)" : "var(--amber)";
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, color, border: `1px solid ${color}` }}>{active ? org.status : org.status + " · locked"}</span>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ height: "100vh", overflowY: "auto", background: "var(--bg)" }}><meta name="robots" content="noindex,nofollow" />{children}</div>;
}

const inp: React.CSSProperties = { width: "100%", background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 8, padding: "9px 12px", color: "var(--text)", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" };
const primary: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const ghost: React.CSSProperties = { padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border2)", background: "transparent", color: "var(--text2)", cursor: "pointer", fontFamily: "inherit", fontSize: 13 };
const chip: React.CSSProperties = { padding: "5px 9px", borderRadius: 8, border: "1px solid var(--border2)", background: "transparent", color: "var(--text2)", cursor: "pointer", fontFamily: "inherit", fontSize: 12 };
const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 12px", verticalAlign: "top" };
const lab: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--text3)" };
