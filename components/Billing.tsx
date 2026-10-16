"use client";
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { PLANS, PlanId, isOrgActive } from "@/lib/plans";
import { authedFetch } from "@/lib/org";
import { BRAND } from "@/lib/brand";

declare global { interface Window { Razorpay?: any } }

const loadCheckout = () => new Promise<boolean>(resolve => {
  if (window.Razorpay) return resolve(true);
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = () => resolve(true);
  s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

const fmtDate = (iso?: string) => iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export default function Billing({ org, locked = false, onChanged, onLogout }: { org: any; locked?: boolean; onChanged: () => void; onLogout?: () => void }) {
  const [members, setMembers] = useState(0);
  const [tasksUsed, setTasksUsed] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!org?.id) return;
    const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
    Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }).neq("status", "left"),
      supabase.from("tasks").select("id", { count: "exact", head: true }).gte("created_at", start.toISOString()),
      supabase.from("board_tasks").select("id", { count: "exact", head: true }).gte("created_at", start.toISOString()),
    ]).then(([m, t, b]) => {
      setMembers(m.count || 0);
      setTasksUsed((t.count || 0) + (b.count || 0));
    });
  }, [org?.id]);

  const current = PLANS[(org?.plan as PlanId) || "starter"];
  const active = isOrgActive(org);

  const subscribe = async (plan: PlanId) => {
    setBusy(plan); setMsg(null);
    const ok = await loadCheckout();
    if (!ok) { setMsg({ type: "err", text: "Could not load the payment window. Check your connection." }); setBusy(null); return; }
    const { ok: resOk, json } = await authedFetch("/api/billing/subscribe", { plan });
    if (!resOk) { setMsg({ type: "err", text: json.error || "Could not start checkout." }); setBusy(null); return; }

    const rzp = new window.Razorpay({
      key: json.keyId,
      subscription_id: json.subscriptionId,
      name: BRAND.name,
      description: `${PLANS[plan].name} plan · ${inr(PLANS[plan].price)}/month`,
      prefill: { email: json.email },
      notes: { workspace: json.orgName },
      theme: { color: "#6d5dfc" },
      handler: async (resp: any) => {
        const v = await authedFetch("/api/billing/verify", resp);
        if (v.ok) { setMsg({ type: "ok", text: `You're on the ${PLANS[plan].name} plan. Thank you!` }); onChanged(); }
        else setMsg({ type: "err", text: v.json.error || "Payment received but verification failed. Contact support." });
        setBusy(null);
      },
      modal: { ondismiss: () => setBusy(null) },
    });
    rzp.open();
  };

  const cancel = async () => {
    if (!confirm("Cancel your subscription? Your workspace keeps working until the end of the current billing period.")) return;
    setBusy("cancel");
    const { ok, json } = await authedFetch("/api/billing/cancel");
    setMsg(ok ? { type: "ok", text: "Subscription cancelled. Access continues until " + fmtDate(org.current_period_end) + "." } : { type: "err", text: json.error });
    setBusy(null);
    if (ok) onChanged();
  };

  const statusText =
    org?.status === "trialing" ? (active ? `Free trial · ends ${fmtDate(org.trial_ends_at)}` : "Free trial ended") :
    org?.status === "active" ? `Active · renews ${fmtDate(org.current_period_end)}` :
    org?.status === "past_due" ? "Payment failed · please update payment" :
    org?.status === "cancelled" ? (active ? `Cancelled · access until ${fmtDate(org.current_period_end)}` : "Cancelled") :
    org?.status === "suspended" ? `Suspended · contact ${BRAND.supportEmail}` : "";

  const Meter = ({ label, used, limit }: { label: string; used: number; limit: number | null }) => {
    const pct = limit ? Math.min(100, Math.round(used / limit * 100)) : 0;
    return (
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--text2)", marginBottom: 6 }}>
          <span>{label}</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{used.toLocaleString("en-IN")} / {limit ? limit.toLocaleString("en-IN") : "Unlimited"}</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "var(--bg4)", overflow: "hidden" }}>
          <div style={{ width: `${limit ? pct : 4}%`, height: "100%", background: pct >= 90 ? "var(--red)" : "var(--accent)" }} />
        </div>
      </div>
    );
  };

  return (
    <div className="page-wrap" style={{ maxWidth: 1040, margin: "0 auto", width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", margin: 0 }}>
            {locked ? "Choose a plan to continue" : "Plan & Billing"}
          </h1>
          <p style={{ fontSize: 14, color: "var(--text3)", marginTop: 6 }}>
            {locked ? `${org?.name || "Your workspace"} is paused. Your data is safe — pick a plan to unlock it.` : `${org?.name} · ${current.name} plan`}
          </p>
        </div>
        {onLogout && <button onClick={onLogout} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border2)", background: "transparent", color: "var(--text2)", cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>}
      </div>

      {msg && (
        <div style={{ marginBottom: 18, padding: "10px 14px", borderRadius: 10, fontSize: 14,
          background: msg.type === "ok" ? "var(--green-bg)" : "var(--red-bg)", color: msg.type === "ok" ? "var(--green)" : "var(--red)",
          border: `1px solid ${msg.type === "ok" ? "var(--green-border)" : "var(--red-border)"}` }}>{msg.text}</div>
      )}

      <div className="crm-card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: "var(--text)" }}>{current.name} · {inr(current.price)}/month</div>
          <div style={{ fontSize: 13, color: org?.status === "past_due" || !active ? "var(--red)" : "var(--text2)" }}>{statusText}</div>
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <Meter label="Team members" used={members} limit={current.teamLimit} />
          <Meter label="Tasks this month" used={tasksUsed} limit={current.taskLimit} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {(Object.keys(PLANS) as PlanId[]).map(id => {
          const p = PLANS[id];
          const isCurrent = id === org?.plan && org?.status === "active" && active;
          return (
            <div key={id} className="crm-card" style={{ padding: 22, display: "flex", flexDirection: "column", border: id === "growth" ? "1px solid var(--accent-border)" : undefined }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent2)", textTransform: "uppercase", letterSpacing: ".6px" }}>{p.name}</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "var(--text)", margin: "8px 0 2px" }}>{inr(p.price)}<span style={{ fontSize: 14, fontWeight: 500, color: "var(--text3)" }}>/month</span></div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 14 }}>+ GST as applicable</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 18px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                {p.highlights.map(h => (
                  <li key={h} style={{ fontSize: 14, color: "var(--text2)", display: "flex", gap: 8 }}>
                    <i className="ti ti-check" style={{ color: "var(--green)", marginTop: 2 }} />{h}
                  </li>
                ))}
              </ul>
              <button disabled={isCurrent || !!busy} onClick={() => subscribe(id)} style={{
                padding: "11px 14px", borderRadius: 10, border: "none", fontWeight: 600, fontFamily: "inherit", fontSize: 14,
                cursor: isCurrent || busy ? "default" : "pointer",
                background: isCurrent ? "var(--bg4)" : "var(--accent)", color: isCurrent ? "var(--text2)" : "#fff", opacity: busy && busy !== id ? .6 : 1,
              }}>
                {isCurrent ? "Current plan" : busy === id ? "Opening checkout..." : org?.status === "active" && active ? `Switch to ${p.name}` : `Subscribe to ${p.name}`}
              </button>
            </div>
          );
        })}
      </div>

      {org?.status === "active" && org?.razorpay_subscription_id && (
        <div style={{ marginTop: 22, textAlign: "center" }}>
          <button onClick={cancel} disabled={!!busy} style={{ background: "transparent", border: "none", color: "var(--text3)", fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
            Cancel subscription
          </button>
        </div>
      )}
      <p style={{ marginTop: 18, fontSize: 12, color: "var(--text3)", textAlign: "center" }}>
        Payments are processed securely by Razorpay. Questions? {BRAND.supportEmail}
      </p>
    </div>
  );
}
