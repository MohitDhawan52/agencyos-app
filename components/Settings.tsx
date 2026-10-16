"use client";
import { useState } from "react";
import { supabase } from "./supabase";
import { getOrg, setOrg } from "@/lib/org";
import { BRAND } from "@/lib/brand";

// Workspace settings: name, finance accounts and "dasti" (personal borrow/repay) people.
export default function Settings() {
  const org = getOrg();
  const [name, setName] = useState<string>(org?.name || "");
  const [accounts, setAccounts] = useState<string[]>(org?.settings?.finance_accounts || ["Current Account", "Cash in Hand", "UPI"]);
  const [people, setPeople] = useState<string[]>(org?.settings?.dasti_people || []);
  const [newAccount, setNewAccount] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    if (!name.trim()) { setMsg({ ok: false, text: "Workspace name is required." }); return; }
    if (accounts.length === 0) { setMsg({ ok: false, text: "Keep at least one finance account." }); return; }
    setSaving(true); setMsg(null);
    const settings = { ...(org?.settings || {}), finance_accounts: accounts, dasti_people: people };
    const { error } = await supabase.from("organizations").update({ name: name.trim(), settings }).eq("id", org.id);
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setOrg({ ...org, name: name.trim(), settings });
    setMsg({ ok: true, text: "Saved. Reload the page to see the changes everywhere." });
  };

  const IS: React.CSSProperties = { width: "100%", background: "var(--input-bg, var(--bg3))", border: "1px solid var(--border2)", borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 14, outline: "none" };
  const LS: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" };

  const listEditor = ({ items, setItems, value, setValue, placeholder }: { items: string[]; setItems: (v: string[]) => void; value: string; setValue: (v: string) => void; placeholder: string }) => (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {items.length === 0 && <span style={{ fontSize: 13, color: "var(--text3)" }}>None yet</span>}
        {items.map(it => (
          <span key={it} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: "var(--glass2, var(--bg3))", border: "1px solid var(--border2)", fontSize: 13, color: "var(--text)" }}>
            {it}
            <button onClick={() => setItems(items.filter(x => x !== it))} title="Remove" style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: 0 }}><i className="ti ti-x" /></button>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} style={IS}
          onKeyDown={e => { if (e.key === "Enter" && value.trim() && !items.includes(value.trim())) { setItems([...items, value.trim()]); setValue(""); } }} />
        <button onClick={() => { if (value.trim() && !items.includes(value.trim())) { setItems([...items, value.trim()]); setValue(""); } }}
          style={{ padding: "0 16px", borderRadius: 10, border: "1px solid var(--border2)", background: "transparent", color: "var(--text2)", cursor: "pointer", fontFamily: "inherit" }}>Add</button>
      </div>
    </div>
  );

  return (
    <div className="page-wrap" style={{ maxWidth: 760, margin: "0 auto", width: "100%" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Settings</div>
        <div style={{ fontSize: 15, color: "var(--text2)", marginTop: 6 }}>Manage your {BRAND.name} workspace</div>
      </div>

      <div className="crm-card" style={{ padding: 24, marginBottom: 16 }}>
        <label style={LS}>Workspace name</label>
        <input value={name} onChange={e => setName(e.target.value)} style={IS} />
        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>Invoice details (address, GSTIN, bank) are under Finance → Company Settings.</div>
      </div>

      <div className="crm-card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Finance accounts</div>
        <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14 }}>Bank accounts, cash and UPI wallets you track money in. Renaming an account starts a new balance.</div>
        {listEditor({ items: accounts, setItems: setAccounts, value: newAccount, setValue: setNewAccount, placeholder: "e.g. HDFC Current, Partner UPI" })}
      </div>

      <div className="crm-card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>Dasti (personal borrow/repay) people</div>
        <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 14 }}>Founders or partners who lend or take money from the business.</div>
        {listEditor({ items: people, setItems: setPeople, value: newPerson, setValue: setNewPerson, placeholder: "Name" })}
      </div>

      {msg && <div style={{ marginBottom: 14, fontSize: 14, color: msg.ok ? "var(--green)" : "var(--red)" }}>{msg.text}</div>}
      <button onClick={save} disabled={saving} style={{ padding: "12px 22px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: saving ? .7 : 1 }}>
        {saving ? "Saving..." : "Save settings"}
      </button>
    </div>
  );
}
