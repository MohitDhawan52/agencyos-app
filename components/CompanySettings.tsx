"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { orgName, orgPath } from "@/lib/org";

const getFY = () => {
  const d = new Date(), m = d.getMonth() + 1, y = d.getFullYear();
  return m >= 4 ? `${String(y).slice(-2)}-${String(y + 1).slice(-2)}` : `${String(y - 1).slice(-2)}-${String(y).slice(-2)}`;
};

const DEFAULTS = {
  company_name: "",
  company_address: "",
  company_gstin: "",
  company_pan: "",
  company_phone: "",
  company_email: "",
  company_website: "",
  logo_url: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_name: "",
  bank_ifsc: "",
  bank_branch: "",
  bank_upi: "",
  invoice_prefix: "INV",
  invoice_start_number: 1,
  invoice_terms: [
    "Payment Made for this invoice should be through Bank Transfer Only.",
    "Payment Should be cleared within Due Date.",
    "This is a Monthly Plan Invoice",
  ],
};

const INPUT_STYLE: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid var(--border2)",
  borderRadius: 10,
  padding: "9px 13px",
  color: "var(--text)",
  fontFamily: "inherit",
  fontSize: 13,
  outline: "none",
  width: "100%",
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--text3)",
  textTransform: "uppercase",
  letterSpacing: ".5px",
};

// ── Stable sub-components defined at module level (not inside render) ─────────

