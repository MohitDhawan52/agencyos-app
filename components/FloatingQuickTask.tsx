"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { FINANCE_ACCOUNTS, getOrg } from "@/lib/org";
import { planAllowsPage } from "@/lib/plans";
import { createNotification } from "./NotificationBell";

const PRIORITY_OPTIONS = ["High", "Medium", "Low"];
const ACCOUNTS = FINANCE_ACCOUNTS;
const EXPENSE_CATS = ["Salary", "Tools & Software", "Ads Budget", "Office", "Travel", "Food", "Freelancer", "Other"];

type Mode = "task" | "expense" | "note";

const MODES: { key: Mode; icon: string; label: string; color: string }[] = [
  { key: "task",    icon: "ti-checkbox",    label: "Task",    color: "#6366f1" },
  { key: "expense", icon: "ti-receipt",     label: "Expense", color: "#f87171" },
  { key: "note",    icon: "ti-note",        label: "Note",    color: "#fbbf24" },
];

export default function FloatingQuickTask({ isAdmin = false }: { isAdmin?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("task");
  const [members, setMembers] = useState<any[]>([]);
  const [clientList, setClientList] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Task form
  const [taskForm, setTaskForm] = useState({ title: "", client: "", priority: "High", assignee: "", due: "" });
  // Expense form
  const [expForm, setExpForm] = useState({ description: "", amount: "", account: "Current Account", category: "Other", client: "", date: new Date().toISOString().split("T")[0] });
  // Note form
  const [noteText, setNoteText] = useState("");
  const [noteClient, setNoteClient] = useState("");

  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("profiles").select("id, name, color").neq("status", "left").order("created_at").then(({ data }) => { if (data) setMembers(data); });
    supabase.from("clients").select("name").eq("status", "Active").order("name").then(({ data }) => { if (data) setClientList(data.map((c: any) => c.name)); });
  }, []);

  // Cmd+K / Ctrl+K global shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
        setSaved(false);
        setError("");
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => titleRef.current?.focus(), 80);
  }, [open, mode]);

  const reset = () => {
    setTaskForm({ title: "", client: "", priority: "High", assignee: "", due: "" });
    setExpForm({ description: "", amount: "", account: "Current Account", category: "Other", client: "", date: new Date().toISOString().split("T")[0] });
    setNoteText(""); setNoteClient("");
    setSaved(false); setError("");
  };

  const saveTask = async () => {
    if (!taskForm.title.trim()) return;
    setError(""); setSaving(true);
    const { error: e } = await supabase.from("tasks").insert([{
      title: taskForm.title.trim(), client: taskForm.client, priority: taskForm.priority,
      assignees: taskForm.assignee ? [taskForm.assignee] : [],
      assignee: taskForm.assignee || "", due: taskForm.due || null, status: "To Do", done: false,
    }]);
    if (e) { setError(e.message); setSaving(false); return; }
    if (taskForm.assignee) {
      const member = members.find(m => m.name === taskForm.assignee);
      if (member?.id) await createNotification({ userId: member.id, type: "task", title: "New task assigned 📋", body: `${taskForm.title}${taskForm.client ? ` · ${taskForm.client}` : ""} · ${taskForm.priority}`, meta: {} });
    }
    setSaving(false); setSaved(true);
    setTimeout(() => { reset(); setOpen(false); }, 1400);
  };

  const saveExpense = async () => {
    if (!expForm.description.trim() || !expForm.amount) return;
    setError(""); setSaving(true);
    const amt = parseFloat(expForm.amount);
    const { data: balRow } = await supabase.from("balances").select("amount").eq("account", expForm.account).single();
    const currentBal = balRow?.amount || 0;
    const { error: e } = await supabase.from("transactions").insert([{
      type: "expense", amount: amt, description: expForm.description.trim(),
      account: expForm.account, category: expForm.category, client: expForm.client, date: expForm.date,
    }]);
    if (e) { setError(e.message); setSaving(false); return; }
    await supabase.from("balances").upsert([{ account: expForm.account, amount: currentBal - amt }], { onConflict: "org_id,account" });
    setSaving(false); setSaved(true);
    setTimeout(() => { reset(); setOpen(false); }, 1400);
  };

  const saveNote = async () => {
    if (!noteText.trim()) return;
    setError(""); setSaving(true);
    const { error: e } = await supabase.from("activity_logs").insert([{
      action: "Note",
      description: noteText.trim(),
      entity_type: noteClient ? "client" : "general",
      entity_name: noteClient || "General",
    }]);
    if (e) { setError(e.message); setSaving(false); return; }
    setSaving(false); setSaved(true);
    setTimeout(() => { reset(); setOpen(false); }, 1400);
  };

  const handleSave = () => {
    if (mode === "task") saveTask();
    else if (mode === "expense") saveExpense();
    else saveNote();
  };

  const activeMode = MODES.find(m => m.key === mode)!;

  const IS: React.CSSProperties = { width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "9px 13px", color: "#fff", fontFamily: "inherit", fontSize: 13, outline: "none" };
  const LS: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".7px" };

  return (
    <>
      <style>{`
        @keyframes qSlideUp { from{opacity:0;transform:translateY(12px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
      `}</style>

      {/* Floating button */}
      <button
        onClick={() => { setOpen(o => !o); if (!open) { setSaved(false); setError(""); } }}
        title="Quick Add — Cmd+K"
        style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 8000,
          width: 52, height: 52, borderRadius: 16,
          background: open ? "rgba(99,102,241,0.9)" : "linear-gradient(135deg,#6366f1,#8b5cf6)",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 28px rgba(99,102,241,0.55)", transition: "all 0.2s",
        }}
      >
        <i className={`ti ${open ? "ti-x" : "ti-bolt"}`} style={{ fontSize: 22, color: "#fff" }} />
      </button>

      {/* Quick add panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 92, right: 28, zIndex: 8000,
          width: 340, borderRadius: 18,
          background: "rgba(10,10,18,0.98)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
          border: `1px solid ${activeMode.color}50`,
          boxShadow: `0 24px 64px rgba(0,0,0,0.8), 0 0 0 1px ${activeMode.color}15`,
          padding: "16px 16px 18px",
          animation: "qSlideUp 0.18s ease",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: `${activeMode.color}25`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className={`ti ${activeMode.icon}`} style={{ fontSize: 14, color: activeMode.color }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Quick Add</span>
            </div>
            <kbd style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5, padding: "2px 6px" }}>⌘K</kbd>
          </div>

          {/* Mode switcher */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4 }}>
            {MODES.filter(m => m.key !== "expense" || (isAdmin && planAllowsPage(getOrg()?.plan, "finance"))).map(m => (
              <button key={m.key} onClick={() => { setMode(m.key); reset(); }} style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, background: mode === m.key ? `${m.color}25` : "transparent", color: mode === m.key ? m.color : "rgba(255,255,255,0.4)", transition: "all .15s" }}>
                <i className={`ti ${m.icon}`} style={{ fontSize: 13 }} /> {m.label}
              </button>
            ))}
          </div>

          {saved ? (
            <div style={{ textAlign: "center", padding: "20px 0", color: "#4ade80" }}>
              <i className="ti ti-circle-check" style={{ fontSize: 36 }} />
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8 }}>{mode === "task" ? "Task added!" : mode === "expense" ? "Expense logged!" : "Note saved!"}</div>
            </div>
          ) : (
            <>
              {mode === "task" && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <label style={LS}>Task Title *</label>
                    <input ref={titleRef} autoFocus value={taskForm.title}
                      onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && !saving && handleSave()}
                      placeholder="What needs to be done?" style={{ ...IS, fontSize: 14, padding: "10px 13px" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div><label style={LS}>Client</label>
                      <select value={taskForm.client} onChange={e => setTaskForm(f => ({ ...f, client: e.target.value }))} style={IS}>
                        <option value="">None</option>
                        {clientList.map(c => <option key={c}>{c}</option>)}
                      </select></div>
                    <div><label style={LS}>Priority</label>
                      <select value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))} style={IS}>
                        {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
                      </select></div>
                    <div><label style={LS}>Assign To</label>
                      <select value={taskForm.assignee} onChange={e => setTaskForm(f => ({ ...f, assignee: e.target.value }))} style={IS}>
                        <option value="">Unassigned</option>
                        {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                      </select></div>
                    <div><label style={LS}>Due Date</label>
                      <input type="date" value={taskForm.due} onChange={e => setTaskForm(f => ({ ...f, due: e.target.value }))} style={IS} /></div>
                  </div>
                </>
              )}

              {mode === "expense" && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <label style={LS}>Description *</label>
                    <input ref={titleRef} autoFocus value={expForm.description}
                      onChange={e => setExpForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="e.g. Canva Pro subscription" style={{ ...IS, fontSize: 14, padding: "10px 13px" }} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div><label style={LS}>Amount (₹) *</label>
                      <input type="number" value={expForm.amount} onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" style={IS} /></div>
                    <div><label style={LS}>Date</label>
                      <input type="date" value={expForm.date} onChange={e => setExpForm(f => ({ ...f, date: e.target.value }))} style={IS} /></div>
                    <div><label style={LS}>Account</label>
                      <select value={expForm.account} onChange={e => setExpForm(f => ({ ...f, account: e.target.value }))} style={IS}>
                        {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
                      </select></div>
                    <div><label style={LS}>Category</label>
                      <select value={expForm.category} onChange={e => setExpForm(f => ({ ...f, category: e.target.value }))} style={IS}>
                        {EXPENSE_CATS.map(c => <option key={c}>{c}</option>)}
                      </select></div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={LS}>Client (optional)</label>
                    <select value={expForm.client} onChange={e => setExpForm(f => ({ ...f, client: e.target.value }))} style={IS}>
                      <option value="">None</option>
                      {clientList.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </>
              )}

              {mode === "note" && (
                <>
                  <div style={{ marginBottom: 10 }}>
                    <label style={LS}>Note *</label>
                    <textarea ref={titleRef as any} autoFocus value={noteText} onChange={e => setNoteText(e.target.value)}
                      rows={3} placeholder="Quick note, reminder, or observation…"
                      style={{ ...IS, resize: "none", lineHeight: 1.5 }} />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={LS}>Client (optional)</label>
                    <select value={noteClient} onChange={e => setNoteClient(e.target.value)} style={IS}>
                      <option value="">General</option>
                      {clientList.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </>
              )}

              {error && (
                <div style={{ fontSize: 12, color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "7px 10px", marginBottom: 10 }}>{error}</div>
              )}

              <button onClick={handleSave} disabled={saving}
                style={{ width: "100%", padding: "11px", borderRadius: 10, background: `linear-gradient(135deg,${activeMode.color},${activeMode.color}cc)`, color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                <i className={`ti ${activeMode.icon}`} /> {saving ? "Saving…" : `Add ${activeMode.label}`}
              </button>
              <div style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 8 }}>
                Enter to save · Esc to close · ⌘K to toggle
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
