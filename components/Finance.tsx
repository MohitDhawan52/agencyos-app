"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import { FINANCE_ACCOUNTS, DASTI_PEOPLE, accountColor, accountIcon, zeroBalances } from "@/lib/org";
import Invoices from "./Invoices";
import CompanySettings from "./CompanySettings";

// Accounts and "dasti" people are configured per workspace in Settings.
const ACCOUNTS = FINANCE_ACCOUNTS;
const ACCOUNT_COLORS = new Proxy({} as Record<string, string>, { get: (_t, k) => accountColor(String(k)) });
const ACCOUNT_ICONS = new Proxy({} as Record<string, string>, { get: (_t, k) => accountIcon(String(k)) });

const INCOME_CATEGORIES = ["Retainer", "Project", "Bonus", "Other"];
const EXPENSE_CATEGORIES = ["Salary", "Advance", "Tools & Software", "Ads Budget", "Office", "Travel", "Food", "Freelancer", "Other"];

const emptyTx = { type: "income", description: "", splits: [{ account: FINANCE_ACCOUNTS[0], amount: "" }], client: "", date: new Date().toISOString().split("T")[0], category: "" };

const emptyDasti = { type: "borrowed" as "borrowed" | "repaid", person: "", amount: "", description: "", date: new Date().toISOString().split("T")[0], account: FINANCE_ACCOUNTS[0] };

