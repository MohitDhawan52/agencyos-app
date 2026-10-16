"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/components/supabase";
import { BRAND } from "@/lib/brand";
import { PLANS, PlanId, TRIAL_DAYS } from "@/lib/plans";

export default function Signup() {
  // "website" is a honeypot: hidden from people, filled in by bots, rejected by the API.
  const [form, setForm] = useState({ agencyName: "", name: "", email: "", password: "", plan: "growth" as PlanId, website: "" });
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmSent, setConfirmSent] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("plan");
    if (p && p in PLANS) setForm(f => ({ ...f, plan: p as PlanId }));
  }, []);

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setError("");
    if (!agree) { setError("Please accept the Terms and Privacy Policy."); return; }
    setBusy(true);
    const res = await fetch("/api/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error || "Could not create your workspace."); setBusy(false); return; }
    if (json.needsConfirm) { setConfirmSent(true); setBusy(false); return; }
    const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password });
    if (error) { setError("Workspace created. Please log in."); setBusy(false); window.location.href = "/app"; return; }
    window.location.href = "/app";
  };

  const IS: React.CSSProperties = { width: "100%", background: "var(--input-bg, var(--bg3))", border: "1px solid var(--border2)", borderRadius: 10, padding: "13px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 16, outline: "none", boxSizing: "border-box" };
  const LS: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" };

  if (confirmSent) return (
    <div style={{ height: "100vh", overflowY: "auto", background: "var(--bg)", padding: "32px 16px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", background: "var(--modal-bg, var(--bg2))", border: "1px solid var(--border2)", borderRadius: 20, padding: "30px 26px", textAlign: "center" }}>
        <img src={BRAND.logo} alt="" width={52} height={52} style={{ borderRadius: 14 }} />
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginTop: 12 }}>Check your email</div>
        <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 10, lineHeight: 1.6 }}>
          We sent a confirmation link to <b>{form.email.trim().toLowerCase()}</b>. Click it to activate your workspace, then log in.
        </div>
        <Link href="/app" style={{ display: "inline-block", marginTop: 22, padding: "12px 22px", background: "var(--accent)", color: "#fff", borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: "none" }}>Go to login</Link>
      </div>
    </div>
  );

  return (
    <div style={{ height: "100vh", overflowY: "auto", background: "var(--bg)", padding: "32px 16px", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 460, margin: "0 auto", background: "var(--modal-bg, var(--bg2))", border: "1px solid var(--border2)", borderRadius: 20, padding: "30px 26px" }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <img src={BRAND.logo} alt="" width={52} height={52} style={{ borderRadius: 14 }} />
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginTop: 12 }}>Create your agency workspace</div>
          <div style={{ fontSize: 14, color: "var(--text3)", marginTop: 4 }}>{TRIAL_DAYS}-day free trial · no card needed</div>
        </div>

        <div style={{ marginBottom: 14 }}><label style={LS}>Agency name</label><input style={IS} value={form.agencyName} onChange={e => set("agencyName", e.target.value)} placeholder="e.g. Bright Pixel Media" /></div>
        <div style={{ marginBottom: 14 }}><label style={LS}>Your name</label><input style={IS} value={form.name} onChange={e => set("name", e.target.value)} /></div>
        <div style={{ marginBottom: 14 }}><label style={LS}>Work email</label><input style={IS} type="email" autoCapitalize="none" value={form.email} onChange={e => set("email", e.target.value)} /></div>
        <div style={{ marginBottom: 14 }}><label style={LS}>Password</label><input style={IS} type="password" value={form.password} onChange={e => set("password", e.target.value)} placeholder="At least 8 characters" /></div>
        <div aria-hidden="true" style={{ position: "absolute", left: -10000, top: "auto", width: 1, height: 1, overflow: "hidden" }}>
          <label>Website<input tabIndex={-1} autoComplete="off" name="website" value={form.website} onChange={e => set("website", e.target.value)} /></label>
        </div>

        <label style={LS}>Plan</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 18 }}>
          {(Object.keys(PLANS) as PlanId[]).map(id => (
            <button key={id} onClick={() => set("plan", id)} style={{
              padding: "10px 6px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "center",
              border: form.plan === id ? "1px solid var(--accent)" : "1px solid var(--border2)",
              background: form.plan === id ? "var(--accent-bg)" : "transparent", color: "var(--text)",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{PLANS[id].name}</div>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>₹{PLANS[id].price.toLocaleString("en-IN")}/mo</div>
            </button>
          ))}
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, color: "var(--text2)", marginBottom: 18, cursor: "pointer" }}>
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
          <span>I agree to the <Link href="/terms" target="_blank" style={{ color: "var(--accent2)" }}>Terms of Service</Link> and <Link href="/privacy" target="_blank" style={{ color: "var(--accent2)" }}>Privacy Policy</Link>.</span>
        </label>

        {error && <div style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--red)", marginBottom: 14 }}>{error}</div>}

        <button onClick={submit} disabled={busy} style={{ width: "100%", padding: 14, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: busy ? .7 : 1, fontFamily: "inherit" }}>
          {busy ? "Creating workspace..." : "Create workspace"}
        </button>
        <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "var(--text3)" }}>
          Already have an account? <Link href="/app" style={{ color: "var(--accent2)", fontWeight: 600 }}>Log in</Link>
        </div>
      </div>
    </div>
  );
}
