import Link from "next/link";
import { BRAND } from "@/lib/brand";

export default function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: [string, string[]][] }) {
  return (
    <div style={{ height: "100vh", overflowY: "auto", background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "32px 16px 64px" }}>
        <Link href="/" style={{ color: "var(--text2)", fontSize: 14, textDecoration: "none" }}>← {BRAND.name}</Link>
        <h1 style={{ fontSize: 32, letterSpacing: "-0.8px", margin: "20px 0 4px" }}>{title}</h1>
        <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 28 }}>Last updated {updated}</div>
        {sections.map(([h, paras]) => (
          <section key={h} style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{h}</h2>
            {paras.map((p, i) => <p key={i} style={{ fontSize: 15, lineHeight: 1.65, color: "var(--text2)", margin: "0 0 10px" }}>{p}</p>)}
          </section>
        ))}
        <p style={{ fontSize: 14, color: "var(--text3)", marginTop: 32 }}>Questions: {BRAND.supportEmail}</p>
      </div>
    </div>
  );
}