export default function Finance() {
  const [activeFin, setActiveFin] = useState<"transactions" | "dasti" | "recurring" | "invoices" | "retainer" | "settings">("transactions");

  // ── Retainer state ─────────────────────────
  const [retainers, setRetainers] = useState<any[]>([]);
  const [showRetainerModal, setShowRetainerModal] = useState(false);
  const [retainerEditId, setRetainerEditId] = useState<string | null>(null);
  const [retainerSaving, setRetainerSaving] = useState(false);
  const [retainerMonth, setRetainerMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [retainerForm, setRetainerForm] = useState({ client_name: "", hours_allocated: "", hours_used: "", monthly_amount: "", notes: "" });
  const [clientList, setClientList] = useState<string[]>([]);

  // ── Dasti state ───────────────────────────
  const [dastiTxs, setDastiTxs] = useState<any[]>([]);
  const [showDastiModal, setShowDastiModal] = useState(false);
  const [dastiEditingId, setDastiEditingId] = useState<string | null>(null);
  const [dastiDeleteConfirm, setDastiDeleteConfirm] = useState<string | null>(null);
  const [dastiForm, setDastiForm] = useState<any>(emptyDasti);
  const [dastiSaving, setDastiSaving] = useState(false);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>(zeroBalances);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [txType, setTxType] = useState<"income" | "expense">("income");
  const [form, setForm] = useState<any>(emptyTx);
  const [balanceForm, setBalanceForm] = useState<Record<string, string>>(() => Object.fromEntries(FINANCE_ACCOUNTS.map(a => [a, ""])));
  const [filterType, setFilterType] = useState("All");
  const [filterAccount, setFilterAccount] = useState("All");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [txMonth, setTxMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [showAllMonths, setShowAllMonths] = useState(false);

  // Internal transfer state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState<any>({ fromSplits: [{ account: FINANCE_ACCOUNTS[0], amount: "" }], toSplits: [{ account: FINANCE_ACCOUNTS[1] || FINANCE_ACCOUNTS[0], amount: "" }], description: "", date: new Date().toISOString().split("T")[0] });
  const [transferSaving, setTransferSaving] = useState(false);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteBulkConfirm, setDeleteBulkConfirm] = useState(false);
  const [deleteMonthConfirm, setDeleteMonthConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Team members for Advance sync
  const [members, setMembers] = useState<any[]>([]);
  // Advance-specific fields (not in transactions table)
  const [advanceMember, setAdvanceMember] = useState("");
  const [advanceMonth, setAdvanceMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Search + client filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClient, setFilterClient] = useState("All");

  // Petty cash quick entry
  const [showPettyCashModal, setShowPettyCashModal] = useState(false);
  const [pettyCashForm, setPettyCashForm] = useState({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });
  const [pettyCashSaving, setPettyCashSaving] = useState(false);

  // Recurring templates (localStorage — no DB migration needed)
  const [recurringTemplates, setRecurringTemplates] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem("mw_recurring") || "[]"); } catch { return []; }
  });
  const [showRecurringPanel, setShowRecurringPanel] = useState(false);
  const [recurringForm, setRecurringForm] = useState<any>({ description: "", amount: "", account: FINANCE_ACCOUNTS[0], category: "", type: "expense" });
  const [recurringEditId, setRecurringEditId] = useState<string | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [showChart, setShowChart] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  // Clear selection when month changes
  useEffect(() => { setSelectedIds(new Set()); }, [txMonth, showAllMonths]);

  useEffect(() => {
    const ch = supabase.channel("finance-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "balances" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "dasti_transactions" }, () => fetchAll())
      .subscribe();
    // Fallback poll every 2 min in case realtime WebSocket drops
    const poll = setInterval(() => fetchAll(), 2 * 60_000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: tx }, { data: bal }, { data: dasti }, { data: clients }, { data: mData }] = await Promise.all([
      supabase.from("transactions").select("*").order("date", { ascending: false }),
      supabase.from("balances").select("*"),
      supabase.from("dasti_transactions").select("*").order("date", { ascending: false }),
      supabase.from("clients").select("name").eq("status", "Active").order("name"),
      supabase.from("profiles").select("id,name,role").neq("status", "left").order("name"),
    ]);
    if (tx) setTransactions(tx);
    if (dasti) setDastiTxs(dasti);
    if (clients) setClientList(clients.map((c: any) => c.name));
    if (mData) setMembers(mData.filter((m: any) => m.role !== "admin"));
    if (bal) {
      const b: Record<string, number> = zeroBalances();
      bal.forEach((r: any) => { b[r.account] = r.amount; });
      setBalances(b);
    }
    setLoading(false);
  };

  const fetchRetainers = async (month: string) => {
    const { data } = await supabase.from("retainers").select("*").eq("month", month).order("client_name");
    if (data) setRetainers(data);
  };

  const saveRetainer = async () => {
    if (!retainerForm.client_name || !retainerForm.hours_allocated) return;
    setRetainerSaving(true);
    const payload = {
      client_name: retainerForm.client_name,
      month: retainerMonth,
      hours_allocated: Number(retainerForm.hours_allocated),
      hours_used: Number(retainerForm.hours_used) || 0,
      monthly_amount: Number(retainerForm.monthly_amount) || 0,
      notes: retainerForm.notes.trim() || null,
    };
    if (retainerEditId) {
      await supabase.from("retainers").update(payload).eq("id", retainerEditId);
    } else {
      await supabase.from("retainers").insert([payload]);
    }
    setRetainerSaving(false);
    setShowRetainerModal(false);
    setRetainerEditId(null);
    setRetainerForm({ client_name: "", hours_allocated: "", hours_used: "", monthly_amount: "", notes: "" });
    fetchRetainers(retainerMonth);
  };

  const logHours = async (id: string, current: number, add: number) => {
    await supabase.from("retainers").update({ hours_used: Math.max(0, current + add) }).eq("id", id);
    fetchRetainers(retainerMonth);
  };

  // ── Dasti helpers ─────────────────────────
  const dastiSummary = () => {
    const people = Array.from(new Set(dastiTxs.map(d => d.person))).sort();
    return people.map(person => {
      const borrowed = dastiTxs.filter(d => d.person === person && d.type === "borrowed").reduce((a, b) => a + Number(b.amount), 0);
      const repaid   = dastiTxs.filter(d => d.person === person && d.type === "repaid").reduce((a, b) => a + Number(b.amount), 0);
      return { person, borrowed, repaid, outstanding: borrowed - repaid };
    });
  };

  const totalOutstanding = dastiTxs.reduce((acc, d) => acc + (d.type === "borrowed" ? Number(d.amount) : -Number(d.amount)), 0);

  const openDastiAdd = (type: "borrowed" | "repaid") => {
    setDastiEditingId(null);
    setDastiForm({ ...emptyDasti, type, date: new Date().toISOString().split("T")[0] });
    setShowDastiModal(true);
  };

  const openDastiEdit = (d: any) => {
    setDastiEditingId(d.id);
    setDastiForm({ ...d, amount: String(d.amount) });
    setShowDastiModal(true);
  };

  const saveDasti = async () => {
    const amount = parseFloat(dastiForm.amount);
    if (!dastiForm.person || !amount || amount <= 0 || !dastiForm.account) return;
    setDastiSaving(true);
    const txType = dastiForm.type === "borrowed" ? "income" : "expense";
    const desc = `Dasti ${dastiForm.type === "borrowed" ? "from" : "to"} ${dastiForm.person.trim()}${dastiForm.description?.trim() ? " — " + dastiForm.description.trim() : ""}`;
    const payload = { type: dastiForm.type, person: dastiForm.person.trim(), amount, description: dastiForm.description?.trim() || null, date: dastiForm.date, account: dastiForm.account };

    if (dastiEditingId) {
      await supabase.from("dasti_transactions").update(payload).eq("id", dastiEditingId);
    } else {
      try {
        const { data: txData, error: txErr } = await supabase.from("transactions").insert([{
          type: txType, amount, description: desc, account: dastiForm.account,
          date: dastiForm.date, category: "Dasti", client: "",
        }]).select().single();
        if (txErr || !txData) throw new Error("Finance transaction failed");
        const newBal = txType === "income" ? balances[dastiForm.account] + amount : balances[dastiForm.account] - amount;
        const { error: balErr } = await supabase.from("balances").upsert([{ account: dastiForm.account, amount: newBal }], { onConflict: "org_id,account" });
        if (balErr) { await supabase.from("transactions").delete().eq("id", txData.id); throw new Error("Balance update failed"); }
        const { error: dErr } = await supabase.from("dasti_transactions").insert([{ ...payload, linked_tx_id: txData.id }]);
        if (dErr) { await supabase.from("transactions").delete().eq("id", txData.id); throw new Error("Dasti save failed"); }
      } catch (e: any) {
        setDastiSaving(false);
        alert("Save failed: " + (e?.message || "Please try again."));
        return;
      }
    }
    setDastiSaving(false);
    setShowDastiModal(false);
    fetchAll();
  };

  const deleteDasti = async (id: string) => {
    const entry = dastiTxs.find(d => d.id === id);
    if (entry?.linked_tx_id) {
      const tx = transactions.find(t => t.id === entry.linked_tx_id);
      if (tx) {
        const reversedBal = tx.type === "income" ? balances[tx.account] - tx.amount : balances[tx.account] + tx.amount;
        await supabase.from("balances").upsert([{ account: tx.account, amount: reversedBal }], { onConflict: "org_id,account" });
        await supabase.from("transactions").delete().eq("id", entry.linked_tx_id);
      }
    }
    await supabase.from("dasti_transactions").delete().eq("id", id);
    setDastiDeleteConfirm(null);
    fetchAll();
  };

  const totalBalance = Object.values(balances).reduce((a, b) => a + b, 0);
  const totalIncome = transactions.filter(t => t.type === "income").reduce((a, b) => a + b.amount, 0);
  const totalExpense = transactions.filter(t => t.type === "expense").reduce((a, b) => a + b.amount, 0);

  // Monthly helpers
  const txMonthStr = `${txMonth.year}-${String(txMonth.month + 1).padStart(2, "0")}`;
  const txMonthName = new Date(txMonth.year, txMonth.month, 1).toLocaleString("default", { month: "long", year: "numeric" });
  const prevTxMonth = () => setTxMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  const nextTxMonth = () => setTxMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
  const monthlyTx = transactions.filter(t => t.date?.startsWith(txMonthStr));
  const monthlyIncome = monthlyTx.filter(t => t.type === "income").reduce((a, b) => a + b.amount, 0);
  const monthlyExpense = monthlyTx.filter(t => t.type === "expense").reduce((a, b) => a + b.amount, 0);
  const monthlyNet = monthlyIncome - monthlyExpense;

  // Last month comparison
  const lastMonthDate = txMonth.month === 0 ? { year: txMonth.year - 1, month: 11 } : { year: txMonth.year, month: txMonth.month - 1 };
  const lastMonthStr = `${lastMonthDate.year}-${String(lastMonthDate.month + 1).padStart(2, "0")}`;
  const lastMonthTx = transactions.filter(t => t.date?.startsWith(lastMonthStr));
  const lastMonthIncome = lastMonthTx.filter(t => t.type === "income").reduce((a, b) => a + b.amount, 0);
  const lastMonthExpense = lastMonthTx.filter(t => t.type === "expense").reduce((a, b) => a + b.amount, 0);

  const allClients = Array.from(new Set(transactions.filter(t => t.client && !t.client.startsWith("__transfer__:")).map(t => t.client))).sort();

  const filtered = (showAllMonths ? transactions : monthlyTx)
    .filter(t => filterType === "All" || t.type === filterType.toLowerCase())
    .filter(t => filterAccount === "All" || t.account === filterAccount)
    .filter(t => filterClient === "All" || t.client === filterClient)
    .filter(t => !searchQuery || t.description?.toLowerCase().includes(searchQuery.toLowerCase()) || t.client?.toLowerCase().includes(searchQuery.toLowerCase()));

  // ── Selection helpers ──────────────────────
  const allChecked = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));
  const someChecked = filtered.some(t => selectedIds.has(t.id));

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allChecked) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)));
    }
  };

  // ── Balance reversal helper ────────────────
  const computeBalanceUpdates = (txList: any[]) => {
    const changes: Record<string, number> = {};
    txList.forEach(tx => {
      const delta = tx.type === "income" ? -tx.amount : tx.amount;
      changes[tx.account] = (changes[tx.account] || 0) + delta;
    });
    return Object.entries(changes).map(([account, delta]) => ({
      account,
      amount: (balances[account] || 0) + delta,
    }));
  };

  // ── Bulk delete selected ───────────────────
  const deleteSelected = async () => {
    setBulkDeleting(true);
    const toDelete = transactions.filter(t => selectedIds.has(t.id));
    const balUpdates = computeBalanceUpdates(toDelete);
    if (balUpdates.length > 0) {
      await supabase.from("balances").upsert(balUpdates, { onConflict: "org_id,account" });
    }
    await supabase.from("transactions").delete().in("id", [...selectedIds]);
    setSelectedIds(new Set());
    setDeleteBulkConfirm(false);
    setBulkDeleting(false);
    fetchAll();
  };

  // ── Delete whole month ─────────────────────
  const deleteMonth = async () => {
    setBulkDeleting(true);
    const toDelete = monthlyTx;
    const balUpdates = computeBalanceUpdates(toDelete);
    if (balUpdates.length > 0) {
      await supabase.from("balances").upsert(balUpdates, { onConflict: "org_id,account" });
    }
    const ids = toDelete.map(t => t.id);
    if (ids.length > 0) {
      await supabase.from("transactions").delete().in("id", ids);
    }
    setSelectedIds(new Set());
    setDeleteMonthConfirm(false);
    setBulkDeleting(false);
    fetchAll();
  };

  const openAdd = (type: "income" | "expense") => {
    setEditingId(null);
    setTxType(type);
    setForm({ ...emptyTx, type, date: new Date().toISOString().split("T")[0] });
    setAdvanceMember(members[0]?.name || "");
    setAdvanceMonth(new Date().toISOString().slice(0, 7));
    setShowModal(true);
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setTxType(t.type);
    setForm({ ...t, splits: [{ account: t.account, amount: String(t.amount) }] });
    setShowModal(true);
  };

  const saveTx = async () => {
    const splits: Array<{ account: string; amount: string }> = form.splits || [];
    const validSplits = splits.filter(s => s.account && parseFloat(s.amount) > 0);
    if (!form.description || validSplits.length === 0) return;
    const totalAmount = validSplits.reduce((s, sp) => s + parseFloat(sp.amount), 0);

    if (editingId) {
      // Edit always works on the primary split (single-account)
      const primarySplit = validSplits[0];
      const amount = parseFloat(primarySplit.amount);
      const account = primarySplit.account;
      const old = transactions.find(t => t.id === editingId);
      if (old) {
        const reversedBal = old.type === "income"
          ? balances[old.account] - old.amount
          : balances[old.account] + old.amount;
        await supabase.from("balances").upsert([{ account: old.account, amount: reversedBal }], { onConflict: "org_id,account" });
      }
      await supabase.from("transactions").update({
        type: txType, amount, description: form.description, account, client: form.client || "", date: form.date, category: form.category,
      }).eq("id", editingId);
      const updatedBalances = { ...balances };
      if (old) {
        updatedBalances[old.account] = old.type === "income"
          ? updatedBalances[old.account] - old.amount
          : updatedBalances[old.account] + old.amount;
      }
      const newBal = txType === "income" ? updatedBalances[account] + amount : updatedBalances[account] - amount;
      await supabase.from("balances").upsert([{ account, amount: newBal }], { onConflict: "org_id,account" });
    } else {
      // Compute all balance changes at once to avoid stale reads in multi-split
      const balChanges: Record<string, number> = {};
      let firstTx: any = null;
      for (const sp of validSplits) {
        const amount = parseFloat(sp.amount);
        const account = sp.account;
        const { data: newTx } = await supabase.from("transactions").insert([{
          type: txType, amount, description: form.description,
          account, client: form.client || "", date: form.date, category: form.category,
        }]).select().single();
        if (!firstTx) firstTx = newTx;
        balChanges[account] = (balChanges[account] || 0) + (txType === "income" ? amount : -amount);
      }
      // Apply all balance deltas
      const balUpdates = Object.entries(balChanges).map(([account, delta]) => ({
        account, amount: (balances[account] || 0) + delta,
      }));
      await supabase.from("balances").upsert(balUpdates, { onConflict: "org_id,account" });

      // Advance → HR payout (linked to first transaction)
      if (form.category === "Advance" && advanceMember && advanceMonth && firstTx) {
        const selectedMember = members.find((m: any) => m.name === advanceMember);
        const accountsList = validSplits.map(s => `${s.account} ₹${parseFloat(s.amount).toLocaleString("en-IN")}`).join(", ");
        const { data: newPayout } = await supabase.from("payouts").insert([{
          member_id: selectedMember?.id || null,
          member_name: advanceMember,
          amount: totalAmount,
          payout_type: "Advance",
          month: advanceMonth,
          date: form.date,
          notes: `Advance via Finance — ${accountsList}`,
        }]).select().single();
        if (newPayout) {
          await supabase.from("transactions").update({ linked_payout_id: newPayout.id, hr_source: true }).eq("id", firstTx.id);
        }
      }
    }

    setShowModal(false);
    setAdvanceMember("");
    setAdvanceMonth(new Date().toISOString().slice(0, 7));
    fetchAll();
  };

  const deleteTx = async (id: string) => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) { setDeleteConfirm(null); return; }

    // If it's a transfer, delete ALL legs (multi-split aware) and reverse all balances
    if (tx.client?.startsWith("__transfer__:")) {
      const allLegs = transactions.filter(t => t.client === tx.client);
      const balChanges: Record<string, number> = {};
      for (const leg of allLegs) {
        const delta = leg.type === "income" ? -leg.amount : leg.amount;
        balChanges[leg.account] = (balChanges[leg.account] || 0) + delta;
      }
      const balUpdates = Object.entries(balChanges).map(([account, delta]) => ({ account, amount: (balances[account] || 0) + delta }));
      await supabase.from("balances").upsert(balUpdates, { onConflict: "org_id,account" });
      await supabase.from("transactions").delete().in("id", allLegs.map(l => l.id));
      setDeleteConfirm(null);
      fetchAll();
      return;
    }

    const newBal = tx.type === "income"
      ? balances[tx.account] - tx.amount
      : balances[tx.account] + tx.amount;
    await supabase.from("balances").upsert([{ account: tx.account, amount: newBal }], { onConflict: "org_id,account" });
    await supabase.from("transactions").delete().eq("id", id);
    setDeleteConfirm(null);
    fetchAll();
  };

  const saveTransfer = async () => {
    const fromSplits: Array<{ account: string; amount: string }> = transferForm.fromSplits || [];
    const toSplits:   Array<{ account: string; amount: string }> = transferForm.toSplits   || [];
    const validFrom = fromSplits.filter(s => s.account && parseFloat(s.amount) > 0);
    const validTo   = toSplits.filter(s => s.account && parseFloat(s.amount) > 0);
    if (validFrom.length === 0 || validTo.length === 0) return;
    const totalFrom = validFrom.reduce((s, sp) => s + parseFloat(sp.amount), 0);
    const totalTo   = validTo.reduce((s, sp) => s + parseFloat(sp.amount), 0);
    if (Math.abs(totalFrom - totalTo) > 0.01) return; // totals must match
    setTransferSaving(true);
    const ref = crypto.randomUUID();
    const tag = `__transfer__:${ref}`;
    const fromLabel = validFrom.map(s => s.account).join(" + ");
    const toLabel   = validTo.map(s => s.account).join(" + ");
    const note = transferForm.description?.trim() ? ` — ${transferForm.description.trim()}` : "";
    const desc = `Transfer: ${fromLabel} → ${toLabel}${note}`;
    try {
      const inserts = [
        ...validFrom.map(sp => ({ type: "expense", amount: parseFloat(sp.amount), description: desc, account: sp.account, date: transferForm.date, category: "Transfer", client: tag })),
        ...validTo.map(sp =>   ({ type: "income",  amount: parseFloat(sp.amount), description: desc, account: sp.account, date: transferForm.date, category: "Transfer", client: tag })),
      ];
      const { error } = await supabase.from("transactions").insert(inserts);
      if (error) throw error;
      // Compute balance deltas
      const balChanges: Record<string, number> = {};
      for (const sp of validFrom) balChanges[sp.account] = (balChanges[sp.account] || 0) - parseFloat(sp.amount);
      for (const sp of validTo)   balChanges[sp.account] = (balChanges[sp.account] || 0) + parseFloat(sp.amount);
      const balUpdates = Object.entries(balChanges).map(([account, delta]) => ({ account, amount: (balances[account] || 0) + delta }));
      await supabase.from("balances").upsert(balUpdates, { onConflict: "org_id,account" });
      setShowTransferModal(false);
      setTransferForm({ fromSplits: [{ account: "Current Account", amount: "" }], toSplits: [{ account: "Cash in Hand", amount: "" }], description: "", date: new Date().toISOString().split("T")[0] });
      fetchAll();
    } catch (e: any) {
      alert("Transfer failed: " + (e?.message || "Please try again."));
    } finally {
      setTransferSaving(false);
    }
  };

  // ── Petty Cash ────────────────────────────
  const savePettyCash = async () => {
    const amount = parseFloat(pettyCashForm.amount);
    if (!pettyCashForm.description || isNaN(amount) || amount <= 0) return;
    setPettyCashSaving(true);
    try {
      await supabase.from("transactions").insert([{
        type: "expense", amount, description: pettyCashForm.description.trim(),
        account: "Cash in Hand", date: pettyCashForm.date, category: "Petty Cash", client: "",
      }]);
      await supabase.from("balances").upsert([{ account: "Cash in Hand", amount: balances["Cash in Hand"] - amount }], { onConflict: "org_id,account" });
      setShowPettyCashModal(false);
      setPettyCashForm({ amount: "", description: "", date: new Date().toISOString().split("T")[0] });
      fetchAll();
    } catch (e: any) {
      alert("Failed: " + (e?.message || "Try again"));
    } finally { setPettyCashSaving(false); }
  };

  // ── Recurring Templates (localStorage) ────
  const saveRecurring = () => {
    const amount = parseFloat(recurringForm.amount);
    if (!recurringForm.description || isNaN(amount) || amount <= 0) return;
    let templates: any[];
    if (recurringEditId) {
      templates = recurringTemplates.map(r => r.id === recurringEditId ? { ...r, ...recurringForm, amount } : r);
    } else {
      templates = [...recurringTemplates, { ...recurringForm, amount, id: crypto.randomUUID() }];
    }
    localStorage.setItem("mw_recurring", JSON.stringify(templates));
    setRecurringTemplates(templates);
    setRecurringEditId(null);
    setRecurringForm({ description: "", amount: "", account: "Current Account", category: "", type: "expense" });
  };

  const deleteRecurring = (id: string) => {
    const templates = recurringTemplates.filter(r => r.id !== id);
    localStorage.setItem("mw_recurring", JSON.stringify(templates));
    setRecurringTemplates(templates);
  };

  const postRecurring = async (r: any) => {
    setPostingId(r.id);
    try {
      const today = new Date().toISOString().split("T")[0];
      await supabase.from("transactions").insert([{
        type: r.type, amount: r.amount, description: r.description,
        account: r.account, date: today, category: r.category, client: "",
      }]);
      const newBal = r.type === "income" ? balances[r.account] + r.amount : balances[r.account] - r.amount;
      await supabase.from("balances").upsert([{ account: r.account, amount: newBal }], { onConflict: "org_id,account" });
      fetchAll();
    } catch (e: any) {
      alert("Post failed: " + (e?.message || "Try again"));
    } finally { setPostingId(null); }
  };

  // ── Duplicate transaction ──────────────────
  const duplicateTx = (t: any) => {
    setEditingId(null);
    setTxType(t.type);
    setForm({ ...t, id: undefined, amount: String(t.amount), date: new Date().toISOString().split("T")[0] });
    setShowModal(true);
  };

  // ── Export CSV ────────────────────────────
  const exportCSV = () => {
    const rows = [["Date", "Type", "Description", "Category", "Account", "Client", "Amount"]];
    filtered.forEach(t => {
      rows.push([t.date, t.type, `"${(t.description || "").replace(/"/g, '""')}"`, t.category || "", t.account, t.client || "", t.amount]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `finance-${txMonthName.replace(" ", "-")}.csv`;
    a.click();
  };

  // ── Expense chart data ────────────────────
  const chartData = (() => {
    const expTx = monthlyTx.filter(t => t.type === "expense" && !t.client?.startsWith("__transfer__:"));
    const totals: Record<string, number> = {};
    expTx.forEach(t => { totals[t.category || "Other"] = (totals[t.category || "Other"] || 0) + t.amount; });
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    const CHART_COLORS = ["#f87171","#fb923c","#fbbf24","#a3e635","#34d399","#22d3ee","#60a5fa","#a78bfa","#f472b6","#94a3b8"];
    return { slices: Object.entries(totals).sort((a,b) => b[1]-a[1]).map(([cat, val], i) => ({ cat, val, pct: total ? val/total : 0, color: CHART_COLORS[i % CHART_COLORS.length] })), total };
  })();

  const saveBalances = async () => {
    const updates = ACCOUNTS.map(acc => ({
      account: acc,
      amount: parseFloat(balanceForm[acc]) || 0
    }));
    await supabase.from("balances").upsert(updates, { onConflict: "org_id,account" });
    setShowBalanceModal(false);
    fetchAll();
  };

  const openBalanceModal = () => {
    setBalanceForm(Object.fromEntries(FINANCE_ACCOUNTS.map(a => [a, String(balances[a] || 0)])));
    setShowBalanceModal(true);
  };

  const IS = {
    width: "100%",
    background: "#1a1a27",
    border: "1px solid var(--border2)",
    borderRadius: 10,
    padding: "10px 14px",
    color: "#ffffff",
    fontFamily: "inherit",
    fontSize: 14,
    outline: "none",
  };
  const LS = { fontSize: 11, fontWeight: 600 as const, color: "var(--text3)", display: "block" as const, marginBottom: 7, textTransform: "uppercase" as const, letterSpacing: ".6px" };

  const cbStyle: React.CSSProperties = {
    width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--border2)",
    cursor: "pointer", accentColor: "var(--accent)", flexShrink: 0,
  };

  return (
    <div className="page-wrap">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Finance</div>
          <div style={{ fontSize: 14, color: "var(--text2)", marginTop: 4 }}>Track payments, expenses and balances</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {activeFin === "transactions" ? (
            <>
              <button onClick={exportCSV} style={{ padding: "10px 18px", fontSize: 14, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text3)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                <i className="ti ti-download" /> Export CSV
              </button>
              <button onClick={() => { setPettyCashForm({ amount: "", description: "", date: new Date().toISOString().split("T")[0] }); setShowPettyCashModal(true); }} style={{ padding: "10px 18px", fontSize: 14, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text2)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                <i className="ti ti-cash" /> Petty Cash
              </button>
              <button onClick={openBalanceModal} style={{ padding: "10px 18px", fontSize: 14, background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text2)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                <i className="ti ti-wallet" /> Update Balances
              </button>
              <button onClick={() => setShowTransferModal(true)} style={{ padding: "10px 18px", fontSize: 14, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 10, color: "#fbbf24", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                <i className="ti ti-arrows-exchange" /> Transfer
              </button>
              <button onClick={() => openAdd("expense")} style={{ padding: "10px 18px", fontSize: 14, background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, color: "var(--red)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                <i className="ti ti-minus" /> Add Expense
              </button>
              <button onClick={() => openAdd("income")} className="btn-primary" style={{ padding: "10px 18px", fontSize: 14 }}>
                <i className="ti ti-plus" /> Add Income
              </button>
            </>
          ) : (
            <>
              <button onClick={() => openDastiAdd("repaid")} style={{ padding: "10px 18px", fontSize: 14, background: "var(--green-bg)", border: "1px solid var(--green-border)", borderRadius: 10, color: "var(--green)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                <i className="ti ti-arrow-back-up" /> Repayment Made
              </button>
              <button onClick={() => openDastiAdd("borrowed")} style={{ padding: "10px 18px", fontSize: 14, background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, color: "var(--red)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
                <i className="ti ti-hand-money" /> Add Borrowing
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.03)", padding: 5, borderRadius: 12, border: "1px solid var(--border)", marginBottom: 24, width: "fit-content" }}>
        {([["transactions", "ti-report-money", "Transactions"], ["invoices", "ti-file-invoice", "Invoices"], ["retainer", "ti-clock-hour-4", "Retainer"], ["recurring", "ti-refresh", "Recurring"], ["dasti", "ti-hand-money", "Dasti Account"], ["settings", "ti-settings", "Settings"]] as const).map(([key, icon, label]) => (
          <button key={key} onClick={() => { setActiveFin(key); if (key === "retainer") fetchRetainers(retainerMonth); }} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", background: activeFin === key ? "rgba(255,255,255,0.08)" : "transparent", color: activeFin === key ? "var(--text)" : "var(--text3)" }}>
            <i className={`ti ${icon}`} style={{ fontSize: 15 }} /> {label}
            {key === "dasti" && totalOutstanding > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, background: "rgba(248,113,113,0.2)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 20, padding: "1px 7px" }}>₹{totalOutstanding.toLocaleString("en-IN")}</span>
            )}
          </button>
        ))}
      </div>

      {activeFin === "settings" ? (
        <CompanySettings />
      ) : activeFin === "invoices" ? (
        <Invoices balances={balances} onPaymentRecorded={fetchAll} />
      ) : activeFin === "retainer" ? (
        /* ══════════════════ RETAINER TRACKER ══════════════════ */
        <div>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Retainer Hours Tracker</div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{retainers.length} client{retainers.length !== 1 ? "s" : ""} tracked · {retainerMonth}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="month" value={retainerMonth} onChange={e => { setRetainerMonth(e.target.value); fetchRetainers(e.target.value); }}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text)", fontSize: 13, outline: "none" }} />
              <button onClick={() => { setRetainerEditId(null); setRetainerForm({ client_name: "", hours_allocated: "", hours_used: "", monthly_amount: "", notes: "" }); setShowRetainerModal(true); }}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10, background: "var(--accent)", border: "none", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                <i className="ti ti-plus" /> Add Client
              </button>
            </div>
          </div>

          {retainers.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text3)" }}>
              <i className="ti ti-clock-hour-4" style={{ fontSize: 44, opacity: .15 }} />
              <div style={{ marginTop: 14, fontSize: 15, fontWeight: 600 }}>No retainers for {retainerMonth}</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Add a client to start tracking hours.</div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {retainers.map(r => {
                const pct = r.hours_allocated > 0 ? Math.min(100, (r.hours_used / r.hours_allocated) * 100) : 0;
                const status = pct >= 100 ? { label: "Overused", color: "#f87171", bg: "rgba(248,113,113,0.12)" }
                  : pct >= 80 ? { label: "At Risk", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" }
                  : { label: "On Track", color: "#4ade80", bg: "rgba(74,222,128,0.12)" };
                return (
                  <div key={r.id} className="crm-card" style={{ padding: 20 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{r.client_name}</div>
                        {r.monthly_amount > 0 && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>₹{r.monthly_amount.toLocaleString("en-IN")}/mo</div>}
                      </div>
                      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: status.bg, color: status.color }}>{status.label}</span>
                        <button onClick={() => { setRetainerEditId(r.id); setRetainerForm({ client_name: r.client_name, hours_allocated: String(r.hours_allocated), hours_used: String(r.hours_used), monthly_amount: String(r.monthly_amount || ""), notes: r.notes || "" }); setShowRetainerModal(true); }}
                          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 7, padding: "4px 7px", color: "var(--text3)", cursor: "pointer", fontSize: 12 }}><i className="ti ti-pencil" /></button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text3)", marginBottom: 6 }}>
                        <span>{r.hours_used}h used</span>
                        <span>{r.hours_allocated}h allocated</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 100, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, borderRadius: 100, background: status.color, transition: "width .4s" }} />
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 5, textAlign: "right" }}>
                        {r.hours_allocated - r.hours_used > 0 ? `${r.hours_allocated - r.hours_used}h remaining` : `${r.hours_used - r.hours_allocated}h over`}
                      </div>
                    </div>

                    {/* Quick log hours */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {[0.5, 1, 2].map(h => (
                        <button key={h} onClick={() => logHours(r.id, r.hours_used, h)}
                          style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.03)", color: "var(--text2)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                          +{h}h
                        </button>
                      ))}
                      <button onClick={() => logHours(r.id, r.hours_used, -1)} disabled={r.hours_used <= 0}
                        style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: "1px solid var(--border2)", background: "rgba(255,255,255,0.03)", color: r.hours_used > 0 ? "#f87171" : "var(--border2)", cursor: r.hours_used > 0 ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                        -1h
                      </button>
                    </div>
                    {r.notes && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 10, fontStyle: "italic" }}>{r.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add/Edit Modal */}
          {showRetainerModal && (
            <div onClick={() => setShowRetainerModal(false)} className="crm-modal-bg">
              <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 420 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)" }}>{retainerEditId ? "Edit Retainer" : "Add Retainer"}</div>
                  <button onClick={() => setShowRetainerModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "5px 9px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
                </div>
                {[
                  ["Client", "client_name", "select"],
                  ["Hours Allocated / month", "hours_allocated", "number"],
                  ["Hours Used (so far)", "hours_used", "number"],
                  ["Monthly Amount (₹)", "monthly_amount", "number"],
                  ["Notes", "notes", "text"],
                ].map(([label, key, type]) => (
                  <div key={key as string} style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</label>
                    {type === "select" ? (
                      <select value={retainerForm[key as keyof typeof retainerForm]} onChange={e => setRetainerForm(f => ({ ...f, [key as string]: e.target.value }))}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text)", fontSize: 13, outline: "none" }}>
                        <option value="">Select client…</option>
                        {clientList.map(c => <option key={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input type={type} value={retainerForm[key as keyof typeof retainerForm]} onChange={e => setRetainerForm(f => ({ ...f, [key as string]: e.target.value }))}
                        placeholder={label as string}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    )}
                  </div>
                ))}
                <button onClick={saveRetainer} disabled={retainerSaving || !retainerForm.client_name || !retainerForm.hours_allocated}
                  style={{ width: "100%", padding: 11, borderRadius: 10, background: "var(--accent)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: retainerSaving ? 0.6 : 1, fontFamily: "inherit" }}>
                  {retainerSaving ? "Saving…" : retainerEditId ? "Save Changes" : "Add Retainer"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : activeFin === "recurring" ? (
        /* ══════════════════ RECURRING ══════════════════ */
        <div>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
            {/* Add/Edit form */}
            <div className="crm-card" style={{ padding: 24, width: 340, flexShrink: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>{recurringEditId ? "Edit Template" : "New Recurring"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={LS}>Type</label>
                  <div style={{ display: "flex", gap: 6, background: "rgba(255,255,255,0.04)", padding: 4, borderRadius: 10 }}>
                    {(["expense","income"] as const).map(t => (
                      <button key={t} onClick={() => setRecurringForm((f: any) => ({ ...f, type: t }))} style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: recurringForm.type === t ? (t === "expense" ? "rgba(248,113,113,0.2)" : "rgba(74,222,128,0.2)") : "transparent", color: recurringForm.type === t ? (t === "expense" ? "#f87171" : "#4ade80") : "var(--text3)", fontFamily: "inherit" }}>
                        {t === "expense" ? "➖ Expense" : "➕ Income"}
                      </button>
                    ))}
                  </div>
                </div>
                <div><label style={LS}>Description *</label><input value={recurringForm.description} onChange={e => setRecurringForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="e.g. Canva Pro, Office Rent…" style={IS} /></div>
                <div><label style={LS}>Amount (₹) *</label><input value={recurringForm.amount} onChange={e => setRecurringForm((f: any) => ({ ...f, amount: e.target.value }))} placeholder="0" type="number" style={IS} /></div>
                <div><label style={LS}>Account</label>
                  <select value={recurringForm.account} onChange={e => setRecurringForm((f: any) => ({ ...f, account: e.target.value }))} style={IS}>
                    {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
                  </select>
                </div>
                <div><label style={LS}>Category</label>
                  <select value={recurringForm.category} onChange={e => setRecurringForm((f: any) => ({ ...f, category: e.target.value }))} style={IS}>
                    <option value="">Select…</option>
                    {(recurringForm.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                {recurringEditId && <button onClick={() => { setRecurringEditId(null); setRecurringForm({ description: "", amount: "", account: "Current Account", category: "", type: "expense" }); }} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11 }}>Cancel</button>}
                <button onClick={saveRecurring} disabled={!recurringForm.description || !recurringForm.amount} className="btn-primary" style={{ flex: 2, justifyContent: "center", padding: 11, opacity: (!recurringForm.description || !recurringForm.amount) ? .5 : 1, cursor: (!recurringForm.description || !recurringForm.amount) ? "not-allowed" : "pointer" }}>
                  {recurringEditId ? "Save Changes" : "Add Template"}
                </button>
              </div>
            </div>

            {/* Templates list */}
            <div style={{ flex: 1, minWidth: 280 }}>
              {recurringTemplates.length === 0 ? (
                <div className="crm-card" style={{ padding: 48, textAlign: "center" }}>
                  <i className="ti ti-refresh" style={{ fontSize: 40, color: "var(--text3)", opacity: .3 }} />
                  <div style={{ marginTop: 12, fontSize: 15, color: "var(--text3)" }}>No recurring templates yet</div>
                  <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 6 }}>Add your fixed monthly costs on the left</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {recurringTemplates.map(r => (
                    <div key={r.id} className="crm-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 11, background: r.type === "expense" ? "rgba(248,113,113,0.12)" : "rgba(74,222,128,0.12)", border: `1px solid ${r.type === "expense" ? "rgba(248,113,113,0.25)" : "rgba(74,222,128,0.25)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <i className={`ti ${r.type === "expense" ? "ti-trending-down" : "ti-trending-up"}`} style={{ color: r.type === "expense" ? "#f87171" : "#4ade80", fontSize: 18 }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{r.description}</div>
                        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{r.account} · {r.category || "No category"}</div>
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: r.type === "expense" ? "#f87171" : "#4ade80", marginRight: 8 }}>
                        {r.type === "expense" ? "-" : "+"}₹{Number(r.amount).toLocaleString("en-IN")}
                      </div>
                      <button onClick={() => postRecurring(r)} disabled={postingId === r.id} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid rgba(99,102,241,0.4)", background: "rgba(99,102,241,0.1)", color: "#818cf8", cursor: postingId === r.id ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", opacity: postingId === r.id ? .6 : 1 }}>
                        {postingId === r.id ? "Posting…" : "Post Now"}
                      </button>
                      <button onClick={() => { setRecurringEditId(r.id); setRecurringForm({ ...r, amount: String(r.amount) }); }} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "7px 10px", color: "var(--blue)", cursor: "pointer", fontSize: 14 }}><i className="ti ti-pencil" /></button>
                      <button onClick={() => deleteRecurring(r.id)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "7px 10px", color: "var(--red)", cursor: "pointer", fontSize: 14 }}><i className="ti ti-trash" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeFin === "dasti" ? (
        /* ══════════════════ DASTI ACCOUNT ══════════════════ */
        <div>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
            <div className="stat-card" style={{ padding: "20px 22px", gridColumn: dastiSummary().length === 0 ? "1/-1" : undefined }}>
              <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".6px" }}>Total Outstanding</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: totalOutstanding > 0 ? "#f87171" : "var(--green)", letterSpacing: "-0.8px" }}>₹{Math.abs(totalOutstanding).toLocaleString("en-IN")}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>{totalOutstanding > 0 ? "Still owe" : totalOutstanding < 0 ? "Over-repaid" : "All settled"}</div>
            </div>
            {dastiSummary().map(({ person, borrowed, repaid, outstanding }) => (
              <div key={person} className="stat-card" style={{ padding: "20px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#a78bfa" }}>{person[0]}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{person}</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: outstanding > 0 ? "#f87171" : "var(--green)", letterSpacing: "-0.5px" }}>₹{Math.abs(outstanding).toLocaleString("en-IN")}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>{outstanding > 0 ? "outstanding" : outstanding < 0 ? "over-repaid" : "settled"}</div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 11, color: "#f87171" }}>Borrowed ₹{borrowed.toLocaleString("en-IN")}</span>
                  <span style={{ fontSize: 11, color: "#4ade80" }}>Repaid ₹{repaid.toLocaleString("en-IN")}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Dasti ledger table */}
          <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", background: "rgba(255,255,255,0.01)" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>Dasti Ledger</div>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>{dastiTxs.length} entries</div>
            </div>
            <div className="table-scroll">
              <table className="crm-table" style={{ width: "100%", minWidth: 600 }}>
                <thead>
                  <tr>{["Date", "Person", "Type", "Account", "Description", "Amount", "Actions"].map((h, i) => <th key={i}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {dastiTxs.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontSize: 13, color: "var(--text3)" }}>{new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(167,139,250,0.15)", border: "1px solid rgba(167,139,250,0.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#a78bfa" }}>{d.person[0]}</div>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{d.person}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: d.type === "borrowed" ? "rgba(248,113,113,0.12)" : "rgba(74,222,128,0.12)", color: d.type === "borrowed" ? "#f87171" : "#4ade80", border: `1px solid ${d.type === "borrowed" ? "rgba(248,113,113,0.25)" : "rgba(74,222,128,0.25)"}` }}>
                          {d.type === "borrowed" ? "↓ Borrowed" : "↑ Repaid"}
                        </span>
                      </td>
                      <td>
                        {d.account ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <i className={`ti ${ACCOUNT_ICONS[d.account] || "ti-wallet"}`} style={{ color: ACCOUNT_COLORS[d.account] || "var(--text3)", fontSize: 13 }} />
                            <span style={{ fontSize: 12, color: "var(--text2)" }}>{d.account}</span>
                          </div>
                        ) : <span style={{ fontSize: 12, color: "var(--text3)" }}>—</span>}
                      </td>
                      <td style={{ fontSize: 13, color: "var(--text2)" }}>{d.description || "—"}</td>
                      <td style={{ fontWeight: 700, fontSize: 15, color: d.type === "borrowed" ? "#f87171" : "#4ade80" }}>
                        {d.type === "borrowed" ? "-" : "+"}₹{Number(d.amount).toLocaleString("en-IN")}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => openDastiEdit(d)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--blue)", cursor: "pointer", fontSize: 14 }}><i className="ti ti-pencil" /></button>
                          <button onClick={() => setDastiDeleteConfirm(d.id)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--red)", cursor: "pointer", fontSize: 14 }}><i className="ti ti-trash" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {dastiTxs.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
                <i className="ti ti-hand-money" style={{ fontSize: 40, opacity: .2 }} />
                <div style={{ marginTop: 12, fontSize: 15 }}>No dasti entries yet</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Add a borrowing to get started</div>
              </div>
            )}
          </div>
        </div>
      ) : (

      /* ══════════════════ TRANSACTIONS ══════════════════ */
      <div>

      {/* Balance Cards */}
      <div className="stat-grid-5">
        <div className="stat-card" style={{ padding: "20px 22px" }}>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".6px" }}>Total Balance</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.8px" }}>₹{totalBalance.toLocaleString("en-IN")}</div>
          <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 6 }}>All accounts</div>
        </div>
        {ACCOUNTS.map(acc => (
          <div key={acc} className="stat-card" style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <i className={`ti ${ACCOUNT_ICONS[acc]}`} style={{ color: ACCOUNT_COLORS[acc], fontSize: 16 }} />
              <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".6px" }}>{acc}</div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: ACCOUNT_COLORS[acc], letterSpacing: "-0.6px" }}>₹{(balances[acc] || 0).toLocaleString("en-IN")}</div>
          </div>
        ))}
        <div className="stat-card" onClick={() => setActiveFin("dasti")} style={{ padding: "20px 22px", cursor: "pointer", borderColor: totalOutstanding > 0 ? "rgba(248,113,113,0.3)" : undefined }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <i className="ti ti-hand-money" style={{ color: "#f59e0b", fontSize: 16 }} />
            <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".6px" }}>Dasti</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: totalOutstanding > 0 ? "#f87171" : totalOutstanding < 0 ? "#4ade80" : "var(--text3)", letterSpacing: "-0.6px" }}>₹{Math.abs(totalOutstanding).toLocaleString("en-IN")}</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>{totalOutstanding > 0 ? "outstanding" : totalOutstanding < 0 ? "over-repaid" : "settled"}</div>
        </div>
      </div>

      {/* Monthly Summary with navigation */}
      <div className="crm-card" style={{ padding: "20px 24px", marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button onClick={prevTxMonth} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-chevron-left" style={{ fontSize: 14 }} />
            </button>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", minWidth: 180, textAlign: "center" }}>{txMonthName}</div>
            <button onClick={nextTxMonth} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-chevron-right" style={{ fontSize: 14 }} />
            </button>
            <button onClick={() => setTxMonth({ year: new Date().getFullYear(), month: new Date().getMonth() })} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text2)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              This Month
            </button>
            {/* Delete whole month */}
            {!showAllMonths && monthlyTx.length > 0 && (
              <button
                onClick={() => setDeleteMonthConfirm(true)}
                style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--red-border)", background: "var(--red-bg)", color: "var(--red)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}
              >
                <i className="ti ti-trash" style={{ fontSize: 13 }} /> Delete {txMonthName}
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--text3)" }}>Show all time</span>
            <div onClick={() => setShowAllMonths(v => !v)} style={{ width: 40, height: 22, borderRadius: 11, background: showAllMonths ? "var(--accent)" : "var(--border2)", cursor: "pointer", position: "relative", transition: "background .2s" }}>
              <div style={{ position: "absolute", top: 3, left: showAllMonths ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
            </div>
          </div>
        </div>
        <div className="stat-grid-3" style={{ marginBottom: 0 }}>
          {[
            { label: showAllMonths ? "Total Income" : "Income This Month", val: showAllMonths ? totalIncome : monthlyIncome, prev: lastMonthIncome, color: "var(--green)", icon: "ti-trending-up" },
            { label: showAllMonths ? "Total Expenses" : "Expenses This Month", val: showAllMonths ? totalExpense : monthlyExpense, prev: lastMonthExpense, color: "var(--red)", icon: "ti-trending-down" },
            { label: showAllMonths ? "Net Profit (All Time)" : "Net This Month", val: showAllMonths ? totalIncome - totalExpense : monthlyNet, prev: lastMonthIncome - lastMonthExpense, color: (showAllMonths ? totalIncome - totalExpense : monthlyNet) >= 0 ? "var(--green)" : "var(--red)", icon: "ti-chart-bar" },
          ].map((s, i) => {
            const diff = s.val - s.prev;
            const isUp = diff >= 0;
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: "var(--glass)", borderRadius: 12, border: "1px solid var(--border)" }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: `${s.color}18`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 18 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: "-0.6px" }}>₹{Math.abs(s.val).toLocaleString("en-IN")}</div>
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2 }}>{s.label}</div>
                  {!showAllMonths && s.prev > 0 && (
                    <div style={{ fontSize: 11, color: isUp ? "#4ade80" : "#f87171", marginTop: 4, display: "flex", alignItems: "center", gap: 3 }}>
                      <i className={`ti ${isUp ? "ti-arrow-up" : "ti-arrow-down"}`} style={{ fontSize: 10 }} />
                      ₹{Math.abs(diff).toLocaleString("en-IN")} vs last month
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Expense Breakdown Chart toggle */}
        {!showAllMonths && chartData.total > 0 && (
          <div style={{ marginTop: 16 }}>
            <button onClick={() => setShowChart(v => !v)} style={{ fontSize: 13, fontWeight: 600, color: "var(--text3)", background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <i className={`ti ${showChart ? "ti-chevron-up" : "ti-chevron-down"}`} style={{ fontSize: 13 }} />
              {showChart ? "Hide" : "Show"} Expense Breakdown
            </button>
            {showChart && (
              <div style={{ display: "flex", gap: 24, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
                {/* SVG Donut */}
                <svg width={140} height={140} viewBox="0 0 140 140">
                  {(() => {
                    let offset = 0;
                    const r = 52, cx = 70, cy = 70, stroke = 22;
                    const circ = 2 * Math.PI * r;
                    return chartData.slices.map((s, i) => {
                      const dash = s.pct * circ;
                      const gap = circ - dash;
                      const el = (
                        <circle key={i} cx={cx} cy={cy} r={r}
                          fill="none" stroke={s.color} strokeWidth={stroke}
                          strokeDasharray={`${dash} ${gap}`}
                          strokeDashoffset={-offset * circ}
                          style={{ transform: "rotate(-90deg)", transformOrigin: "70px 70px" }}
                        />
                      );
                      offset += s.pct;
                      return el;
                    });
                  })()}
                  <text x={70} y={66} textAnchor="middle" fill="var(--text)" fontSize={13} fontWeight={700}>₹{(chartData.total/1000).toFixed(0)}k</text>
                  <text x={70} y={80} textAnchor="middle" fill="var(--text3)" fontSize={10}>expenses</text>
                </svg>
                {/* Legend */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 180 }}>
                  {chartData.slices.map(s => (
                    <div key={s.cat} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flexShrink: 0 }} />
                      <div style={{ fontSize: 13, color: "var(--text2)", flex: 1 }}>{s.cat}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>₹{s.val.toLocaleString("en-IN")}</div>
                      <div style={{ fontSize: 11, color: "var(--text3)", minWidth: 36, textAlign: "right" }}>{(s.pct * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters + bulk action bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <i className="ti ti-search" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text3)", fontSize: 14, pointerEvents: "none" }} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search…"
              style={{ background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 8, padding: "8px 14px 8px 32px", color: "#fff", fontFamily: "inherit", fontSize: 13, outline: "none", width: 180 }}
            />
            {searchQuery && <button onClick={() => setSearchQuery("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", padding: 0, fontSize: 14 }}><i className="ti ti-x" /></button>}
          </div>
          {["All", "Income", "Expense"].map(f => (
            <button key={f} onClick={() => setFilterType(f)} style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid", fontFamily: "inherit", borderColor: filterType === f ? "var(--accent)" : "var(--border2)", background: filterType === f ? "var(--accent-bg)" : "transparent", color: filterType === f ? "var(--accent2)" : "var(--text3)" }}>{f}</button>
          ))}
          <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}
            style={{ background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 8, padding: "8px 14px", color: "#ffffff", fontFamily: "inherit", fontSize: 13, outline: "none" }}>
            <option value="All">All Accounts</option>
            {ACCOUNTS.map(a => <option key={a}>{a}</option>)}
          </select>
          {allClients.length > 0 && (
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
              style={{ background: "#1a1a27", border: "1px solid var(--border2)", borderRadius: 8, padding: "8px 14px", color: "#ffffff", fontFamily: "inherit", fontSize: 13, outline: "none" }}>
              <option value="All">All Clients</option>
              {allClients.map(c => <option key={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--red)" }}>
              <i className="ti ti-check" /> {selectedIds.size} selected
            </span>
            <button
              onClick={() => setDeleteBulkConfirm(true)}
              style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--red-border)", background: "var(--red)", color: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700 }}
            >
              <i className="ti ti-trash" /> Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border2)", background: "transparent", color: "var(--text3)", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="table-scroll">
        <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", background: "rgba(255,255,255,0.01)", minWidth: 560 }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              {showAllMonths ? "All Transactions" : `Transactions — ${txMonthName}`}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)" }}>{filtered.length} entries</div>
          </div>
          <table className="crm-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                {/* Select-all checkbox */}
                <th style={{ width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    style={cbStyle}
                    checked={allChecked}
                    ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                    onChange={toggleSelectAll}
                  />
                </th>
                {["Date", "Description", "Category", "Account", "Client", "Amount", "Actions"].map((h, i) => <th key={i}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const isSelected = selectedIds.has(t.id);
                const isTransfer = t.client?.startsWith("__transfer__:");
                return (
                  <tr key={t.id} style={{ background: isSelected ? "rgba(232,25,44,.06)" : isTransfer ? "rgba(251,191,36,0.03)" : undefined }}>
                    <td style={{ textAlign: "center" }}>
                      <input type="checkbox" style={cbStyle} checked={isSelected} onChange={() => toggleSelect(t.id)} />
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text3)" }}>{new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>
                      {isTransfer && <i className="ti ti-arrows-exchange" style={{ color: "#fbbf24", marginRight: 6, fontSize: 13 }} />}
                      {t.description}
                    </td>
                    <td>
                      <span style={{ background: isTransfer ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.05)", color: isTransfer ? "#fbbf24" : "var(--text2)", fontSize: 12, padding: "3px 10px", borderRadius: 8, border: `1px solid ${isTransfer ? "rgba(251,191,36,0.25)" : "var(--border)"}` }}>
                        {t.category || "—"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <i className={`ti ${ACCOUNT_ICONS[t.account]}`} style={{ color: ACCOUNT_COLORS[t.account], fontSize: 14 }} />
                        <span style={{ fontSize: 13, color: "var(--text2)" }}>{t.account}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text3)" }}>{isTransfer ? "—" : (t.client || "—")}</td>
                    <td style={{ fontWeight: 700, fontSize: 15, color: isTransfer ? "#fbbf24" : (t.type === "income" ? "var(--green)" : "var(--red)") }}>
                      {isTransfer ? <i className="ti ti-arrows-exchange" style={{ fontSize: 13 }} /> : (t.type === "income" ? "+" : "-")}₹{t.amount?.toLocaleString("en-IN")}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {!isTransfer && (
                          <>
                            <button onClick={() => openEdit(t)} title="Edit" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--blue)", cursor: "pointer", fontSize: 14 }}>
                              <i className="ti ti-pencil" />
                            </button>
                            <button onClick={() => duplicateTx(t)} title="Duplicate" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text3)", cursor: "pointer", fontSize: 14 }}>
                              <i className="ti ti-copy" />
                            </button>
                          </>
                        )}
                        <button onClick={() => setDeleteConfirm(t.id)} title="Delete" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--red)", cursor: "pointer", fontSize: 14 }}>
                          <i className="ti ti-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
              <i className="ti ti-report-money" style={{ fontSize: 40, opacity: .2 }} />
              <div style={{ marginTop: 12, fontSize: 15 }}>No transactions yet</div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 500, maxWidth: "95vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: txType === "income" ? "var(--green)" : "var(--red)", letterSpacing: "-0.4px" }}>
                {editingId ? "Edit Entry" : txType === "income" ? "➕ Add Income" : "➖ Add Expense"}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>
            {!editingId && (
              <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "rgba(255,255,255,0.03)", padding: 5, borderRadius: 12, border: "1px solid var(--border)" }}>
                {(["income", "expense"] as const).map(t => (
                  <button key={t} onClick={() => setTxType(t)} style={{ flex: 1, padding: "9px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", fontFamily: "inherit", background: txType === t ? (t === "income" ? "var(--green-bg)" : "var(--red-bg)") : "transparent", color: txType === t ? (t === "income" ? "var(--green)" : "var(--red)") : "var(--text3)", transition: "all .15s" }}>
                    {t === "income" ? "➕ Income" : "➖ Expense"}
                  </button>
                ))}
              </div>
            )}
            <div className="modal-2col" style={{ gap: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={LS}>Description *</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder={txType === "income" ? "e.g. Retainer from Ozmo" : "e.g. Canva subscription"} style={IS} />
              </div>
              <div>
                <label style={LS}>Date</label>
                <input value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} type="date" style={IS} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ ...LS, margin: 0 }}>Account{(form.splits?.length ?? 1) > 1 ? "s & Amounts" : " & Amount"} *</label>
                  {(form.splits?.length ?? 1) > 1 && (
                    <span style={{ fontSize: 12, color: "var(--text3)" }}>
                      Total: ₹{(form.splits || []).reduce((s: number, sp: any) => s + (parseFloat(sp.amount) || 0), 0).toLocaleString("en-IN")}
                    </span>
                  )}
                </div>
                {(form.splits || [{ account: "Current Account", amount: "" }]).map((sp: any, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <select value={sp.account}
                      onChange={e => { const s = [...(form.splits || [])]; s[i] = { ...s[i], account: e.target.value }; setForm({ ...form, splits: s }); }}
                      style={{ ...IS, flex: "1 1 0", minWidth: 0 }}>
                      {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <input type="number" value={sp.amount} placeholder="Amount ₹"
                      onChange={e => { const s = [...(form.splits || [])]; s[i] = { ...s[i], amount: e.target.value }; setForm({ ...form, splits: s }); }}
                      style={{ ...IS, flex: "1 1 0", minWidth: 0 }} />
                    {(form.splits?.length ?? 1) > 1 && (
                      <button onClick={() => setForm({ ...form, splits: (form.splits || []).filter((_: any, j: number) => j !== i) })}
                        style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>×</button>
                    )}
                  </div>
                ))}
                {!editingId && (
                  <button onClick={() => setForm({ ...form, splits: [...(form.splits || []), { account: "Current Account", amount: "" }] })}
                    style={{ fontSize: 12, color: "var(--text3)", background: "transparent", border: "1px dashed var(--border2)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", width: "100%" }}>
                    + Add another account
                  </button>
                )}
              </div>
              <div>
                <label style={LS}>Category</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={IS}>
                  <option value="">Select...</option>
                  {(txType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {txType === "income" && (
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={LS}>Client</label>
                  <input value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} placeholder="Which client paid?" style={IS} />
                </div>
              )}
              {/* Advance-specific fields — syncs to HR Management & Payroll */}
              {form.category === "Advance" && txType === "expense" && (
                <>
                  <div>
                    <label style={LS}>Team Member</label>
                    <select value={advanceMember} onChange={e => setAdvanceMember(e.target.value)} style={{ ...IS, cursor: "pointer" }}>
                      <option value="">Select member…</option>
                      {members.map((m: any) => <option key={m.id} value={m.name}>{m.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={LS}>Recovery Month</label>
                    <input type="month" value={advanceMonth} onChange={e => setAdvanceMonth(e.target.value)} style={IS} />
                  </div>
                  <div style={{ gridColumn: "1/-1", padding: "10px 14px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, fontSize: 12, color: "var(--text2)" }}>
                    <i className="ti ti-coins" style={{ marginRight: 5, color: "#fbbf24" }} />
                    This will auto-appear in <strong>HR → Payouts</strong> and be <strong>deducted from payroll</strong> in the selected Recovery Month.
                  </div>
                </>
              )}
            </div>
            <button
              onClick={saveTx}
              disabled={form.category === "Advance" && txType === "expense" && !advanceMember}
              className="btn-primary"
              style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15, marginTop: 20, opacity: (form.category === "Advance" && txType === "expense" && !advanceMember) ? 0.6 : 1 }}
            >
              {editingId ? "Save Changes" : txType === "income" ? "Save Income" : form.category === "Advance" ? "Give Advance" : "Save Expense"}
            </button>
          </div>
        </div>
      )}

      {/* Delete single confirm */}
      {deleteConfirm !== null && (() => {
        const tx = transactions.find(t => t.id === deleteConfirm);
        const isTransfer = tx?.client?.startsWith("__transfer__:");
        return (
          <div onClick={() => setDeleteConfirm(null)} className="crm-modal-bg">
            <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 380, maxWidth: "95vw", textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>{isTransfer ? "🔄" : "🗑️"}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
                {isTransfer ? "Delete Transfer?" : "Delete Entry?"}
              </div>
              <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24 }}>
                {isTransfer
                  ? "Both legs of this transfer will be deleted and both account balances reversed."
                  : "This will also reverse the balance for that account."}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
                <button onClick={() => deleteTx(deleteConfirm)} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete selected confirm */}
      {deleteBulkConfirm && (
        <div onClick={() => setDeleteBulkConfirm(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 400, maxWidth: "95vw", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🗑️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete {selectedIds.size} entries?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24 }}>Account balances will be reversed for each deleted entry. This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteBulkConfirm(false)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={deleteSelected} disabled={bulkDeleting} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: bulkDeleting ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 14, opacity: bulkDeleting ? .6 : 1 }}>
                {bulkDeleting ? "Deleting…" : `Delete ${selectedIds.size} entries`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete whole month confirm */}
      {deleteMonthConfirm && (
        <div onClick={() => setDeleteMonthConfirm(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 420, maxWidth: "95vw", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🗓️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete all of {txMonthName}?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 6 }}>
              This will permanently delete <strong style={{ color: "var(--red)" }}>{monthlyTx.length} transactions</strong> and reverse their account balances.
            </div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 24 }}>This cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteMonthConfirm(false)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={deleteMonth} disabled={bulkDeleting} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: bulkDeleting ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 14, opacity: bulkDeleting ? .6 : 1 }}>
                {bulkDeleting ? "Deleting…" : `Delete ${monthlyTx.length} transactions`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Balances Modal */}
      {showBalanceModal && (
        <div onClick={() => setShowBalanceModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 440, maxWidth: "95vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>Update Balances</div>
              <button onClick={() => setShowBalanceModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {ACCOUNTS.map(acc => (
                <div key={acc}>
                  <label style={{ ...LS, color: ACCOUNT_COLORS[acc] }}>
                    <i className={`ti ${ACCOUNT_ICONS[acc]}`} /> {acc}
                  </label>
                  <input value={balanceForm[acc]} onChange={e => setBalanceForm({ ...balanceForm, [acc]: e.target.value })} placeholder="0" type="number" style={IS} />
                </div>
              ))}
            </div>
            <button onClick={saveBalances} className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15, marginTop: 20 }}>Save Balances</button>
          </div>
        </div>
      )}

      </div>
      )} {/* end transactions ternary */}

      {/* ── Dasti Add / Edit Modal ── */}
      {showDastiModal && (
        <div onClick={() => setShowDastiModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 440, maxWidth: "95vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>{dastiEditingId ? "Edit Entry" : dastiForm.type === "borrowed" ? "Add Borrowing" : "Repayment Made"}</div>
              <button onClick={() => setShowDastiModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>

            {/* Type toggle */}
            {!dastiEditingId && (
              <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 4 }}>
                {(["borrowed", "repaid"] as const).map(t => (
                  <button key={t} onClick={() => setDastiForm((f: any) => ({ ...f, type: t }))} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, background: dastiForm.type === t ? (t === "borrowed" ? "rgba(248,113,113,0.2)" : "rgba(74,222,128,0.2)") : "transparent", color: dastiForm.type === t ? (t === "borrowed" ? "#f87171" : "#4ade80") : "var(--text3)", transition: "all .15s" }}>
                    {t === "borrowed" ? "↓ Borrowed" : "↑ Repaid"}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 6 }}>Person</label>
                <select value={dastiForm.person} onChange={e => setDastiForm((f: any) => ({ ...f, person: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text)", fontSize: 14 }}>
                  <option value="">Select person…</option>
                  {DASTI_PEOPLE.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 6 }}>Account</label>
                <select value={dastiForm.account} onChange={e => setDastiForm((f: any) => ({ ...f, account: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text)", fontSize: 14 }}>
                  {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 6 }}>Amount (₹)</label>
                <input value={dastiForm.amount} onChange={e => setDastiForm((f: any) => ({ ...f, amount: e.target.value }))} placeholder="0" type="number" min="0" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 6 }}>Description</label>
                <input value={dastiForm.description} onChange={e => setDastiForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="Reason or note…" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 6 }}>Date</label>
                <input type="date" value={dastiForm.date} onChange={e => setDastiForm((f: any) => ({ ...f, date: e.target.value }))} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text)", fontSize: 14, boxSizing: "border-box" }} />
              </div>
            </div>

            <button onClick={saveDasti} disabled={dastiSaving} style={{ width: "100%", padding: 13, marginTop: 20, background: dastiForm.type === "borrowed" ? "rgba(248,113,113,0.8)" : "rgba(74,222,128,0.8)", border: "none", borderRadius: 10, color: "#fff", cursor: dastiSaving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 15, opacity: dastiSaving ? .6 : 1 }}>
              {dastiSaving ? "Saving…" : dastiEditingId ? "Save Changes" : dastiForm.type === "borrowed" ? "Add Borrowing" : "Record Repayment"}
            </button>
          </div>
        </div>
      )}

      {/* ── Dasti Delete Confirm ── */}
      {dastiDeleteConfirm && (
        <div onClick={() => setDastiDeleteConfirm(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 360, maxWidth: "95vw", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>💸</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete Entry?</div>
            <div style={{ fontSize: 14, color: "var(--text3)", marginBottom: 24 }}>This dasti entry will be permanently removed.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDastiDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={() => deleteDasti(dastiDeleteConfirm)} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Petty Cash Modal ── */}
      {showPettyCashModal && (
        <div onClick={() => setShowPettyCashModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 400, maxWidth: "95vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-cash" style={{ fontSize: 18, color: "#4ade80" }} />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Petty Cash</div>
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>Quick expense from Cash in Hand</div>
                </div>
              </div>
              <button onClick={() => setShowPettyCashModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={LS}>Amount (₹) *</label>
                <input autoFocus value={pettyCashForm.amount} onChange={e => setPettyCashForm(f => ({ ...f, amount: e.target.value }))} placeholder="500" type="number" min="0" style={IS} />
              </div>
              <div>
                <label style={LS}>What was it for? *</label>
                <input value={pettyCashForm.description} onChange={e => setPettyCashForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Printer paper, tea, transport…" style={IS} />
              </div>
              <div>
                <label style={LS}>Date</label>
                <input type="date" value={pettyCashForm.date} onChange={e => setPettyCashForm(f => ({ ...f, date: e.target.value }))} style={IS} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowPettyCashModal(false)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 13 }}>Cancel</button>
              <button onClick={savePettyCash} disabled={pettyCashSaving || !pettyCashForm.amount || !pettyCashForm.description} style={{ flex: 2, padding: 13, background: !pettyCashForm.amount || !pettyCashForm.description ? "rgba(248,113,113,0.4)" : "rgba(248,113,113,0.85)", border: "none", borderRadius: 10, color: "#fff", cursor: pettyCashSaving || !pettyCashForm.amount || !pettyCashForm.description ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 15 }}>
                {pettyCashSaving ? "Saving…" : "Log Petty Cash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Internal Transfer Modal ── */}
      {showTransferModal && (
        <div onClick={() => setShowTransferModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 460, maxWidth: "95vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <i className="ti ti-arrows-exchange" style={{ fontSize: 18, color: "#f59e0b" }} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>Internal Transfer</div>
              </div>
              <button onClick={() => setShowTransferModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}><i className="ti ti-x" /></button>
            </div>

            {(() => {
              const fromSplits: Array<{ account: string; amount: string }> = transferForm.fromSplits || [];
              const toSplits:   Array<{ account: string; amount: string }> = transferForm.toSplits   || [];
              const totalFrom = fromSplits.reduce((s, sp) => s + (parseFloat(sp.amount) || 0), 0);
              const totalTo   = toSplits.reduce((s, sp) => s + (parseFloat(sp.amount) || 0), 0);
              const balanced  = totalFrom > 0 && Math.abs(totalFrom - totalTo) < 0.01;
              const IS2 = { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text)", fontSize: 13, width: "100%", boxSizing: "border-box" as const };
              const splitRow = (splits: typeof fromSplits, side: "fromSplits" | "toSplits") => (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {splits.map((sp, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <select value={sp.account}
                        onChange={e => { const s = [...splits]; s[i] = { ...s[i], account: e.target.value }; setTransferForm((f: any) => ({ ...f, [side]: s })); }}
                        style={{ ...IS2, flex: "1 1 0", minWidth: 0 }}>
                        {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      <input type="number" value={sp.amount} placeholder="₹"
                        onChange={e => { const s = [...splits]; s[i] = { ...s[i], amount: e.target.value }; setTransferForm((f: any) => ({ ...f, [side]: s })); }}
                        style={{ ...IS2, flex: "0 0 100px" }} />
                      {splits.length > 1 && (
                        <button onClick={() => setTransferForm((f: any) => ({ ...f, [side]: splits.filter((_, j) => j !== i) }))}
                          style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)", color: "#f87171", cursor: "pointer", flexShrink: 0 }}>×</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setTransferForm((f: any) => ({ ...f, [side]: [...splits, { account: "Current Account", amount: "" }] }))}
                    style={{ fontSize: 12, color: "var(--text3)", background: "transparent", border: "1px dashed var(--border2)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
                    + Add account
                  </button>
                </div>
              );
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "start" }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px" }}>From</label>
                        {fromSplits.length > 1 && <span style={{ fontSize: 11, color: "var(--text3)" }}>₹{totalFrom.toLocaleString("en-IN")}</span>}
                      </div>
                      {splitRow(fromSplits, "fromSplits")}
                    </div>
                    <div style={{ paddingTop: 28, color: "#f59e0b", fontSize: 20, fontWeight: 700, textAlign: "center" }}>→</div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px" }}>To</label>
                        {toSplits.length > 1 && <span style={{ fontSize: 11, color: "var(--text3)" }}>₹{totalTo.toLocaleString("en-IN")}</span>}
                      </div>
                      {splitRow(toSplits, "toSplits")}
                    </div>
                  </div>

                  {/* Totals mismatch warning */}
                  {totalFrom > 0 && totalTo > 0 && !balanced && (
                    <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", color: "#fbbf24", fontSize: 13 }}>
                      From total (₹{totalFrom.toLocaleString("en-IN")}) ≠ To total (₹{totalTo.toLocaleString("en-IN")}) — amounts must match.
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 6 }}>Date</label>
                    <input type="date" value={transferForm.date} onChange={e => setTransferForm((f: any) => ({ ...f, date: e.target.value }))} style={IS2} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".5px", display: "block", marginBottom: 6 }}>Note <span style={{ fontWeight: 400 }}>(optional)</span></label>
                    <input value={transferForm.description} onChange={e => setTransferForm((f: any) => ({ ...f, description: e.target.value }))} placeholder="e.g. Moving float for shoot" style={IS2} />
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button onClick={() => setShowTransferModal(false)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 13, fontSize: 14 }}>Cancel</button>
                    <button onClick={saveTransfer} disabled={transferSaving || !balanced}
                      style={{ flex: 2, padding: 13, background: (!balanced || transferSaving) ? "rgba(245,158,11,0.4)" : "rgba(245,158,11,0.85)", border: "none", borderRadius: 10, color: "#000", cursor: (!balanced || transferSaving) ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 15 }}>
                      {transferSaving ? "Transferring…" : `Transfer ₹${totalFrom.toLocaleString("en-IN")}`}
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

    </div>
  );
}