function SectionHead({ icon, title }: { icon: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "28px 0 16px" }}>
      <i className={`ti ${icon}`} style={{ fontSize: 16, color: "var(--accent)" }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".7px" }}>{title}</span>
      <div style={{ flex: 1, borderTop: "1px solid var(--border)", marginLeft: 8 }} />
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={LABEL_STYLE}>{label}</label>
      <input
        type={type || "text"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={INPUT_STYLE}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CompanySettings() {
  const [form, setForm] = useState<any>(DEFAULTS);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [newTerm, setNewTerm] = useState("");
  const [logoPreview, setLogoPreview] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
    if (data) {
      setSettingsId(data.id);
      setForm({ ...DEFAULTS, ...data, invoice_terms: data.invoice_terms || DEFAULTS.invoice_terms });
      if (data.logo_url) setLogoPreview(data.logo_url);
    }
  };

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const saveSettings = async () => {
    setSaving(true);
    setSaveError("");
    const payload = { ...form, logo_url: logoPreview || form.logo_url };
    let err: any = null;
    if (settingsId) {
      const { error } = await supabase.from("company_settings").update(payload).eq("id", settingsId);
      err = error;
    } else {
      const { data, error } = await supabase.from("company_settings").insert([payload]).select().single();
      err = error;
      if (data) setSettingsId(data.id);
    }
    setSaving(false);
    if (err) {
      setSaveError(err.message || "Save failed — check Supabase SQL migration has been run.");
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const { error } = await supabase.storage.from("company-assets").upload(orgPath(`logo.${ext}`), file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("company-assets").getPublicUrl(orgPath(`logo.${ext}`));
      setLogoPreview(data.publicUrl);
      setForm((f: any) => ({ ...f, logo_url: data.publicUrl }));
    } else {
      const reader = new FileReader();
      reader.onload = e => setLogoPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
    setUploading(false);
  };

  const addTerm = () => {
    if (!newTerm.trim()) return;
    setForm((f: any) => ({ ...f, invoice_terms: [...(f.invoice_terms || []), newTerm.trim()] }));
    setNewTerm("");
  };

  const removeTerm = (i: number) =>
    setForm((f: any) => ({ ...f, invoice_terms: f.invoice_terms.filter((_: any, idx: number) => idx !== i) }));

  const updateTerm = (i: number, val: string) =>
    setForm((f: any) => ({
      ...f,
      invoice_terms: f.invoice_terms.map((t: string, idx: number) => idx === i ? val : t),
    }));

  const previewNo = `${form.invoice_prefix || "INV"}/${getFY()}${String(form.invoice_start_number || 1).padStart(3, "0")}`;

  return (
    <div style={{ maxWidth: 780, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Business Settings</div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 2 }}>Company info, bank details, and invoice configuration</div>
        </div>
        <button onClick={saveSettings} disabled={saving}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 24px", borderRadius: 10, border: "none", background: saved ? "#22c55e" : "var(--accent)", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
          {saving
            ? <><i className="ti ti-loader-2" style={{ fontSize: 16 }} /> Saving…</>
            : saved
            ? <><i className="ti ti-check" style={{ fontSize: 16 }} /> Saved!</>
            : <><i className="ti ti-device-floppy" style={{ fontSize: 16 }} /> Save Changes</>}
        </button>
      </div>

      {saveError && (
        <div style={{ marginTop: 10, padding: "10px 14px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, fontSize: 13, color: "#f87171" }}>
          <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />
          {saveError}
          {saveError.includes("does not exist") || saveError.includes("relation") ? (
            <span> — Run the SQL migration in Supabase first.</span>
          ) : null}
        </div>
      )}

      {/* ── Company Profile ─────────────────────────────── */}
      <SectionHead icon="ti-building" title="Company Profile" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="Company Name"  value={form.company_name || ""}    onChange={v => set("company_name", v)}    placeholder="Your Agency Pvt Ltd" />
        <Field label="GSTIN"         value={form.company_gstin || ""}   onChange={v => set("company_gstin", v)}   placeholder="22AAAAA0000A1Z5" />
        <Field label="PAN"           value={form.company_pan || ""}     onChange={v => set("company_pan", v)}     placeholder="ABCDE1234F" />
        <Field label="Phone"         value={form.company_phone || ""}   onChange={v => set("company_phone", v)}   placeholder="+91 98765 43210" type="tel" />
        <Field label="Email"         value={form.company_email || ""}   onChange={v => set("company_email", v)}   placeholder="hello@youragency.com" type="email" />
        <Field label="Website"       value={form.company_website || ""} onChange={v => set("company_website", v)} placeholder="youragency.com" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
        <label style={LABEL_STYLE}>Company Address</label>
        <textarea value={form.company_address || ""} onChange={e => set("company_address", e.target.value)}
          rows={3} style={{ ...INPUT_STYLE, resize: "vertical", lineHeight: 1.6 }}
          placeholder="Office address, City, State PIN" />
      </div>

      {/* ── Company Logo ─────────────────────────────────── */}
      <SectionHead icon="ti-photo" title="Company Logo" />
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 14 }}>
        <div style={{ width: 96, height: 96, borderRadius: 12, border: "2px dashed var(--border2)", background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
          {logoPreview
            ? <img src={logoPreview} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <i className="ti ti-photo" style={{ fontSize: 28, color: "var(--text3)" }} />}
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.05)", color: "var(--text)", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <i className="ti ti-upload" style={{ fontSize: 15 }} /> {uploading ? "Uploading…" : "Upload Logo"}
          </button>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>PNG, JPG — appears on printed invoices</div>
          {logoPreview && (
            <button onClick={() => { setLogoPreview(""); setForm((f: any) => ({ ...f, logo_url: "" })); }}
              style={{ marginTop: 6, fontSize: 12, color: "var(--red)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              Remove logo
            </button>
          )}
        </div>
      </div>

      {/* ── Bank Details ─────────────────────────────────── */}
      <SectionHead icon="ti-building-bank" title="Bank Details" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <Field label="Account Name"   value={form.bank_account_name || ""}   onChange={v => set("bank_account_name", v)}   placeholder="YOUR AGENCY PVT LTD" />
        <Field label="Account Number" value={form.bank_account_number || ""} onChange={v => set("bank_account_number", v)} placeholder="000000000000" />
        <Field label="Bank Name"      value={form.bank_name || ""}           onChange={v => set("bank_name", v)}           placeholder="Bank name" />
        <Field label="IFSC Code"      value={form.bank_ifsc || ""}           onChange={v => set("bank_ifsc", v)}           placeholder="ABCD0123456" />
        <Field label="Branch"         value={form.bank_branch || ""}         onChange={v => set("bank_branch", v)}         placeholder="Branch, City" />
        <Field label="UPI ID"         value={form.bank_upi || ""}            onChange={v => set("bank_upi", v)}            placeholder="youragency@upi" />
      </div>

      {/* ── Invoice Settings ─────────────────────────────── */}
      <SectionHead icon="ti-file-invoice" title="Invoice Settings" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={LABEL_STYLE}>Invoice Prefix</label>
          <input value={form.invoice_prefix || ""} onChange={e => set("invoice_prefix", e.target.value.toUpperCase())}
            placeholder="INV" style={INPUT_STYLE} maxLength={10} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={LABEL_STYLE}>Start Number</label>
          <input type="number" value={form.invoice_start_number || 1}
            onChange={e => set("invoice_start_number", parseInt(e.target.value) || 1)}
            min={1} style={INPUT_STYLE} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={LABEL_STYLE}>Preview</label>
          <div style={{ ...INPUT_STYLE, background: "rgba(109,93,252,0.08)", border: "1px solid rgba(109,93,252,0.25)", color: "var(--accent)", fontWeight: 700 }}>
            {previewNo}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, border: "1px solid var(--border)" }}>
        <i className="ti ti-info-circle" style={{ marginRight: 6, color: "var(--accent)" }} />
        Format: <strong style={{ color: "var(--text)" }}>{form.invoice_prefix || "INV"}/YY-YY###</strong> — year resets automatically. Start Number only applies to a new series (won't renumber existing invoices).
      </div>

      {/* ── Terms & Conditions ───────────────────────────── */}
      <SectionHead icon="ti-clipboard-list" title="Invoice Terms & Conditions" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {(form.invoice_terms || []).map((term: string, i: number) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "var(--text3)", fontWeight: 700, minWidth: 20 }}>{i + 1}.</span>
            <input value={term} onChange={e => updateTerm(i, e.target.value)}
              style={{ ...INPUT_STYLE, flex: 1 }} />
            <button onClick={() => removeTerm(i)}
              style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: "rgba(239,68,68,0.1)", color: "#f87171", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="ti ti-trash" style={{ fontSize: 14 }} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={newTerm} onChange={e => setNewTerm(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addTerm()}
          placeholder="Add a new term or condition…"
          style={{ ...INPUT_STYLE, flex: 1 }} />
        <button onClick={addTerm}
          style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <i className="ti ti-plus" style={{ fontSize: 14 }} /> Add
        </button>
      </div>

      <div style={{ height: 40 }} />
    </div>
  );
}
