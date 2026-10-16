"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const FIELDS = ["planned", "shot", "edited", "approval", "posted"] as const;
type Field = typeof FIELDS[number];
const fieldLabels: Record<Field, string> = { planned: "Planned", shot: "Shot", edited: "Edited", approval: "Approval", posted: "Posted" };
const fieldColors: Record<Field, string> = { planned: "var(--text2)", shot: "var(--blue)", edited: "var(--accent2)", approval: "var(--amber)", posted: "var(--green)" };

export default function VideoTracker() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCell, setEditingCell] = useState<{ id: string; field: Field } | null>(null);
  const [editVal, setEditVal] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return now.toLocaleString("en-US", { month: "long" }) + " " + now.getFullYear();
  });

  useEffect(() => { fetchData(); }, [month]);

  useEffect(() => {
    const ch = supabase.channel(`videos-rt-${month}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "videos" }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [month]);

  const fetchData = async () => {
    setLoading(true);

    // ── Step 1: Get all active clients ────────────────────────────────────
    const { data: clientsData } = await supabase
      .from("clients")
      .select("name, color")
      .eq("status", "Active")
      .order("created_at", { ascending: true });

    const activeClients = clientsData || [];

    // ── Step 2: Get existing rows for this month ──────────────────────────
    const { data: rows } = await supabase
      .from("videos")
      .select("*")
      .eq("month", month);

    const existingRows = rows || [];

    // ── Step 3: Deduplicate existing rows by client name ──────────────────
    // Keep only the first row per client, delete duplicates
    const seenClients = new Map<string, any>();
    const duplicateIds: string[] = [];

    for (const row of existingRows) {
      if (seenClients.has(row.client)) {
        // This is a duplicate — mark for deletion but merge values
        const existing = seenClients.get(row.client);
        // Keep the one with higher posted count (more complete data)
        if ((row.posted || 0) > (existing.posted || 0)) {
          duplicateIds.push(existing.id);
          seenClients.set(row.client, row);
        } else {
          duplicateIds.push(row.id);
        }
      } else {
        seenClients.set(row.client, row);
      }
    }

    // Delete duplicate rows
    if (duplicateIds.length > 0) {
      await supabase.from("videos").delete().in("id", duplicateIds);
    }

    // ── Step 4: Check which active clients are missing rows ───────────────
    const missingClients = activeClients.filter(c => !seenClients.has(c.name));

    if (missingClients.length > 0) {
      const newRows = missingClients.map(c => ({
        client: c.name,
        color: c.color || "#5646e0",
        planned: 0, shot: 0, edited: 0, approval: 0, posted: 0,
        month,
      }));
      await supabase.from("videos").insert(newRows);
    }

    // ── Step 5: Final fetch — clean data ─────────────────────────────────
    const { data: finalRows } = await supabase
      .from("videos")
      .select("*")
      .eq("month", month);

    if (finalRows) {
      // Final client-side dedup just to be safe
      const seen = new Set<string>();
      const deduped = finalRows.filter(r => {
        if (seen.has(r.client)) return false;
        seen.add(r.client);
        return true;
      });

      // Filter to active clients only, then sort in same order as activeClients
      const activeNames = new Set(activeClients.map(c => c.name));
      const activeOnly = deduped.filter(r => activeNames.has(r.client));
      const clientOrder = activeClients.map(c => c.name);
      activeOnly.sort((a, b) => clientOrder.indexOf(a.client) - clientOrder.indexOf(b.client));

      setData(activeOnly);
    }

    setLoading(false);
  };

  const totals = FIELDS.reduce((acc, f) => {
    acc[f] = data.reduce((s, r) => s + (r[f] || 0), 0);
    return acc;
  }, {} as Record<Field, number>);

  const getStatus = (posted: number, planned: number) => {
    const pct = planned > 0 ? posted / planned : 0;
    if (pct >= 0.8) return { label: "On Track", color: "var(--green)", bg: "var(--green-bg)", border: "var(--green-border)" };
    if (pct >= 0.5) return { label: "Lagging",  color: "var(--amber)", bg: "var(--amber-bg)", border: "var(--amber-border)" };
    return            { label: "Behind",   color: "var(--red)",   bg: "var(--red-bg)",   border: "var(--red-border)" };
  };

  const getCellColor = (val: number, planned: number) => {
    const pct = planned > 0 ? val / planned : 0;
    if (pct >= 0.8) return "var(--green)";
    if (pct >= 0.5) return "var(--amber)";
    return "var(--red)";
  };

  const startEdit = (id: string, field: Field, val: number) => {
    setEditingCell({ id, field });
    setEditVal(String(val));
  };

  const commitEdit = async () => {
    if (!editingCell) return;
    const num = Math.max(0, parseInt(editVal) || 0);
    await supabase.from("videos").update({ [editingCell.field]: num }).eq("id", editingCell.id);
    setData(data.map(r => r.id === editingCell.id ? { ...r, [editingCell.field]: num } : r));
    setEditingCell(null);
  };

  // ── Fix duplicates button — manual trigger ─────────────────────────────
  const fixDuplicates = async () => {
    setLoading(true);
    const { data: allRows } = await supabase
      .from("videos")
      .select("*")
      .eq("month", month);

    if (!allRows) { setLoading(false); return; }

    const seenClients = new Map<string, any>();
    const duplicateIds: string[] = [];

    for (const row of allRows) {
      if (seenClients.has(row.client)) {
        const existing = seenClients.get(row.client);
        if ((row.posted || 0) >= (existing.posted || 0)) {
          duplicateIds.push(existing.id);
          seenClients.set(row.client, row);
        } else {
          duplicateIds.push(row.id);
        }
      } else {
        seenClients.set(row.client, row);
      }
    }

    if (duplicateIds.length > 0) {
      await supabase.from("videos").delete().in("id", duplicateIds);
      alert(`Removed ${duplicateIds.length} duplicate row(s).`);
    } else {
      alert("No duplicates found!");
    }
    fetchData();
  };

  return (
    <div className="page-wrap">

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Video Tracker</div>
          <div style={{ fontSize: 15, color: "var(--text2)", marginTop: 6 }}>Click any number to edit · All changes save instantly</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={fixDuplicates} style={{ padding: "9px 16px", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, color: "#f87171", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            <i className="ti ti-tool" style={{ marginRight: 6 }} />Fix Duplicates
          </button>
          <select value={month} onChange={e => setMonth(e.target.value)} className="crm-select" style={{ fontSize: 14, padding: "10px 16px" }}>
            {(() => {
              const names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
              const now = new Date();
              const opts: string[] = [];
              for (let y = now.getFullYear() - 1; y <= now.getFullYear() + 1; y++)
                names.forEach(n => opts.push(`${n} ${y}`));
              return opts.map(m => <option key={m}>{m}</option>);
            })()}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14, marginBottom: 28 }}>
        {FIELDS.map(f => (
          <div key={f} className="stat-card" style={{ padding: "18px 20px" }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: fieldColors[f], letterSpacing: "-0.8px" }}>{totals[f]}</div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 5, fontWeight: 500 }}>{fieldLabels[f]}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} />
          <div style={{ marginTop: 12, fontSize: 15 }}>Loading tracker...</div>
        </div>
      ) : (
        <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", background: "rgba(255,255,255,0.01)" }}>
          <div className="table-scroll">
          <table className="crm-table">
            <thead>
              <tr>
                <th style={{ width: 200 }}>Client ({data.length})</th>
                {FIELDS.map(f => <th key={f} style={{ textAlign: "center", color: fieldColors[f] }}>{fieldLabels[f]}</th>)}
                <th style={{ textAlign: "center" }}>Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const pct = row.planned > 0 ? Math.round(row.posted / row.planned * 100) : 0;
                const status = getStatus(row.posted, row.planned);
                return (
                  <tr key={row.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 9, background: `${row.color}22`, border: `1px solid ${row.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: row.color, flexShrink: 0 }}>
                          {row.client[0]}
                        </div>
                        <span style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{row.client}</span>
                      </div>
                    </td>
                    {FIELDS.map(f => (
                      <td key={f} style={{ textAlign: "center", cursor: "pointer", background: editingCell?.id === row.id && editingCell?.field === f ? "rgba(109,93,252,0.08)" : "transparent" }}
                        onClick={() => startEdit(row.id, f, row[f])}>
                        {editingCell?.id === row.id && editingCell?.field === f ? (
                          <input autoFocus value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
                            style={{ width: 52, textAlign: "center", background: "var(--bg3)", border: "1px solid var(--accent)", borderRadius: 8, padding: "5px 8px", color: "var(--text)", fontFamily: "inherit", fontSize: 15, fontWeight: 700, outline: "none" }} />
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                            <span style={{ fontSize: 18, fontWeight: 700, color: f === "planned" ? "var(--text2)" : getCellColor(row[f], row.planned) }}>{row[f]}</span>
                            <i className="ti ti-pencil" style={{ fontSize: 10, color: "var(--text3)", opacity: 0.4 }} />
                          </div>
                        )}
                      </td>
                    ))}
                    <td style={{ textAlign: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "center" }}>
                        <div style={{ width: 90, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 6, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: status.color, borderRadius: 6, transition: "width .3s" }} />
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: status.color, minWidth: 32 }}>{pct}%</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ background: status.bg, color: status.color, fontSize: 12, padding: "4px 11px", borderRadius: 20, fontWeight: 600, border: `1px solid ${status.border}` }}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background: "rgba(255,255,255,0.02)", borderTop: "1px solid var(--border2)" }}>
                <td style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>TOTAL</td>
                {FIELDS.map(f => (
                  <td key={f} style={{ textAlign: "center" }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: fieldColors[f] }}>{totals[f]}</span>
                  </td>
                ))}
                <td colSpan={2} style={{ textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                  {totals.planned > 0 ? Math.round(totals.posted / totals.planned * 100) : 0}% overall posted
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 24, marginTop: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text3)" }}>💡 Click any number to edit · Changes save to database instantly</div>
        {[{ color: "var(--green)", label: "On Track ≥80%" }, { color: "var(--amber)", label: "Lagging 50–79%" }, { color: "var(--red)", label: "Behind <50%" }].map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text2)" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />{l.label}
          </div>
        ))}
      </div>
    </div>
  );
}