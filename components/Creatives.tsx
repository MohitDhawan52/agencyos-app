"use client";
import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const PLATFORMS = ["Meta Ads", "Google Ads", "HotStar Ads", "ChatGPT Ads", "Instagram", "Facebook", "YouTube"];

const PIPELINE_STAGES = ["Draft", "Internal Review", "Client Review", "Approved", "Posted"] as const;
type PipelineStage = typeof PIPELINE_STAGES[number];
const STAGE_STYLE: Record<PipelineStage, { color: string; bg: string; border: string }> = {
  "Draft":           { color: "#94a3b8", bg: "rgba(148,163,184,0.1)",  border: "rgba(148,163,184,0.25)" },
  "Internal Review": { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.3)" },
  "Client Review":   { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  border: "rgba(96,165,250,0.3)" },
  "Approved":        { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.3)" },
  "Posted":          { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.3)" },
};

const PLATFORM_STYLE: Record<string, { color: string; bg: string; icon: string }> = {
  "Meta Ads":    { color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: "ti-brand-meta" },
  "Google Ads":  { color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: "ti-brand-google" },
  "HotStar Ads": { color: "#a78bfa", bg: "rgba(167,139,250,0.12)", icon: "ti-device-tv" },
  "ChatGPT Ads": { color: "#34d399", bg: "rgba(52,211,153,0.12)",  icon: "ti-robot" },
  "Instagram":   { color: "#f472b6", bg: "rgba(244,114,182,0.12)", icon: "ti-brand-instagram" },
  "Facebook":    { color: "#818cf8", bg: "rgba(129,140,248,0.12)", icon: "ti-brand-facebook" },
  "YouTube":     { color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: "ti-brand-youtube" },
};

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; dot: string }> = {
  working:     { color: "#4ade80", bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.25)",  dot: "#4ade80" },
  testing:     { color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  border: "rgba(251,191,36,0.25)",  dot: "#fbbf24" },
  not_working: { color: "#f87171", bg: "rgba(248,113,113,0.12)", border: "rgba(248,113,113,0.25)", dot: "#f87171" },
};

const STATUS_LABELS: Record<string, string> = {
  working: "Working", testing: "Testing", not_working: "Not Working",
};

const emptyForm = {
  title: "", type: "graphic" as "graphic" | "video",
  creator_name: "", client: "",
  platforms: [] as string[],
  status: "testing" as "working" | "testing" | "not_working",
  notes: "", file_url: "",
};

interface CreativesProps { profile: any; isAdmin: boolean; }

