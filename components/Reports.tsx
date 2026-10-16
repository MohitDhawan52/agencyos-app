"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

interface ReportsProps {
  profile: any;
  isAdmin: boolean;
}

export default function Reports({ profile, isAdmin }: ReportsProps) {
  const [records, setRecords] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "custom">("week");
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().split("T")[0];
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    if (isAdmin) fetchProfiles();
    fetchRecords();
  }, [selectedUser, fromDate, toDate]);

  useEffect(() => {
    const today = new Date();
    if (dateRange === "today") {
      const t = today.toISOString().split("T")[0];
      setFromDate(t); setToDate(t);
    } else if (dateRange === "week") {
      const from = new Date(today); from.setDate(today.getDate() - 6);
      setFromDate(from.toISOString().split("T")[0]);
      setToDate(today.toISOString().split("T")[0]);
    } else if (dateRange === "month") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      setFromDate(from.toISOString().split("T")[0]);
      setToDate(today.toISOString().split("T")[0]);
    }
  }, [dateRange]);

  const fetchProfiles = async () => {
    const { data } = await supabase.from("profiles").select("id, name, role").neq("status", "left").order("name");
    setProfiles(data || []);
  };

  const fetchRecords = async () => {
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];

    // Auto-fix: close any past records that were left open (forgot to clock out)
    const openQ = supabase
      .from("attendance")
      .select("id, date")
      .not("clock_in", "is", null)
      .is("clock_out", null)
      .lt("date", today);
    if (!isAdmin) openQ.eq("user_id", profile.id);
    const { data: openRecords } = await openQ;
    if (openRecords && openRecords.length > 0) {
      await Promise.all(openRecords.map((rec: any) =>
        supabase.from("attendance")
          .update({ clock_out: new Date(`${rec.date}T23:59:59`).toISOString() })
          .eq("id", rec.id)
      ));
    }

    let q = supabase.from("attendance").select("*, profiles(name, role)")
      .gte("date", fromDate).lte("date", toDate).order("date", { ascending: false })
      .limit(5000); // default Supabase limit is 1000; phantom duplicate rows can saturate it

    if (!isAdmin) q = q.eq("user_id", profile.id);
    else if (selectedUser !== "all") q = q.eq("user_id", selectedUser);

    const { data } = await q;
    // De-duplicate by (user_id, date). Quality: clocked-in (3) > has leave/absent/half-day (2) > phantom blank (1)
    const rowQ = (r: any) => r.clock_in ? 3 : (r.on_leave || r.is_absent || r.is_half_day) ? 2 : 1;
    const deduped = new Map<string, any>();
    (data || []).forEach((r: any) => {
      const key = `${r.user_id}-${r.date}`;
      const ex = deduped.get(key);
      if (!ex || rowQ(r) > rowQ(ex)) deduped.set(key, r);
    });
    setRecords(Array.from(deduped.values()).sort((a, b) => b.date.localeCompare(a.date)));
    setLoading(false);
  };

  const calcWorked = (r: any) => {
    if (!r.clock_in) return 0;
    const today = new Date().toISOString().split("T")[0];
    let end: Date;
    if (r.clock_out) {
      end = new Date(r.clock_out);
    } else if (r.date < today) {
      // Past day with no clock_out — cap at midnight of that day
      end = new Date(`${r.date}T23:59:59`);
    } else {
      // Today — still active, use current time
      end = new Date();
    }
    const total = (end.getTime() - new Date(r.clock_in).getTime()) / 1000 / 60;
    return Math.max(0, total - (r.total_break_minutes || 0));
  };

  const fmtMins = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const fmtTime = (iso: string) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const fmtDate = (d: string) => {
    return new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  };

  // Group by user for summary
  const summaryByUser: Record<string, { name: string; days: number; totalMins: number; breakMins: number }> = {};
  records.forEach(r => {
    const uid = r.user_id;
    const name = r.profiles?.name || "Unknown";
    if (!summaryByUser[uid]) summaryByUser[uid] = { name, days: 0, totalMins: 0, breakMins: 0 };
    // Only count as a "day" if they actually clocked in (leave-only rows show 0m and skew the count)
    if (r.clock_in) summaryByUser[uid].days++;
    summaryByUser[uid].totalMins += calcWorked(r);
    summaryByUser[uid].breakMins += r.total_break_minutes || 0;
  });

  const totalWorkedAllMins = Object.values(summaryByUser).reduce((a, b) => a + b.totalMins, 0);
  const rangeLabel = dateRange === "today" ? "Today" : dateRange === "week" ? "This Week" : dateRange === "month" ? "This Month" : "Custom Range";

  const downloadCSV = () => {
    const headers = ["Date", ...(isAdmin ? ["Member"] : []), "Clock In", "Clock Out", "Break Time (mins)", "Worked (mins)", "Worked (h m)", "Status"];
    const rows = records.map(r => {
      const worked = calcWorked(r);
      const isDone = r.clock_out;
      const isActive = r.clock_in && !r.clock_out;
      const today = new Date().toISOString().split("T")[0];
      const forgotClockout = r.clock_in && !r.clock_out && r.date < today;
      return [
        r.date,
        ...(isAdmin ? [r.profiles?.name || ""] : []),
        fmtTime(r.clock_in),
        fmtTime(r.clock_out),
        String(r.total_break_minutes || 0),
        String(Math.round(worked)),
        fmtMins(worked),
        isDone ? "Complete" : forgotClockout ? "Forgot Clockout" : isActive ? "Active" : "—",
      ];
    });

    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance-report-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-wrap" style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px", margin: 0 }}>
            Attendance Reports
          </h1>
          <p style={{ fontSize: 14, color: "var(--text3)", marginTop: 4 }}>
            {rangeLabel} · {records.length} records
          </p>
        </div>
        {records.length > 0 && (
          <button onClick={downloadCSV} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(74,222,128,0.3)", background: "rgba(74,222,128,0.08)", color: "#4ade80", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            <i className="ti ti-download" style={{ fontSize: 15 }} /> Download CSV
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
        {/* Date range pills */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", padding: 4, borderRadius: 10, border: "1px solid var(--border)" }}>
          {(["today", "week", "month", "custom"] as const).map(r => (
            <button key={r} onClick={() => setDateRange(r)} style={{
              padding: "6px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit", border: "none", transition: "all 0.15s",
              background: dateRange === r ? "rgba(109,93,252,0.2)" : "transparent",
              color: dateRange === r ? "var(--accent2)" : "var(--text3)",
            }}>
              {r === "today" ? "Today" : r === "week" ? "This Week" : r === "month" ? "This Month" : "Custom"}
            </button>
          ))}
        </div>

        {dateRange === "custom" && (
          <>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />
            <span style={{ color: "var(--text3)", fontSize: 13 }}>to</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit" }} />
          </>
        )}

        {isAdmin && (
          <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}
            style={{ padding: "7px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", marginLeft: "auto" }}>
            <option value="all">All Members</option>
            {profiles.filter(p => p.role !== "admin").map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Summary cards — admin only */}
      {isAdmin && Object.keys(summaryByUser).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
          {Object.entries(summaryByUser).map(([uid, s]) => (
            <div key={uid} style={{
              padding: "16px 18px", borderRadius: 14,
              background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>{s.name}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Stat icon="ti-calendar" label="Days" value={String(s.days)} color="var(--accent2)" />
                <Stat icon="ti-clock" label="Worked" value={fmtMins(s.totalMins)} color="#4ade80" />
                <Stat icon="ti-coffee" label="Breaks" value={fmtMins(s.breakMins)} color="#fbbf24" />
              </div>
            </div>
          ))}
          {isAdmin && records.length > 0 && (
            <div style={{
              padding: "16px 18px", borderRadius: 14,
              background: "rgba(109,93,252,0.08)", border: "1px solid rgba(109,93,252,0.2)",
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--accent2)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.5px" }}>Team Total</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", letterSpacing: "-1px" }}>{fmtMins(totalWorkedAllMins)}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>across {Object.keys(summaryByUser).length} members</div>
            </div>
          )}
        </div>
      )}

      {/* Records table */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text2)" }}>Time Logs</span>
          <span style={{ fontSize: 12, color: "var(--text3)" }}>{records.length} entries</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>Loading records...</div>
        ) : records.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <i className="ti ti-clock-off" style={{ fontSize: 32, color: "var(--text3)", opacity: 0.4 }} />
            <div style={{ marginTop: 12, color: "var(--text3)", fontSize: 14 }}>No attendance records found</div>
          </div>
        ) : (
          <div className="table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Date", ...(isAdmin ? ["Member"] : []), "Clock In", "Clock Out", "Breaks", "Break Time", "Worked", "Status"].map(h => (
                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => {
                  const worked = calcWorked(r);
                  const breakCount = (r.breaks || []).filter((b: any) => b.start && b.end).length;
                  const isEven = i % 2 === 0;
                  const today = new Date().toISOString().split("T")[0];
                  const isDone = !!(r.clock_out);
                  const isActive = !!(r.clock_in && !r.clock_out && r.date === today);
                  const forgotClockout = !!(r.clock_in && !r.clock_out && r.date < today);
                  const isOnLeave = !!(r.on_leave);
                  const leaveLabel = r.leave_type
                    ? { medical: "Medical Leave", paid: "Paid Leave", sick: "Sick Leave", unpaid: "Unpaid Leave", half_day: "Half-Day Leave" }[r.leave_type as string] ?? (r.leave_type + " Leave")
                    : "On Leave";
                  return (
                    <tr key={r.id} style={{ background: isEven ? "transparent" : "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text)", whiteSpace: "nowrap" }}>{fmtDate(r.date)}</td>
                      {isAdmin && <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text)", fontWeight: 600 }}>{r.profiles?.name || "—"}</td>}
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "#4ade80", fontWeight: 600, whiteSpace: "nowrap" }}>{isOnLeave && !r.clock_in ? <span style={{ color: "var(--text3)", fontWeight: 400 }}>—</span> : fmtTime(r.clock_in)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: r.clock_out ? "#f87171" : "var(--text3)", fontWeight: r.clock_out ? 600 : 400, whiteSpace: "nowrap" }}>{fmtTime(r.clock_out)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text2)", textAlign: "center" }}>{breakCount}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "#fbbf24" }}>{fmtMins(r.total_break_minutes || 0)}</td>
                      <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text)", fontWeight: 700 }}>{isOnLeave && !r.clock_in ? <span style={{ color: "var(--text3)" }}>—</span> : fmtMins(worked)}</td>
                      <td style={{ padding: "12px 16px" }}>
                        {isOnLeave ? (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }}>
                            {leaveLabel}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6,
                            background: isDone ? "rgba(74,222,128,0.08)" : forgotClockout ? "rgba(251,191,36,0.1)" : isActive ? "rgba(109,93,252,0.12)" : "rgba(255,255,255,0.04)",
                            color: isDone ? "#4ade80" : forgotClockout ? "#fbbf24" : isActive ? "var(--accent2)" : "var(--text3)",
                            border: `1px solid ${isDone ? "rgba(74,222,128,0.2)" : forgotClockout ? "rgba(251,191,36,0.3)" : isActive ? "rgba(109,93,252,0.2)" : "var(--border)"}`,
                          }}>
                            {isDone ? "Complete" : forgotClockout ? "Forgot Clockout" : isActive ? "Active" : "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, color }: any) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <i className={`ti ${icon}`} style={{ fontSize: 12, color: "var(--text3)" }} />
        <span style={{ fontSize: 12, color: "var(--text3)" }}>{label}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}