import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { PLANS, PlanId, TRIAL_DAYS } from "@/lib/plans";

const FEATURES = [
  { icon: "ti-building-store", title: "Clients & retainers", desc: "Every brand you manage, its services, team and status in one place." },
  { icon: "ti-calendar", title: "Content calendar", desc: "Plan posts per client and platform, attach files, track production." },
  { icon: "ti-checkbox", title: "Tasks & boards", desc: "Assign work, set due dates, comment and mention teammates." },
  { icon: "ti-portal", title: "Client approval portal", desc: "Clients log in to approve or comment on their content." },
  { icon: "ti-user-search", title: "Leads & meetings", desc: "Track prospects from first call to signed retainer." },
  { icon: "ti-clock-check", title: "Attendance & timesheets", desc: "Clock-ins, breaks, shoots, leaves and hours per client." },
  { icon: "ti-report-money", title: "Finance & GST invoices", desc: "Income, expenses, account balances and printable tax invoices." },
  { icon: "ti-heart-rate-monitor", title: "HR & payroll", desc: "Salaries, payouts, leave balances and KYC documents." },
];

export default function Landing() {
  return (
    <div style={{ height: "100vh", overflowY: "auto", background: "var(--bg)", color: "var(--text)" }}>
      <header style={{ maxWidth: 1120, margin: "0 auto", padding: "18px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={BRAND.logo} alt="" width={32} height={32} style={{ borderRadius: 8 }} />
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.4px" }}>{BRAND.name}</span>
        </div>
        <nav style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="#pricing" style={{ color: "var(--text2)", fontSize: 14, textDecoration: "none", padding: "8px 10px" }}>Pricing</a>
          <Link href="/app" style={{ color: "var(--text)", fontSize: 14, textDecoration: "none", padding: "8px 12px", border: "1px solid var(--border2)", borderRadius: 10 }}>Log in</Link>
        </nav>
      </header>

      <section style={{ maxWidth: 860, margin: "0 auto", padding: "64px 16px 40px", textAlign: "center" }}>
        <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "var(--accent2)", background: "var(--accent-bg)", border: "1px solid var(--accent-border)", padding: "5px 12px", borderRadius: 20, letterSpacing: ".4px" }}>
          Built for social media & content agencies
        </div>
        <h1 style={{ fontSize: "clamp(32px, 6vw, 56px)", lineHeight: 1.08, letterSpacing: "-1.5px", margin: "18px 0 16px", fontWeight: 800 }}>
          Run your whole agency from one workspace
        </h1>
        <p style={{ fontSize: 18, color: "var(--text2)", lineHeight: 1.55, margin: "0 auto", maxWidth: 640 }}>
          Clients, content calendars, tasks, approvals, attendance, invoices and payroll — together, for your whole team.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 30, flexWrap: "wrap" }}>
          <Link href="/signup" style={{ background: "var(--accent)", color: "#fff", padding: "14px 24px", borderRadius: 12, fontWeight: 700, textDecoration: "none" }}>
            Start {TRIAL_DAYS}-day free trial
          </Link>
          <a href="#pricing" style={{ color: "var(--text)", padding: "14px 24px", borderRadius: 12, fontWeight: 600, textDecoration: "none", border: "1px solid var(--border2)" }}>See pricing</a>
        </div>
        <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 12 }}>No card needed for the trial.</div>
      </section>

      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 16px 56px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {FEATURES.map(f => (
            <div key={f.title} className="crm-card" style={{ padding: 20 }}>
              <i className={`ti ${f.icon}`} style={{ fontSize: 22, color: "var(--accent2)" }} />
              <div style={{ fontWeight: 700, marginTop: 10 }}>{f.title}</div>
              <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 6, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 16px 72px" }}>
        <h2 style={{ textAlign: "center", fontSize: 32, letterSpacing: "-0.8px", margin: "0 0 8px" }}>Simple monthly pricing</h2>
        <p style={{ textAlign: "center", color: "var(--text2)", margin: "0 0 32px" }}>Every plan starts with a {TRIAL_DAYS}-day free trial. Cancel anytime.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
          {(Object.keys(PLANS) as PlanId[]).map(id => {
            const p = PLANS[id];
            return (
              <div key={id} className="crm-card" style={{ padding: 26, display: "flex", flexDirection: "column", border: id === "growth" ? "1px solid var(--accent-border)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent2)", textTransform: "uppercase", letterSpacing: ".6px" }}>{p.name}</div>
                  {id === "growth" && <span style={{ fontSize: 11, fontWeight: 700, background: "var(--accent)", color: "#fff", padding: "3px 8px", borderRadius: 20 }}>Popular</span>}
                </div>
                <div style={{ fontSize: 36, fontWeight: 800, margin: "10px 0 2px" }}>₹{p.price.toLocaleString("en-IN")}<span style={{ fontSize: 15, fontWeight: 500, color: "var(--text3)" }}>/month</span></div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 16 }}>+ GST as applicable</div>
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 22px", display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                  {p.highlights.map(h => (
                    <li key={h} style={{ fontSize: 14, color: "var(--text2)", display: "flex", gap: 8 }}>
                      <i className="ti ti-check" style={{ color: "var(--green)", marginTop: 2 }} />{h}
                    </li>
                  ))}
                </ul>
                <Link href={`/signup?plan=${id}`} style={{ textAlign: "center", background: id === "growth" ? "var(--accent)" : "transparent", color: id === "growth" ? "#fff" : "var(--text)", border: id === "growth" ? "none" : "1px solid var(--border2)", padding: "12px 16px", borderRadius: 10, fontWeight: 700, textDecoration: "none" }}>
                  Start free trial
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      <footer style={{ borderTop: "1px solid var(--border)", padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
        © {new Date().getFullYear()} {BRAND.legalEntity} ·{" "}
        <Link href="/terms" style={{ color: "var(--text2)" }}>Terms</Link> ·{" "}
        <Link href="/privacy" style={{ color: "var(--text2)" }}>Privacy</Link> ·{" "}
        <a href={`mailto:${BRAND.supportEmail}`} style={{ color: "var(--text2)" }}>{BRAND.supportEmail}</a>
      </footer>
    </div>
  );
}
