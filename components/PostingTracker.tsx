"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabase";

const SS = { background: "var(--bg3)", border: "1px solid var(--border2)", borderRadius: 10, padding: "9px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 13, outline: "none", cursor: "pointer" } as const;

export default function PostingTracker() {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterClient, setFilterClient] = useState("All");
  const [clientList, setClientList] = useState<string[]>([]);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [{ data: cal }, { data: clients }] = await Promise.all([
      supabase
        .from("content_calendar")
        .select("id, client, content_type, scheduled_date, title, status")
        .in("status", ["Posted", "Scheduled"])
        .in("content_type", ["Reel", "Post", "Carousel"])
        .order("scheduled_date", { ascending: false }),
      supabase.from("clients").select("name").eq("status", "Active").order("name"),
    ]);
    if (cal) setEntries(cal);
    if (clients) setClientList(clients.map((c: any) => c.name));
    setLoading(false);
  };

  const trackerData = useMemo(() => {
    const activeSet = new Set(clientList);
    const clientNames = [...new Set(entries.map((e: any) => e.client))]
      .filter(Boolean)
      .filter(name => activeSet.has(name))
      .sort() as string[];

    return clientNames.map(client => {
      // Only take entries with a real, parseable date — then sort newest first
      const clientEntries = entries
        .filter((e: any) => e.client === client && e.scheduled_date && !isNaN(new Date(e.scheduled_date).getTime()))
        .sort((a: any, b: any) => new Date(b.scheduled_date).getTime() - new Date(a.scheduled_date).getTime());

      const last = clientEntries[0] || null;
      const secondLast = clientEntries[1] || null;
      let gapDays: number | null = null;
      if (last && secondLast) {
        const ms = new Date(last.scheduled_date).getTime() - new Date(secondLast.scheduled_date).getTime();
        gapDays = Math.abs(Math.round(ms / 86400000));
      }
      const reels      = clientEntries.filter((e: any) => e.content_type === "Reel").length;
      const reelsSched = clientEntries.filter((e: any) => e.content_type === "Reel"     && e.status === "Scheduled").length;
      const posts      = clientEntries.filter((e: any) => e.content_type === "Post").length;
      const postsSched = clientEntries.filter((e: any) => e.content_type === "Post"     && e.status === "Scheduled").length;
      const carousels      = clientEntries.filter((e: any) => e.content_type === "Carousel").length;
      const carouselsSched = clientEntries.filter((e: any) => e.content_type === "Carousel" && e.status === "Scheduled").length;
      return { client, last, secondLast, gapDays, total: clientEntries.length, reels, reelsSched, posts, postsSched, carousels, carouselsSched };
    }).filter(d => d.last !== null);
  }, [entries, clientList]);

  const displayed = filterClient === "All"
    ? trackerData
    : trackerData.filter(d => d.client === filterClient);

  const stats = useMemo(() => ({
    total: trackerData.length,
    consistent: trackerData.filter(d => d.gapDays !== null && d.gapDays <= 7).length,
    lagging: trackerData.filter(d => d.gapDays !== null && d.gapDays > 7 && d.gapDays <= 14).length,
    irregular: trackerData.filter(d => d.gapDays !== null && d.gapDays > 14).length,
  }), [trackerData]);

  const formatDate = (d: string) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-").map(Number);
    return new Date(y, m - 1, day).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  };

  const TYPE_COLORS: Record<string, { bg: string; color: string; border: string }> = {
    Reel:     { bg: "rgba(74,222,128,0.15)",  color: "#4ade80", border: "rgba(74,222,128,0.35)"  },
    Post:     { bg: "rgba(249,115,22,0.15)",  color: "#f97316", border: "rgba(249,115,22,0.35)"  },
    Carousel: { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24", border: "rgba(251,191,36,0.35)"  },
  };

  const typeBadge = (type: string) => {
    const c = TYPE_COLORS[type] || { bg: "rgba(128,128,128,0.12)", color: "var(--text3)", border: "rgba(128,128,128,0.25)" };
    return (
      <span style={{
        background: c.bg, color: c.color, border: `1px solid ${c.border}`,
        padding: "2px 9px", borderRadius: 10, fontSize: 11, fontWeight: 700
      }}>
        {type}
      </span>
    );
  };

  const gapStyle = (days: number | null) => {
    if (days === null) return { color: "var(--text3)", bg: "transparent", border: "none", label: "—" };
    if (days <= 7) return { color: "var(--green)", bg: "var(--green-bg)", border: "1px solid var(--green-border)", label: `${days}d` };
    if (days <= 14) return { color: "var(--amber)", bg: "var(--amber-bg)", border: "1px solid var(--amber-border)", label: `${days}d` };
    return { color: "var(--red)", bg: "var(--red-bg)", border: "1px solid var(--red-border)", label: `${days}d` };
  };

  const statusBadge = (days: number | null) => {
    if (days === null) return <span style={{ fontSize: 12, color: "var(--text3)" }}>Insufficient data</span>;
    if (days <= 7) return <span style={{ background: "var(--green-bg)", color: "var(--green)", border: "1px solid var(--green-border)", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Consistent</span>;
    if (days <= 14) return <span style={{ background: "var(--amber-bg)", color: "var(--amber)", border: "1px solid var(--amber-border)", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Lagging</span>;
    return <span style={{ background: "var(--red-bg)", color: "var(--red)", border: "1px solid var(--red-border)", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>Irregular</span>;
  };

  return (
    <div className="page-wrap">

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.6px" }}>Posting Tracker</div>
          <div style={{ fontSize: 15, color: "var(--text2)", marginTop: 6 }}>Gap between last &amp; second-last Reel/Post per brand</div>
        </div>
        <button onClick={fetchData} style={{ padding: "10px 18px", fontSize: 14, background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text2)", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
          <i className="ti ti-refresh" /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Brands Tracked", val: stats.total, color: "var(--text2)", icon: "ti-building-store" },
          { label: "Consistent (≤7d)", val: stats.consistent, color: "var(--green)", icon: "ti-circle-check" },
          { label: "Lagging (8–14d)", val: stats.lagging, color: "var(--amber)", icon: "ti-clock" },
          { label: "Irregular (>14d)", val: stats.irregular, color: "var(--red)", icon: "ti-alert-circle" },
        ].map((s, i) => (
          <div key={i} className="stat-card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px" }}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: `${s.color}18`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 18 }} />
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color, letterSpacing: "-0.6px", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 4 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={SS}>
          <option value="All">All Clients</option>
          {clientList.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} />
          <div style={{ marginTop: 12, fontSize: 15 }}>Loading tracker...</div>
        </div>
      ) : (
        <div style={{ borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden", background: "var(--glass)" }}>
          <div className="table-scroll">
            <table className="crm-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 140 }}>Brand</th>
                  <th style={{ minWidth: 200 }}>Last Post</th>
                  <th style={{ minWidth: 200 }}>Second Last Post</th>
                  <th style={{ minWidth: 80, textAlign: "center" }}>Gap</th>
                  <th style={{ minWidth: 130 }}>Status</th>
                  <th style={{ minWidth: 200 }}>Posted Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map(d => {
                  const gs = gapStyle(d.gapDays);
                  return (
                    <tr key={d.client}>
                      <td>
                        <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{d.client}</div>
                      </td>
                      <td>
                        {d.last ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                              {typeBadge(d.last.content_type)}
                              <span style={{ fontSize: 12, color: "var(--text3)" }}>{formatDate(d.last.scheduled_date)}</span>
                              {d.last.status === "Scheduled" && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: "rgba(146,64,14,0.15)", color: "#92400e", border: "1px solid rgba(146,64,14,0.35)" }}>
                                  📅 Scheduled
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, maxWidth: 190, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d.last.title}>
                              {d.last.title}
                            </div>
                          </div>
                        ) : <span style={{ fontSize: 13, color: "var(--text3)" }}>No posts yet</span>}
                      </td>
                      <td>
                        {d.secondLast ? (
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                              {typeBadge(d.secondLast.content_type)}
                              <span style={{ fontSize: 12, color: "var(--text3)" }}>{formatDate(d.secondLast.scheduled_date)}</span>
                              {d.secondLast.status === "Scheduled" && (
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: "rgba(146,64,14,0.15)", color: "#92400e", border: "1px solid rgba(146,64,14,0.35)" }}>
                                  📅 Scheduled
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, maxWidth: 190, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d.secondLast.title}>
                              {d.secondLast.title}
                            </div>
                          </div>
                        ) : <span style={{ fontSize: 13, color: "var(--text3)" }}>—</span>}
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {d.gapDays !== null ? (
                          <span style={{ background: gs.bg, color: gs.color, border: gs.border, padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {gs.label}
                          </span>
                        ) : <span style={{ color: "var(--text3)", fontSize: 13 }}>—</span>}
                      </td>
                      <td>{statusBadge(d.gapDays)}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          {d.reels > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.35)", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {d.reels} Reel{d.reels > 1 ? "s" : ""}
                              </span>
                              {d.reelsSched > 0 && <span style={{ fontSize: 10, color: "#92400e", whiteSpace: "nowrap" }}>📅 {d.reelsSched} sched.</span>}
                            </div>
                          )}
                          {d.posts > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ background: "rgba(249,115,22,0.15)", color: "#f97316", border: "1px solid rgba(249,115,22,0.35)", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {d.posts} Post{d.posts > 1 ? "s" : ""}
                              </span>
                              {d.postsSched > 0 && <span style={{ fontSize: 10, color: "#92400e", whiteSpace: "nowrap" }}>📅 {d.postsSched} sched.</span>}
                            </div>
                          )}
                          {d.carousels > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                                {d.carousels} Carousel{d.carousels > 1 ? "s" : ""}
                              </span>
                              {d.carouselsSched > 0 && <span style={{ fontSize: 10, color: "#92400e", whiteSpace: "nowrap" }}>📅 {d.carouselsSched} sched.</span>}
                            </div>
                          )}
                          {d.total === 0 && <span style={{ color: "var(--text3)", fontSize: 13 }}>—</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {displayed.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
              <i className="ti ti-chart-line" style={{ fontSize: 40, opacity: .2 }} />
              <div style={{ marginTop: 12, fontSize: 15 }}>
                {trackerData.length === 0 ? "No Posted Reels or Posts tracked yet in Content Calendar" : "No brands match the filter"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 24, marginTop: 18, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text3)" }}>
          <i className="ti ti-info-circle" style={{ marginRight: 5 }} />
          Gap is calculated between the two most recently posted Reels or Posts per brand
        </div>
        {[
          { color: "var(--green)", label: "Consistent (≤7 days)" },
          { color: "var(--amber)", label: "Lagging (8–14 days)" },
          { color: "var(--red)", label: "Irregular (>14 days)" },
        ].map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text2)" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />{l.label}
          </div>
        ))}
      </div>
    </div>
  );
}