export default function Creatives({ profile, isAdmin }: CreativesProps) {
  const [creatives, setCreatives] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Quick-status update panel (non-modal)
  const [statusPanel, setStatusPanel] = useState<string | null>(null);
  const [panelNotes, setPanelNotes] = useState("");
  const [panelStatus, setPanelStatus] = useState("testing");
  const [panelSaving, setPanelSaving] = useState(false);

  const [viewMode, setViewMode] = useState<"grid" | "pipeline">("grid");

  // Filters
  const [filterType, setFilterType]     = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [filterCreator, setFilterCreator]   = useState("All");
  const [searchQ, setSearchQ] = useState("");

  useEffect(() => {
    fetchAll();
    const ch = supabase.channel("creatives-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "creatives" }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const fetchAll = async () => {
    const [{ data: c }, { data: p }] = await Promise.all([
      supabase.from("creatives").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("name").neq("status", "left"),
    ]);
    if (c) setCreatives(c);
    if (p) setTeamMembers(p.map((x: any) => x.name));
    setLoading(false);
  };

  const filtered = creatives
    .filter(c => filterType === "All" || c.type === filterType.toLowerCase())
    .filter(c => filterStatus === "All" || c.status === filterStatus)
    .filter(c => filterPlatform === "All" || (c.platforms || []).includes(filterPlatform))
    .filter(c => filterCreator === "All" || c.creator_name === filterCreator)
    .filter(c => !searchQ || c.title?.toLowerCase().includes(searchQ.toLowerCase()) || c.client?.toLowerCase().includes(searchQ.toLowerCase()));

  const counts = {
    working:     creatives.filter(c => c.status === "working").length,
    testing:     creatives.filter(c => c.status === "testing").length,
    not_working: creatives.filter(c => c.status === "not_working").length,
  };

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, creator_name: isAdmin ? "" : (profile?.name || "") });
    setShowModal(true);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({ ...c, platforms: c.platforms || [] });
    setShowModal(true);
  };

  const togglePlatform = (p: string) => {
    setForm((f: any) => ({
      ...f,
      platforms: f.platforms.includes(p)
        ? f.platforms.filter((x: string) => x !== p)
        : [...f.platforms, p],
    }));
  };

  const save = async () => {
    if (!form.title || !form.creator_name) return;
    setSaving(true);
    const payload = {
      title: form.title.trim(), type: form.type,
      creator_name: form.creator_name.trim(), client: form.client?.trim() || null,
      platforms: form.platforms, status: form.status,
      notes: form.notes?.trim() || null, file_url: form.file_url?.trim() || null,
    };
    if (editingId) {
      await supabase.from("creatives").update(payload).eq("id", editingId);
    } else {
      await supabase.from("creatives").insert([payload]);
    }
    setSaving(false);
    setShowModal(false);
    fetchAll();
  };

  const deleteCreative = async (id: string) => {
    await supabase.from("creatives").delete().eq("id", id);
    setDeleteConfirm(null);
    fetchAll();
  };

  const moveStage = async (id: string, direction: "next" | "prev", currentStage: string) => {
    const idx = PIPELINE_STAGES.indexOf(currentStage as PipelineStage);
    const newIdx = direction === "next" ? idx + 1 : idx - 1;
    if (newIdx < 0 || newIdx >= PIPELINE_STAGES.length) return;
    await supabase.from("creatives").update({ approval_stage: PIPELINE_STAGES[newIdx] }).eq("id", id);
    fetchAll();
  };

  const incrementRevision = async (id: string, current: number) => {
    const newCount = (current || 0) + 1;
    await supabase.from("creatives").update({ revision_count: newCount }).eq("id", id);
    fetchAll();
  };

  const openStatusPanel = (c: any) => {
    setStatusPanel(c.id);
    setPanelStatus(c.status);
    setPanelNotes(c.notes || "");
  };

  const saveStatus = async () => {
    if (!statusPanel) return;
    setPanelSaving(true);
    await supabase.from("creatives").update({ status: panelStatus, notes: panelNotes.trim() || null }).eq("id", statusPanel);
    setPanelSaving(false);
    setStatusPanel(null);
    fetchAll();
  };

  const IS: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1px solid var(--border2)", background: "var(--glass2)",
    color: "var(--text)", fontSize: 14, fontFamily: "inherit",
    boxSizing: "border-box" as const,
  };
  const LS: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "var(--text3)",
    textTransform: "uppercase", letterSpacing: ".5px",
    display: "block", marginBottom: 6,
  };

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)" }}>
      <i className="ti ti-loader" style={{ fontSize: 32, opacity: .3 }} />
    </div>
  );

  return (
    <div className="page-wrap">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px", margin: 0 }}>
            <i className="ti ti-photo-video" style={{ marginRight: 10, color: "var(--accent2)" }} />
            Creatives
          </h1>
          <p style={{ fontSize: 14, color: "var(--text3)", marginTop: 6, marginBottom: 0 }}>
            Track which graphics and videos are performing on ads and social
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, padding: 3 }}>
            {(["grid", "pipeline"] as const).map(m => (
              <button key={m} onClick={() => setViewMode(m)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 5, background: viewMode === m ? "rgba(255,255,255,0.1)" : "transparent", color: viewMode === m ? "var(--text)" : "var(--text3)", transition: "all .15s" }}>
                <i className={`ti ${m === "grid" ? "ti-layout-grid" : "ti-columns"}`} /> {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          {isAdmin && (
            <button onClick={openAdd} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", background: "var(--accent)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14 }}>
              <i className="ti ti-plus" /> Add Creative
            </button>
          )}
        </div>
      </div>

      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        {(["working", "testing", "not_working"] as const).map(s => (
          <div key={s} className="stat-card" style={{ padding: "16px 20px", cursor: "pointer", borderColor: filterStatus === s ? STATUS_STYLE[s].border : undefined }}
            onClick={() => setFilterStatus(filterStatus === s ? "All" : s)}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: STATUS_STYLE[s].dot, flexShrink: 0 }} />
              <div style={{ fontSize: 11, color: "var(--text3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>{STATUS_LABELS[s]}</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: STATUS_STYLE[s].color, letterSpacing: "-0.8px", marginTop: 6 }}>{counts[s]}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search creatives…" style={{ ...IS, width: 200, flex: "0 0 auto" }} />

        {["All", "Graphic", "Video"].map(t => (
          <button key={t} onClick={() => setFilterType(t)} style={{ padding: "8px 14px", borderRadius: 20, border: "1px solid var(--border2)", background: filterType === t ? "rgba(109,93,252,0.1)" : "var(--glass2)", color: filterType === t ? "var(--accent2)" : "var(--text2)", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5 }}>
            {t === "Graphic" && <i className="ti ti-photo" />}
            {t === "Video"   && <i className="ti ti-video" />}
            {t}
          </button>
        ))}

        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...IS, width: "auto", flex: "0 0 auto" }}>
          <option value="All">All Status</option>
          <option value="working">Working</option>
          <option value="testing">Testing</option>
          <option value="not_working">Not Working</option>
        </select>

        <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)} style={{ ...IS, width: "auto", flex: "0 0 auto" }}>
          <option value="All">All Platforms</option>
          {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <select value={filterCreator} onChange={e => setFilterCreator(e.target.value)} style={{ ...IS, width: "auto", flex: "0 0 auto" }}>
          <option value="All">All Creators</option>
          {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
        </select>

        {(filterType !== "All" || filterStatus !== "All" || filterPlatform !== "All" || filterCreator !== "All" || searchQ) && (
          <button onClick={() => { setFilterType("All"); setFilterStatus("All"); setFilterPlatform("All"); setFilterCreator("All"); setSearchQ(""); }}
            style={{ padding: "8px 12px", borderRadius: 20, border: "1px solid var(--border2)", background: "transparent", color: "var(--text3)", cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>
            <i className="ti ti-x" /> Clear
          </button>
        )}
      </div>

      {/* Pipeline View */}
      {viewMode === "pipeline" && (
        <div style={{ overflowX: "auto", paddingBottom: 12 }}>
          <div style={{ display: "flex", gap: 12, minWidth: "max-content", alignItems: "flex-start" }}>
            {PIPELINE_STAGES.map(stage => {
              const stageCreatives = creatives.filter(c => (c.approval_stage || "Draft") === stage);
              const ss2 = STAGE_STYLE[stage];
              return (
                <div key={stage} style={{ width: 240, flexShrink: 0 }}>
                  {/* Column header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px 10px 0 0", background: ss2.bg, border: `1px solid ${ss2.border}`, borderBottom: "none", marginBottom: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: ss2.color }}>{stage}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: ss2.border, color: ss2.color, borderRadius: 20, padding: "1px 8px" }}>{stageCreatives.length}</span>
                  </div>
                  {/* Cards */}
                  <div style={{ border: `1px solid ${ss2.border}`, borderTop: "none", borderRadius: "0 0 10px 10px", minHeight: 80, display: "flex", flexDirection: "column", gap: 0, background: "rgba(255,255,255,0.01)", overflow: "hidden" }}>
                    {stageCreatives.length === 0 ? (
                      <div style={{ padding: "20px 12px", textAlign: "center", color: "var(--text3)", fontSize: 12 }}>Empty</div>
                    ) : stageCreatives.map((c, i) => {
                      const stageIdx = PIPELINE_STAGES.indexOf(stage);
                      const revCount = c.revision_count || 0;
                      return (
                        <div key={c.id} style={{ padding: "10px 12px", borderTop: i > 0 ? "1px solid var(--border)" : "none", background: "transparent" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 4, lineHeight: 1.3 }}>{c.title}</div>
                          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>
                            {c.client && <span style={{ marginRight: 6 }}>{c.client}</span>}
                            <span>{c.creator_name}</span>
                          </div>
                          {revCount > 0 && (
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: revCount > 3 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)", color: revCount > 3 ? "#f87171" : "var(--text3)", border: `1px solid ${revCount > 3 ? "rgba(239,68,68,0.3)" : "var(--border2)"}`, marginBottom: 6 }}>
                              {revCount > 3 && <i className="ti ti-alert-triangle" />} Rev {revCount}
                            </div>
                          )}
                          {isAdmin && (
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => moveStage(c.id, "prev", stage)} disabled={stageIdx === 0} style={{ flex: 1, padding: "4px 0", borderRadius: 6, border: "1px solid var(--border2)", background: "transparent", color: stageIdx === 0 ? "var(--border)" : "var(--text3)", cursor: stageIdx === 0 ? "not-allowed" : "pointer", fontSize: 10, fontFamily: "inherit" }}>← Back</button>
                              <button onClick={() => moveStage(c.id, "next", stage)} disabled={stageIdx === PIPELINE_STAGES.length - 1} style={{ flex: 1, padding: "4px 0", borderRadius: 6, border: `1px solid ${stageIdx < PIPELINE_STAGES.length - 1 ? ss2.border : "var(--border2)"}`, background: stageIdx < PIPELINE_STAGES.length - 1 ? ss2.bg : "transparent", color: stageIdx < PIPELINE_STAGES.length - 1 ? ss2.color : "var(--border)", cursor: stageIdx === PIPELINE_STAGES.length - 1 ? "not-allowed" : "pointer", fontSize: 10, fontWeight: 700, fontFamily: "inherit" }}>Next →</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Card grid */}
      {viewMode === "grid" && (filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text3)" }}>
          <i className="ti ti-photo-video" style={{ fontSize: 48, opacity: .15 }} />
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 600 }}>No creatives yet</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>{isAdmin ? "Add your first creative to start tracking performance." : "Creatives added by admin will appear here."}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 16 }}>
          {filtered.map(c => {
            const ss = STATUS_STYLE[c.status] || STATUS_STYLE.testing;
            return (
              <div key={c.id} className="crm-card" style={{ padding: 0, overflow: "hidden", borderColor: statusPanel === c.id ? "var(--accent2)" : undefined }}>
                {/* Thumbnail area */}
                <div style={{ height: 110, background: c.type === "video" ? "linear-gradient(135deg, rgba(244,114,182,0.15) 0%, rgba(251,191,36,0.15) 100%)" : "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.12) 100%)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {c.file_url ? (
                    <a href={c.file_url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textDecoration: "none" }}>
                      <i className={`ti ${c.type === "video" ? "ti-video" : "ti-photo"}`} style={{ fontSize: 32, color: c.type === "video" ? "#f472b6" : "#a78bfa", opacity: .6 }} />
                      <span style={{ fontSize: 11, color: "var(--text3)" }}>Open file ↗</span>
                    </a>
                  ) : (
                    <i className={`ti ${c.type === "video" ? "ti-video" : "ti-photo"}`} style={{ fontSize: 36, color: c.type === "video" ? "#f472b6" : "#a78bfa", opacity: .35 }} />
                  )}
                  {/* Type badge */}
                  <div style={{ position: "absolute", top: 8, left: 8, padding: "3px 9px", borderRadius: 10, fontSize: 10, fontWeight: 700, background: c.type === "video" ? "rgba(244,114,182,0.2)" : "rgba(99,102,241,0.2)", color: c.type === "video" ? "#f472b6" : "#818cf8", border: `1px solid ${c.type === "video" ? "rgba(244,114,182,0.35)" : "rgba(99,102,241,0.35)"}` }}>
                    {c.type === "video" ? "Video" : "Graphic"}
                  </div>
                  {/* Status dot */}
                  <div style={{ position: "absolute", top: 10, right: 10, width: 10, height: 10, borderRadius: "50%", background: ss.dot, boxShadow: `0 0 6px ${ss.dot}` }} />
                </div>

                {/* Body */}
                <div style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>
                    <i className="ti ti-user" style={{ marginRight: 4 }} />{c.creator_name}
                    {c.client && <> · <i className="ti ti-building-store" style={{ marginLeft: 6, marginRight: 4 }} />{c.client}</>}
                  </div>

                  {/* Platforms */}
                  {(c.platforms || []).length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
                      {(c.platforms as string[]).map(p => {
                        const ps = PLATFORM_STYLE[p] || { color: "var(--text2)", bg: "var(--glass2)", icon: "ti-world" };
                        return (
                          <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 8, background: ps.bg, color: ps.color, border: `1px solid ${ps.color}33` }}>
                            <i className={`ti ${ps.icon}`} />{p}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Approval stage + revision */}
                  {(() => {
                    const stage = (c.approval_stage || "Draft") as PipelineStage;
                    const ss2 = STAGE_STYLE[stage] || STAGE_STYLE["Draft"];
                    const revCount = c.revision_count || 0;
                    const stageIdx = PIPELINE_STAGES.indexOf(stage);
                    return (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: ss2.bg, color: ss2.color, border: `1px solid ${ss2.border}` }}>
                            {stage}
                          </span>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <span title="Revision count" style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: revCount > 3 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.05)", color: revCount > 3 ? "#f87171" : "var(--text3)", border: `1px solid ${revCount > 3 ? "rgba(239,68,68,0.3)" : "var(--border2)"}`, cursor: "default" }}>
                              {revCount > 3 && <i className="ti ti-alert-triangle" style={{ marginRight: 3 }} />}Rev {revCount}
                            </span>
                            {isAdmin && <button onClick={() => incrementRevision(c.id, revCount)} title="Add revision" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 6, padding: "2px 6px", color: "var(--text3)", cursor: "pointer", fontSize: 11 }}>+1</button>}
                          </div>
                        </div>
                        {isAdmin && (
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => moveStage(c.id, "prev", stage)} disabled={stageIdx === 0} style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "1px solid var(--border2)", background: "transparent", color: stageIdx === 0 ? "var(--border2)" : "var(--text3)", cursor: stageIdx === 0 ? "not-allowed" : "pointer", fontSize: 11, fontFamily: "inherit" }}>
                              ← Back
                            </button>
                            <button onClick={() => moveStage(c.id, "next", stage)} disabled={stageIdx === PIPELINE_STAGES.length - 1} style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: `1px solid ${stageIdx < PIPELINE_STAGES.length - 1 ? ss2.border : "var(--border2)"}`, background: stageIdx < PIPELINE_STAGES.length - 1 ? ss2.bg : "transparent", color: stageIdx < PIPELINE_STAGES.length - 1 ? ss2.color : "var(--border2)", cursor: stageIdx === PIPELINE_STAGES.length - 1 ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}>
                              {stageIdx < PIPELINE_STAGES.length - 1 ? `→ ${PIPELINE_STAGES[stageIdx + 1]}` : "✓ Posted"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Ad Status */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: c.notes ? 8 : 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: ss.bg, color: ss.color, border: `1px solid ${ss.border}` }}>
                      ● {STATUS_LABELS[c.status]}
                    </span>
                    <div style={{ display: "flex", gap: 5 }}>
                      {isAdmin && (
                        <button onClick={() => openStatusPanel(c)} title="Update status" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 7, padding: "5px 8px", color: "var(--accent2)", cursor: "pointer", fontSize: 13 }}>
                          <i className="ti ti-chart-line" />
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => openEdit(c)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 7, padding: "5px 8px", color: "var(--blue)", cursor: "pointer", fontSize: 13 }}>
                          <i className="ti ti-pencil" />
                        </button>
                      )}
                      {isAdmin && (
                        <button onClick={() => setDeleteConfirm(c.id)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 7, padding: "5px 8px", color: "var(--red)", cursor: "pointer", fontSize: 13 }}>
                          <i className="ti ti-trash" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Notes */}
                  {c.notes && (
                    <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)", fontStyle: "italic", lineHeight: 1.5 }}>
                      <i className="ti ti-notes" style={{ marginRight: 4, opacity: .5 }} />{c.notes}
                    </div>
                  )}

                  {/* Inline status panel */}
                  {statusPanel === c.id && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
                        {(["working", "testing", "not_working"] as const).map(s => (
                          <button key={s} onClick={() => setPanelStatus(s)} style={{ flex: 1, padding: "7px 4px", borderRadius: 8, border: `1px solid ${panelStatus === s ? STATUS_STYLE[s].border : "var(--border2)"}`, background: panelStatus === s ? STATUS_STYLE[s].bg : "transparent", color: panelStatus === s ? STATUS_STYLE[s].color : "var(--text3)", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit" }}>
                            {STATUS_LABELS[s]}
                          </button>
                        ))}
                      </div>
                      <textarea value={panelNotes} onChange={e => setPanelNotes(e.target.value)} placeholder="Add notes — CTR, feedback, reason…" rows={2}
                        style={{ ...IS, resize: "none", marginBottom: 8, fontSize: 12 }} />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setStatusPanel(null)} style={{ flex: 1, padding: 8, borderRadius: 8, border: "1px solid var(--border2)", background: "transparent", color: "var(--text3)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Cancel</button>
                        <button onClick={saveStatus} disabled={panelSaving} style={{ flex: 2, padding: 8, borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", opacity: panelSaving ? .6 : 1 }}>
                          {panelSaving ? "Saving…" : "Update Status"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Add / Edit Modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 520, maxWidth: "95vw" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>
                {editingId ? "Edit Creative" : "Add Creative"}
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border2)", borderRadius: 8, padding: "6px 10px", color: "var(--text2)", cursor: "pointer" }}>
                <i className="ti ti-x" />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Type toggle */}
              <div>
                <label style={LS}>Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["graphic", "video"] as const).map(t => (
                    <button key={t} onClick={() => setForm((f: any) => ({ ...f, type: t }))}
                      style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${form.type === t ? (t === "video" ? "rgba(244,114,182,0.4)" : "rgba(99,102,241,0.4)") : "var(--border2)"}`, background: form.type === t ? (t === "video" ? "rgba(244,114,182,0.12)" : "rgba(99,102,241,0.12)") : "transparent", color: form.type === t ? (t === "video" ? "#f472b6" : "#818cf8") : "var(--text3)", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                      <i className={`ti ${t === "video" ? "ti-video" : "ti-photo"}`} />
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={LS}>Title</label>
                <input value={form.title} onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))} placeholder="E.g. Summer sale carousel" style={IS} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={LS}>Creator</label>
                  <select value={form.creator_name} onChange={e => setForm((f: any) => ({ ...f, creator_name: e.target.value }))} style={IS}>
                    <option value="">Select…</option>
                    {teamMembers.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LS}>Client</label>
                  <input value={form.client} onChange={e => setForm((f: any) => ({ ...f, client: e.target.value }))} placeholder="Client or Internal" style={IS} />
                </div>
              </div>

              {/* Platforms */}
              <div>
                <label style={LS}>Platforms</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {PLATFORMS.map(p => {
                    const ps = PLATFORM_STYLE[p];
                    const selected = form.platforms.includes(p);
                    return (
                      <button key={p} onClick={() => togglePlatform(p)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 20, border: `1px solid ${selected ? ps.color + "55" : "var(--border2)"}`, background: selected ? ps.bg : "transparent", color: selected ? ps.color : "var(--text3)", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>
                        <i className={`ti ${ps.icon}`} />{p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Status */}
              <div>
                <label style={LS}>Status</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["working", "testing", "not_working"] as const).map(s => (
                    <button key={s} onClick={() => setForm((f: any) => ({ ...f, status: s }))}
                      style={{ flex: 1, padding: "9px 4px", borderRadius: 10, border: `1px solid ${form.status === s ? STATUS_STYLE[s].border : "var(--border2)"}`, background: form.status === s ? STATUS_STYLE[s].bg : "transparent", color: form.status === s ? STATUS_STYLE[s].color : "var(--text3)", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={LS}>Notes</label>
                <textarea value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} placeholder="Why it's working or not — CTR, feedback, results…" rows={2}
                  style={{ ...IS, resize: "none" }} />
              </div>

              <div>
                <label style={LS}>File Link (Drive / Canva / optional)</label>
                <input value={form.file_url} onChange={e => setForm((f: any) => ({ ...f, file_url: e.target.value }))} placeholder="https://drive.google.com/…" style={IS} />
              </div>
            </div>

            <button onClick={save} disabled={saving || !form.title || !form.creator_name}
              style={{ width: "100%", padding: 13, marginTop: 20, background: "var(--accent)", border: "none", borderRadius: 10, color: "#fff", cursor: (saving || !form.title || !form.creator_name) ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 15, fontFamily: "inherit", opacity: (saving || !form.title || !form.creator_name) ? .5 : 1 }}>
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Creative"}
            </button>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 360, maxWidth: "95vw", textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>🗑️</div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Delete Creative?</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 24 }}>This will permanently remove the creative and its performance record.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11, fontSize: 14 }}>Cancel</button>
              <button onClick={() => deleteCreative(deleteConfirm)} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
