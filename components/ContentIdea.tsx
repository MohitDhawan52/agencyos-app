"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const TAB_COLORS = [
  { bg: "rgba(96,165,250,0.18)",  border: "rgba(96,165,250,0.4)",  text: "#3b82f6" },
  { bg: "rgba(244,114,182,0.18)", border: "rgba(244,114,182,0.4)", text: "#ec4899" },
  { bg: "rgba(251,191,36,0.18)",  border: "rgba(251,191,36,0.4)",  text: "#d97706" },
  { bg: "rgba(52,211,153,0.18)",  border: "rgba(52,211,153,0.4)",  text: "#059669" },
  { bg: "rgba(248,113,113,0.18)", border: "rgba(248,113,113,0.4)", text: "#dc2626" },
  { bg: "rgba(167,139,250,0.18)", border: "rgba(167,139,250,0.4)", text: "#7c3aed" },
  { bg: "rgba(251,146,60,0.18)",  border: "rgba(251,146,60,0.4)",  text: "#ea580c" },
  { bg: "rgba(34,211,238,0.18)",  border: "rgba(34,211,238,0.4)",  text: "#0891b2" },
];

const PILLAR_PALETTE = [
  "#60a5fa","#f472b6","#fbbf24","#34d399",
  "#f87171","#a78bfa","#fb923c","#22d3ee","#4ade80","#e879f9",
];

const AUTO_COLORS = [
  "#60a5fa","#f472b6","#fbbf24","#34d399","#f87171",
  "#a78bfa","#fb923c","#22d3ee","#4ade80","#e879f9","#94a3b8",
];

const emptyIdeaForm = { title: "", due: "", assignee: "", description: "" };
const emptyPillarForm = { name: "", description: "", color: "#60a5fa" };

const IS: React.CSSProperties = {
  width: "100%", background: "var(--input-bg)", border: "1px solid var(--border2)",
  borderRadius: 10, padding: "10px 14px", color: "var(--text)",
  fontFamily: "inherit", fontSize: 14, outline: "none",
};
const LS: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block",
  marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px",
};

function fmt(d: string) {
  return d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "";
}

export default function ContentIdea() {
  const [clients, setClients]             = useState<string[]>([]);
  const [assignees, setAssignees]         = useState<any[]>([]);
  const [ideas, setIdeas]                 = useState<any[]>([]);
  const [pillars, setPillars]             = useState<any[]>([]);
  const [selectedBrand, setSelectedBrand] = useState("All");
  const [currentMonth, setCurrentMonth]   = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading]             = useState(true);
  const [allSearch, setAllSearch]         = useState("");

  // Idea modal
  const [showIdeaModal, setShowIdeaModal]     = useState(false);
  const [ideaModalStep, setIdeaModalStep]     = useState<"form" | "assign">("form");
  const [ideaForm, setIdeaForm]               = useState<any>(emptyIdeaForm);
  const [ideaTargetPillar, setIdeaTargetPillar] = useState("");
  const [editingIdeaId, setEditingIdeaId]     = useState<string | null>(null);
  const [expandedIdea, setExpandedIdea]       = useState<any>(null);
  const [deleteIdeaInfo, setDeleteIdeaInfo]   = useState<string | null>(null);

  // Pillar modal
  const [showPillarModal, setShowPillarModal]   = useState(false);
  const [pillarForm, setPillarForm]             = useState<any>(emptyPillarForm);
  const [editingPillarId, setEditingPillarId]   = useState<string | null>(null);
  const [deletePillarInfo, setDeletePillarInfo] = useState<{ id: string; name: string } | null>(null);

  // Inline description edit
  const [editingDesc, setEditingDesc] = useState<string | null>(null);
  const [descDraft, setDescDraft]     = useState("");

  const rteRef  = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const scrollTabs = (dir: number) =>
    tabsRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });

  useEffect(() => { fetchClients(); fetchAssignees(); }, []);
  useEffect(() => { fetchIdeas(); }, [selectedBrand]);
  useEffect(() => { fetchPillars(); }, [selectedBrand, currentMonth]);

  useEffect(() => {
    if (showIdeaModal && ideaModalStep === "form") {
      setTimeout(() => {
        if (rteRef.current) rteRef.current.innerHTML = ideaForm.description || "";
      }, 30);
    }
  }, [showIdeaModal, ideaModalStep]);

  const fetchClients = async () => {
    const { data } = await supabase.from("clients").select("name").eq("status", "Active").order("name");
    setClients(data ? data.map((c: any) => c.name) : []);
  };

  const fetchAssignees = async () => {
    const { data } = await supabase.from("profiles").select("id, name, color").neq("status", "left").order("created_at");
    if (data) setAssignees(data);
  };

  const fetchPillars = async () => {
    if (selectedBrand === "All") { setPillars([]); return; }
    const { data } = await supabase.from("content_pillars")
      .select("*").eq("client_name", selectedBrand).eq("month", currentMonth).order("position");
    setPillars(data || []);
  };

  const fetchIdeas = async () => {
    setLoading(true);
    let q = supabase.from("content_ideas").select("*").order("created_at", { ascending: true });
    if (selectedBrand !== "All") q = q.eq("client", selectedBrand);
    const { data } = await q;
    if (data) setIdeas(data);
    setLoading(false);
  };

  // ── Derived: merge defined pillars + implicit pillars from existing idea data ──
  const brandIdeas = ideas.filter(i => selectedBrand === "All" || i.client === selectedBrand);

  const definedPillarNames = new Set(pillars.map((p: any) => p.name));

  // Unique pillar names that exist on ideas but have no content_pillars entry yet
  const implicitPillarNames = [...new Set(
    brandIdeas.filter(i => i.pillar && !definedPillarNames.has(i.pillar)).map(i => i.pillar)
  )];

  // Full column list: defined (with description) + implicit (auto-generated from existing ideas)
  const allColumns = [
    ...pillars,
    ...implicitPillarNames.map((name, i) => ({
      id: `implicit-${name}`,
      name,
      description: "",
      color: AUTO_COLORS[(pillars.length + i) % AUTO_COLORS.length],
      implicit: true,
    })),
  ];

  // Ideas with no pillar or pillar = ""
  const unpilarredIdeas = brandIdeas.filter(i => !i.pillar);

  const ideasForColumn = (pillarName: string) =>
    brandIdeas.filter(i => i.pillar === pillarName);

  // ── Pillar CRUD ────────────────────────────────────────────────────────────
  const openAddPillar = () => {
    setPillarForm(emptyPillarForm);
    setEditingPillarId(null);
    setShowPillarModal(true);
  };

  const openEditPillar = (p: any) => {
    setPillarForm({ name: p.name, description: p.description || "", color: p.color || "#60a5fa" });
    setEditingPillarId(p.id);
    setShowPillarModal(true);
  };

  const savePillar = async () => {
    if (!pillarForm.name.trim() || selectedBrand === "All") return;
    if (editingPillarId) {
      await supabase.from("content_pillars").update({
        name: pillarForm.name, description: pillarForm.description, color: pillarForm.color,
      }).eq("id", editingPillarId);
    } else {
      await supabase.from("content_pillars").insert([{
        client_name: selectedBrand, month: currentMonth,
        name: pillarForm.name, description: pillarForm.description,
        color: pillarForm.color, position: pillars.length,
      }]);
    }
    setShowPillarModal(false); setEditingPillarId(null); setPillarForm(emptyPillarForm);
    fetchPillars();
  };

  const deletePillar = async (id: string) => {
    await supabase.from("content_pillars").delete().eq("id", id);
    setDeletePillarInfo(null); fetchPillars();
  };

  const saveDescription = async (pillarId: string) => {
    await supabase.from("content_pillars").update({ description: descDraft }).eq("id", pillarId);
    setPillars(prev => prev.map((p: any) => p.id === pillarId ? { ...p, description: descDraft } : p));
    setEditingDesc(null);
  };

  const shiftMonth = (dir: number) => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const copyFromPrevMonth = async () => {
    const [y, m] = currentMonth.split("-").map(Number);
    const prevD = new Date(y, m - 2, 1);
    const prevMonth = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, "0")}`;
    const { data: prevPillars } = await supabase.from("content_pillars")
      .select("*").eq("client_name", selectedBrand).eq("month", prevMonth).order("position");
    if (!prevPillars?.length) return;
    await supabase.from("content_pillars").insert(
      prevPillars.map((p: any, i: number) => ({
        client_name: selectedBrand, month: currentMonth,
        name: p.name, description: p.description, color: p.color, position: i,
      }))
    );
    fetchPillars();
  };

  // Convert an implicit pillar into a real content_pillars entry
  const promoteImplicitPillar = async (name: string, color: string) => {
    await supabase.from("content_pillars").insert([{
      client_name: selectedBrand, month: currentMonth,
      name, description: "", color, position: pillars.length,
    }]);
    fetchPillars();
  };

  // ── Idea CRUD ──────────────────────────────────────────────────────────────
  const openAddIdea = (pillarName: string) => {
    setIdeaForm(emptyIdeaForm);
    setIdeaTargetPillar(pillarName);
    setEditingIdeaId(null);
    setIdeaModalStep("form");
    setShowIdeaModal(true);
  };

  const openEditIdea = (idea: any) => {
    setIdeaForm({
      title: idea.title || "", due: idea.due || "",
      assignee: idea.assignee || "", description: idea.description || "",
    });
    setIdeaTargetPillar(idea.pillar || "");
    setEditingIdeaId(idea.id);
    setIdeaModalStep("form");
    setShowIdeaModal(true);
    setExpandedIdea(null);
  };

  const saveIdea = async () => {
    if (!ideaForm.title.trim()) return;
    const payload = {
      title: ideaForm.title,
      client: selectedBrand === "All" ? (expandedIdea?.client || clients[0]) : selectedBrand,
      pillar: ideaTargetPillar,
      due: ideaForm.due,
      assignee: ideaForm.assignee,
      description: ideaForm.description,
      column_id: "active",
    };
    if (editingIdeaId) {
      await supabase.from("content_ideas").update(payload).eq("id", editingIdeaId);
    } else {
      await supabase.from("content_ideas").insert([payload]);
    }
    setShowIdeaModal(false); setEditingIdeaId(null); fetchIdeas();
  };

  const toggleDone = async (idea: any) => {
    const isDone = idea.column_id === "done";
    await supabase.from("content_ideas").update({ column_id: isDone ? "active" : "done" }).eq("id", idea.id);
    setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, column_id: isDone ? "active" : "done" } : i));
    if (expandedIdea?.id === idea.id) setExpandedIdea((p: any) => ({ ...p, column_id: isDone ? "active" : "done" }));
  };

  const deleteIdea = async (id: string) => {
    await supabase.from("content_ideas").delete().eq("id", id);
    setDeleteIdeaInfo(null); setExpandedIdea(null);
    setIdeas(prev => prev.filter(i => i.id !== id));
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const brandColor = (brand: string) => {
    const idx = clients.indexOf(brand);
    return TAB_COLORS[Math.abs(idx) % TAB_COLORS.length] || TAB_COLORS[0];
  };

  const assigneeColor = (name: string) =>
    assignees.find(a => a.name === name)?.color || "var(--accent)";

  // ── Brand tab strip (shared) ───────────────────────────────────────────────
  const TabStrip = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 18 }}>
      <button onClick={() => scrollTabs(-1)} style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: "var(--glass2)", border: "1px solid var(--border2)", color: "var(--text2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
        <i className="ti ti-chevron-left" />
      </button>
      <div ref={tabsRef} style={{ display: "flex", gap: 6, flex: 1, overflowX: "auto", flexWrap: "nowrap", scrollbarWidth: "none" as any }}>
        <button onClick={() => setSelectedBrand("All")}
          style={{ padding: "5px 14px", borderRadius: 20, border: "1px solid", whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, borderColor: selectedBrand === "All" ? "var(--accent-border)" : "var(--border2)", background: selectedBrand === "All" ? "var(--accent-bg)" : "var(--glass2)", color: selectedBrand === "All" ? "var(--accent2)" : "var(--text3)", flexShrink: 0 }}>
          All Brands
        </button>
        {clients.map((brand, idx) => {
          const c = TAB_COLORS[idx % TAB_COLORS.length];
          const isActive = selectedBrand === brand;
          return (
            <button key={brand} onClick={() => setSelectedBrand(brand)}
              style={{ padding: "5px 14px", borderRadius: 20, border: "1px solid", whiteSpace: "nowrap", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: isActive ? 700 : 600, flexShrink: 0, background: c.bg, borderColor: isActive ? c.text : c.border, color: c.text, boxShadow: isActive ? `0 0 0 1.5px ${c.text}` : "none" }}>
              {brand}
            </button>
          );
        })}
      </div>
      <button onClick={() => scrollTabs(1)} style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: "var(--glass2)", border: "1px solid var(--border2)", color: "var(--text2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
        <i className="ti ti-chevron-right" />
      </button>
    </div>
  );

  // ════════════════════════════════════════════════════════════════
  // ALL BRANDS VIEW — table of every idea across all clients
  // ════════════════════════════════════════════════════════════════
  if (selectedBrand === "All") {
    const filtered = ideas.filter(i =>
      !allSearch || i.title?.toLowerCase().includes(allSearch.toLowerCase()) ||
      i.client?.toLowerCase().includes(allSearch.toLowerCase()) ||
      i.pillar?.toLowerCase().includes(allSearch.toLowerCase()) ||
      i.assignee?.toLowerCase().includes(allSearch.toLowerCase())
    );

    // Group by client
    const byBrand: Record<string, any[]> = {};
    filtered.forEach(i => {
      if (!byBrand[i.client]) byBrand[i.client] = [];
      byBrand[i.client].push(i);
    });
    const brandList = Object.keys(byBrand).sort();

    const totalIdeas = ideas.length;
    const doneCount  = ideas.filter(i => i.column_id === "done").length;

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "28px 28px 0" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px" }}>Content Pillars</div>
            <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 3 }}>All brands · {totalIdeas} ideas · {doneCount} done</div>
          </div>
          <div style={{ position: "relative" }}>
            <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text3)", fontSize: 14 }} />
            <input value={allSearch} onChange={e => setAllSearch(e.target.value)} placeholder="Search ideas, brands, pillars…"
              style={{ ...IS, paddingLeft: 36, width: 260, borderRadius: 20 }} />
          </div>
        </div>

        <TabStrip />

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
            <i className="ti ti-loader" style={{ fontSize: 28, opacity: .4 }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 80, color: "var(--text3)" }}>
            <i className="ti ti-bulb" style={{ fontSize: 40, opacity: .2 }} />
            <div style={{ marginTop: 12, fontSize: 14 }}>No ideas yet. Select a brand to add content.</div>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", paddingBottom: 28 }}>
            {brandList.map(brand => {
              const bc = brandColor(brand);
              const brandIdeasList = byBrand[brand];
              const done = brandIdeasList.filter(i => i.column_id === "done").length;
              return (
                <div key={brand} style={{ marginBottom: 20 }}>
                  {/* Brand header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: bc.text }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: bc.text }}>{brand}</span>
                    <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: 2 }}>{brandIdeasList.length} ideas · {done} done</span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 4 }} />
                    <button onClick={() => setSelectedBrand(brand)}
                      style={{ fontSize: 11, fontWeight: 600, color: bc.text, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      View Pillars →
                    </button>
                  </div>

                  {/* Ideas table */}
                  <div style={{ background: "var(--glass)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                    {brandIdeasList.map((idea, idx) => {
                      const isDone = idea.column_id === "done";
                      return (
                        <div key={idea.id}
                          onClick={() => setExpandedIdea(idea)}
                          style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "11px 16px",
                            borderBottom: idx < brandIdeasList.length - 1 ? "1px solid var(--border)" : "none",
                            cursor: "pointer", transition: "background .1s",
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "transparent"}>

                          {/* Done toggle */}
                          <button onClick={e => { e.stopPropagation(); toggleDone(idea); }}
                            style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, border: isDone ? "none" : "1.5px solid var(--border2)", background: isDone ? "var(--green)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {isDone && <i className="ti ti-check" style={{ fontSize: 10, color: "#fff" }} />}
                          </button>

                          {/* Title */}
                          <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: isDone ? "var(--text3)" : "var(--text)", textDecoration: isDone ? "line-through" : "none", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {idea.title}
                          </div>

                          {/* Pillar tag */}
                          {idea.pillar && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: `${bc.bg}`, border: `1px solid ${bc.border}`, color: bc.text, flexShrink: 0, whiteSpace: "nowrap" }}>
                              {idea.pillar}
                            </span>
                          )}

                          {/* Assignee */}
                          {idea.assignee && (
                            <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
                              <div style={{ width: 20, height: 20, borderRadius: 6, background: assigneeColor(idea.assignee), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff" }}>
                                {idea.assignee[0]}
                              </div>
                              <span style={{ fontSize: 11, color: "var(--text3)" }}>{idea.assignee}</span>
                            </div>
                          )}

                          {/* Due */}
                          {idea.due && (
                            <span style={{ fontSize: 11, color: "var(--text3)", flexShrink: 0 }}>
                              <i className="ti ti-calendar" style={{ fontSize: 10, marginRight: 3 }} />{fmt(idea.due)}
                            </span>
                          )}

                          <button onClick={e => { e.stopPropagation(); openEditIdea(idea); }}
                            style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
                            <i className="ti ti-pencil" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modals reused below */}
        {expandedIdea && <ExpandModal idea={expandedIdea} assignees={assignees} onClose={() => setExpandedIdea(null)} onEdit={openEditIdea} onDelete={(id: string) => setDeleteIdeaInfo(id)} onToggleDone={toggleDone} fmt={fmt} />}
        {deleteIdeaInfo && <DeleteModal label="Delete this idea?" onCancel={() => setDeleteIdeaInfo(null)} onConfirm={() => deleteIdea(deleteIdeaInfo!)} />}
        {showIdeaModal && <IdeaModal step={ideaModalStep} setStep={setIdeaModalStep} form={ideaForm} setForm={setIdeaForm} assignees={assignees} rteRef={rteRef} editingId={editingIdeaId} targetPillar={ideaTargetPillar} onSave={saveIdea} onClose={() => setShowIdeaModal(false)} IS={IS} LS={LS} />}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════
  // PER-BRAND KANBAN VIEW
  // ════════════════════════════════════════════════════════════════
  const totalIdeas  = brandIdeas.length;
  const doneIdeas   = brandIdeas.filter(i => i.column_id === "done").length;
  const pillarCount = allColumns.length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: "28px 28px 0" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px" }}>Content Pillars</div>
          <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 3 }}>{selectedBrand}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Month nav */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 10, padding: "6px 12px" }}>
            <button onClick={() => shiftMonth(-1)} style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", padding: "0 2px" }}>
              <i className="ti ti-chevron-left" />
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", minWidth: 110, textAlign: "center" }}>
              {new Date(currentMonth + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </span>
            <button onClick={() => shiftMonth(1)} style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", padding: "0 2px" }}>
              <i className="ti ti-chevron-right" />
            </button>
          </div>
          <button onClick={openAddPillar} className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px" }}>
            <i className="ti ti-plus" style={{ fontSize: 13 }} />Add Pillar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Pillars", val: pillarCount, color: "var(--accent2)" },
          { label: "Ideas",   val: totalIdeas,  color: "var(--text)"    },
          { label: "Done",    val: doneIdeas,   color: "var(--green)"   },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 12px", borderRadius: 20, background: "var(--glass2)", border: "1px solid var(--border2)" }}>
            <span style={{ fontSize: 11, color: "var(--text3)" }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.val}</span>
          </div>
        ))}
      </div>

      <TabStrip />

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 28, opacity: .4 }} />
        </div>
      ) : (
        <div style={{ display: "flex", gap: 14, overflowX: "auto", flex: 1, paddingBottom: 28, alignItems: "flex-start" }}>

          {allColumns.length === 0 && unpilarredIdeas.length === 0 ? (
            <div style={{ flex: 1, textAlign: "center", paddingTop: 80, color: "var(--text3)" }}>
              <i className="ti ti-layout-columns" style={{ fontSize: 40, opacity: .2 }} />
              <div style={{ marginTop: 12, fontSize: 15, fontWeight: 600 }}>No pillars for this month</div>
              <div style={{ fontSize: 13, marginTop: 6, marginBottom: 20 }}>Define content pillars to plan this month's strategy</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={openAddPillar} className="btn-primary" style={{ padding: "10px 20px" }}>
                  <i className="ti ti-plus" style={{ marginRight: 6 }} />Add First Pillar
                </button>
                <button onClick={copyFromPrevMonth} className="btn-ghost" style={{ padding: "10px 20px" }}>
                  <i className="ti ti-copy" style={{ marginRight: 6 }} />Copy from Last Month
                </button>
              </div>
            </div>
          ) : (
            <>
              {allColumns.map(pillar => {
                const cards   = ideasForColumn(pillar.name);
                const done    = cards.filter(c => c.column_id === "done").length;
                const hexColor = pillar.color || "#60a5fa";
                const isImplicit = pillar.implicit;
                const isEditingDesc = editingDesc === pillar.id;

                return (
                  <div key={pillar.id} style={{
                    minWidth: 285, maxWidth: 285, background: "var(--glass)",
                    backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid var(--border)", borderTop: `3px solid ${hexColor}`,
                    borderRadius: "var(--radius)", display: "flex", flexDirection: "column",
                    maxHeight: "calc(100vh - 290px)", overflow: "hidden", flexShrink: 0,
                  }}>
                    {/* Column header */}
                    <div style={{ padding: "12px 14px 0", flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: hexColor, flex: 1, letterSpacing: ".5px", textTransform: "uppercase" }}>
                          {pillar.name}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", background: "var(--glass2)", border: "1px solid var(--border)", padding: "1px 7px", borderRadius: 8 }}>
                          {done}/{cards.length}
                        </span>
                        {isImplicit ? (
                          <button onClick={() => promoteImplicitPillar(pillar.name, hexColor)}
                            title="Save as defined pillar for this month"
                            style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 12, padding: 2 }}>
                            <i className="ti ti-bookmark" />
                          </button>
                        ) : (
                          <>
                            <button onClick={() => openEditPillar(pillar)} style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 12, padding: 2 }}>
                              <i className="ti ti-pencil" />
                            </button>
                            <button onClick={() => setDeletePillarInfo({ id: pillar.id, name: pillar.name })} style={{ background: "transparent", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 12, padding: 2 }}>
                              <i className="ti ti-trash" />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Description box — only for defined pillars */}
                      {!isImplicit && (
                        <div style={{ marginBottom: 10 }}>
                          {isEditingDesc ? (
                            <div>
                              <textarea value={descDraft} onChange={e => setDescDraft(e.target.value)} autoFocus rows={3}
                                placeholder="Describe the strategy for this pillar…"
                                style={{ ...IS, fontSize: 12, resize: "none", padding: "8px 10px", lineHeight: 1.5 }} />
                              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                <button onClick={() => saveDescription(pillar.id)}
                                  style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: hexColor, border: "none", color: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                                  Save
                                </button>
                                <button onClick={() => setEditingDesc(null)}
                                  style={{ padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "transparent", border: "1px solid var(--border2)", color: "var(--text3)", cursor: "pointer", fontFamily: "inherit" }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div onClick={() => { setEditingDesc(pillar.id); setDescDraft(pillar.description || ""); }}
                              style={{ fontSize: 12, color: pillar.description ? "var(--text2)" : "var(--text3)", lineHeight: 1.55, cursor: "pointer", padding: "7px 10px", background: `${hexColor}0a`, border: `1px dashed ${hexColor}35`, borderRadius: 8, minHeight: 38, fontStyle: pillar.description ? "normal" : "italic" }}>
                              {pillar.description || "Click to add strategy description…"}
                            </div>
                          )}
                        </div>
                      )}

                      {isImplicit && (
                        <div style={{ marginBottom: 10, padding: "6px 10px", background: "rgba(255,255,255,0.03)", border: "1px dashed var(--border2)", borderRadius: 8, fontSize: 11, color: "var(--text3)", display: "flex", alignItems: "center", gap: 6 }}>
                          <i className="ti ti-info-circle" style={{ fontSize: 12 }} />
                          Existing ideas — click <i className="ti ti-bookmark" style={{ fontSize: 11, margin: "0 2px" }} /> to define this pillar
                        </div>
                      )}

                      {/* Add idea */}
                      <button onClick={() => openAddIdea(pillar.name)}
                        style={{ width: "100%", padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, background: `${hexColor}12`, border: `1px solid ${hexColor}30`, color: hexColor, cursor: "pointer", fontFamily: "inherit", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                        <i className="ti ti-plus" style={{ fontSize: 12 }} />Add Idea
                      </button>
                      <div style={{ height: 1, background: "var(--border)", marginBottom: 8 }} />
                    </div>

                    {/* Cards */}
                    <div style={{ overflowY: "auto", padding: "0 10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {cards.length === 0 && (
                        <div style={{ textAlign: "center", color: "var(--text3)", fontSize: 12, padding: "16px 0", opacity: .45, fontStyle: "italic" }}>No ideas yet</div>
                      )}
                      {cards.map(idea => {
                        const isDone = idea.column_id === "done";
                        return (
                          <div key={idea.id} onClick={() => setExpandedIdea(idea)}
                            style={{ background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: "var(--radius2)", padding: "10px 12px", cursor: "pointer", opacity: isDone ? 0.65 : 1 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLElement).style.transition = "transform .12s"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}>

                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                              <button onClick={e => { e.stopPropagation(); toggleDone(idea); }}
                                style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, marginTop: 1, border: isDone ? "none" : "1.5px solid var(--border2)", background: isDone ? "var(--green)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {isDone && <i className="ti ti-check" style={{ fontSize: 10, color: "#fff" }} />}
                              </button>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.4, textDecoration: isDone ? "line-through" : "none", opacity: isDone ? .6 : 1 }}>
                                  {idea.title}
                                </div>
                                {idea.description && (
                                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                                    dangerouslySetInnerHTML={{ __html: idea.description }} />
                                )}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                                  {idea.assignee && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                      <div style={{ width: 16, height: 16, borderRadius: 5, background: assigneeColor(idea.assignee), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: "#fff" }}>{idea.assignee[0]}</div>
                                      <span style={{ fontSize: 10, color: "var(--text3)" }}>{idea.assignee}</span>
                                    </div>
                                  )}
                                  {idea.due && (
                                    <span style={{ fontSize: 10, color: "var(--text3)" }}>
                                      <i className="ti ti-calendar" style={{ fontSize: 9, marginRight: 2 }} />{fmt(idea.due)}
                                    </span>
                                  )}
                                  <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                                    <button onClick={e => { e.stopPropagation(); openEditIdea(idea); }} style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 11, padding: 2 }}>
                                      <i className="ti ti-pencil" />
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); setDeleteIdeaInfo(idea.id); }} style={{ background: "transparent", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 11, padding: 2 }}>
                                      <i className="ti ti-trash" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Unpillarred ideas column */}
              {unpilarredIdeas.length > 0 && (
                <div style={{ minWidth: 285, maxWidth: 285, background: "var(--glass)", border: "1px solid var(--border)", borderTop: "3px solid var(--text3)", borderRadius: "var(--radius)", display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 290px)", overflow: "hidden", flexShrink: 0 }}>
                  <div style={{ padding: "12px 14px 0", flexShrink: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--text3)", marginBottom: 10, letterSpacing: ".5px" }}>
                      UNCATEGORIZED ({unpilarredIdeas.length})
                    </div>
                    <button onClick={() => openAddIdea("")} style={{ width: "100%", padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", color: "var(--text3)", cursor: "pointer", fontFamily: "inherit", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                      <i className="ti ti-plus" style={{ fontSize: 12 }} />Add Idea
                    </button>
                    <div style={{ height: 1, background: "var(--border)", marginBottom: 8 }} />
                  </div>
                  <div style={{ overflowY: "auto", padding: "0 10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {unpilarredIdeas.map(idea => {
                      const isDone = idea.column_id === "done";
                      return (
                        <div key={idea.id} onClick={() => setExpandedIdea(idea)}
                          style={{ background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: "var(--radius2)", padding: "10px 12px", cursor: "pointer", opacity: isDone ? 0.65 : 1 }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <button onClick={e => { e.stopPropagation(); toggleDone(idea); }}
                              style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 4, marginTop: 1, border: isDone ? "none" : "1.5px solid var(--border2)", background: isDone ? "var(--green)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {isDone && <i className="ti ti-check" style={{ fontSize: 10, color: "#fff" }} />}
                            </button>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.4 }}>{idea.title}</div>
                              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                                {idea.assignee && <span style={{ fontSize: 10, color: "var(--text3)" }}>{idea.assignee}</span>}
                                {idea.due && <span style={{ fontSize: 10, color: "var(--text3)" }}>{fmt(idea.due)}</span>}
                                <button onClick={e => { e.stopPropagation(); openEditIdea(idea); }} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 11, padding: 2 }}>
                                  <i className="ti ti-pencil" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* + Add pillar placeholder */}
              <div onClick={openAddPillar} style={{ minWidth: 180, height: 110, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, border: "2px dashed var(--border2)", borderRadius: "var(--radius)", color: "var(--text3)", cursor: "pointer", flexShrink: 0 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-border)"; (e.currentTarget as HTMLElement).style.color = "var(--accent2)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--border2)"; (e.currentTarget as HTMLElement).style.color = "var(--text3)"; }}>
                <i className="ti ti-plus" style={{ fontSize: 20 }} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Add Pillar</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Pillar modal ── */}
      {showPillarModal && (
        <div onClick={() => setShowPillarModal(false)} className="crm-modal-bg">
          <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 460 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>{editingPillarId ? "Edit Pillar" : "New Content Pillar"}</div>
              <button onClick={() => setShowPillarModal(false)} className="btn-ghost" style={{ padding: "6px 10px", minHeight: "unset" }}><i className="ti ti-x" style={{ fontSize: 15 }} /></button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Pillar Name *</label>
              <input value={pillarForm.name} onChange={e => setPillarForm({ ...pillarForm, name: e.target.value })} placeholder="e.g. Educational, BTS, Product Showcase…" style={IS} autoFocus />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Strategy Description</label>
              <textarea value={pillarForm.description} onChange={e => setPillarForm({ ...pillarForm, description: e.target.value })} placeholder="What kind of content goes here? Goal of this pillar?" rows={4} style={{ ...IS, resize: "none", lineHeight: 1.55 }} />
            </div>
            <div style={{ marginBottom: 22 }}>
              <label style={LS}>Pillar Color</label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {PILLAR_PALETTE.map(c => (
                  <button key={c} onClick={() => setPillarForm({ ...pillarForm, color: c })}
                    style={{ width: 30, height: 30, borderRadius: 8, background: c, border: "none", cursor: "pointer", boxShadow: pillarForm.color === c ? `0 0 0 3px rgba(255,255,255,0.8), 0 0 0 5px ${c}` : "none", transition: "box-shadow .15s" }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowPillarModal(false)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 12 }}>Cancel</button>
              <button onClick={savePillar} className="btn-primary" style={{ flex: 1, justifyContent: "center", padding: 12, fontSize: 14 }}>
                <i className="ti ti-check" style={{ marginRight: 6 }} />{editingPillarId ? "Save Changes" : "Create Pillar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shared modals */}
      {expandedIdea && <ExpandModal idea={expandedIdea} assignees={assignees} onClose={() => setExpandedIdea(null)} onEdit={openEditIdea} onDelete={(id: string) => setDeleteIdeaInfo(id)} onToggleDone={toggleDone} fmt={fmt} />}
      {deletePillarInfo && <DeleteModal label={`Remove "${deletePillarInfo.name}"?`} sub="The pillar definition is deleted. Existing ideas are kept." onCancel={() => setDeletePillarInfo(null)} onConfirm={() => deletePillar(deletePillarInfo!.id)} />}
      {deleteIdeaInfo && <DeleteModal label="Delete this idea?" onCancel={() => setDeleteIdeaInfo(null)} onConfirm={() => deleteIdea(deleteIdeaInfo!)} />}
      {showIdeaModal && <IdeaModal step={ideaModalStep} setStep={setIdeaModalStep} form={ideaForm} setForm={setIdeaForm} assignees={assignees} rteRef={rteRef} editingId={editingIdeaId} targetPillar={ideaTargetPillar} onSave={saveIdea} onClose={() => setShowIdeaModal(false)} IS={IS} LS={LS} />}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ExpandModal({ idea, assignees, onClose, onEdit, onDelete, onToggleDone, fmt }: any) {
  const isDone = idea.column_id === "done";
  return (
    <div onClick={onClose} className="crm-modal-bg">
      <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 500 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ flex: 1, paddingRight: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 5 }}>{idea.client} · {idea.pillar || "Uncategorized"}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", lineHeight: 1.35, letterSpacing: "-0.3px" }}>{idea.title}</div>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: "6px 10px", minHeight: "unset", flexShrink: 0 }}><i className="ti ti-x" style={{ fontSize: 15 }} /></button>
        </div>

        {idea.description ? (
          <div dangerouslySetInnerHTML={{ __html: idea.description }}
            style={{ background: "var(--glass)", border: "1px solid var(--border)", borderRadius: "var(--radius2)", padding: "12px 15px", fontSize: 13, color: "var(--text2)", lineHeight: 1.7, marginBottom: 16 }} />
        ) : (
          <div style={{ background: "var(--glass)", border: "1px dashed var(--border2)", borderRadius: "var(--radius2)", padding: "10px 15px", fontSize: 12, color: "var(--text3)", marginBottom: 16, fontStyle: "italic" }}>
            No content notes added.
          </div>
        )}

        {[
          { label: "Assignee", val: idea.assignee || "—" },
          { label: "Due Date", val: idea.due ? fmt(idea.due) : "—" },
          { label: "Status",   val: isDone ? "✓ Done" : "Active" },
        ].map((r, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
            <span style={{ color: "var(--text3)" }}>{r.label}</span>
            <span style={{ color: r.label === "Status" && isDone ? "var(--green)" : "var(--text)", fontWeight: 600 }}>{r.val}</span>
          </div>
        ))}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={() => onToggleDone(idea)} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11 }}>
            <i className={`ti ${isDone ? "ti-rotate-clockwise" : "ti-circle-check"}`} style={{ marginRight: 6 }} />
            {isDone ? "Mark Active" : "Mark Done"}
          </button>
          <button onClick={() => onEdit(idea)} style={{ padding: "10px 14px", background: "var(--glass2)", border: "1px solid var(--border2)", borderRadius: 10, color: "var(--text2)", cursor: "pointer", fontSize: 13 }}>
            <i className="ti ti-pencil" />
          </button>
          <button onClick={() => onDelete(idea.id)} style={{ padding: "10px 14px", background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, color: "var(--red)", cursor: "pointer", fontSize: 13 }}>
            <i className="ti ti-trash" />
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ label, sub, onCancel, onConfirm }: any) {
  return (
    <div onClick={onCancel} className="crm-modal-bg">
      <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 340, textAlign: "center" }}>
        <i className="ti ti-trash" style={{ fontSize: 36, color: "var(--red)", opacity: .7 }} />
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", margin: "14px 0 6px" }}>{label}</div>
        {sub && <div style={{ fontSize: 13, color: "var(--text3)", marginBottom: 22 }}>{sub}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: sub ? 0 : 22 }}>
          <button onClick={onCancel} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 11 }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: 11, background: "var(--red)", border: "none", borderRadius: 10, color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

function IdeaModal({ step, setStep, form, setForm, assignees, rteRef, editingId, targetPillar, onSave, onClose, IS, LS }: any) {
  return (
    <div onClick={onClose} className="crm-modal-bg">
      <div onClick={e => e.stopPropagation()} className="crm-modal" style={{ width: 520 }}>
        {step === "form" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>{editingId ? "Edit Idea" : "New Idea"}</div>
                {targetPillar && <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>Pillar: <span style={{ color: "var(--text2)", fontWeight: 600 }}>{targetPillar}</span></div>}
              </div>
              <button onClick={onClose} className="btn-ghost" style={{ padding: "6px 10px", minHeight: "unset" }}><i className="ti ti-x" style={{ fontSize: 15 }} /></button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Idea Title *</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. 5 signs your furniture needs an upgrade" style={IS} autoFocus />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={LS}>Due Date</label>
              <input type="date" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} style={IS} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={LS}>Content Notes</label>
              <div style={{ border: "1px solid var(--border2)", borderRadius: "var(--radius2)", overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 3, padding: "8px 10px", borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.03)", flexWrap: "wrap" }}>
                  {([["bold", <b key="b">B</b>], ["italic", <i key="i" style={{ fontStyle: "italic" }}>I</i>], ["underline", <u key="u">U</u>]] as [string, React.ReactNode][]).map(([cmd, label]) => (
                    <button key={cmd} onMouseDown={e => { e.preventDefault(); rteRef.current?.focus(); document.execCommand(cmd, false); }}
                      style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", padding: "4px 7px", borderRadius: 5, fontSize: 13 }}>{label}</button>
                  ))}
                  <div style={{ width: 1, height: 18, background: "var(--border2)", margin: "0 3px" }} />
                  {([["insertUnorderedList", "ti-list"], ["insertOrderedList", "ti-list-numbers"]] as [string, string][]).map(([cmd, icon]) => (
                    <button key={cmd} onMouseDown={e => { e.preventDefault(); rteRef.current?.focus(); document.execCommand(cmd, false); }}
                      style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", padding: "4px 7px", borderRadius: 5, fontSize: 13 }}>
                      <i className={`ti ${icon}`} style={{ fontSize: 13 }} />
                    </button>
                  ))}
                </div>
                <div ref={rteRef} contentEditable suppressContentEditableWarning
                  style={{ minHeight: 110, padding: "12px 15px", outline: "none", fontSize: 13, lineHeight: 1.7, color: "var(--text2)" }}
                  onKeyDown={e => e.stopPropagation()}
                  onInput={() => setForm((p: any) => ({ ...p, description: rteRef.current?.innerHTML || "" }))} />
              </div>
            </div>

            <button onClick={() => { if (!form.title.trim()) return; if (editingId) { onSave(); return; } setStep("assign"); }}
              className="btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 14 }}>
              <i className={`ti ${editingId ? "ti-check" : "ti-arrow-right"}`} style={{ marginRight: 6 }} />
              {editingId ? "Save Changes" : "Next: Assign"}
            </button>
          </>
        )}

        {step === "assign" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.4px" }}>Assign to team member</div>
              <button onClick={onClose} className="btn-ghost" style={{ padding: "6px 10px", minHeight: "unset" }}><i className="ti ti-x" style={{ fontSize: 15 }} /></button>
            </div>
            <div style={{ fontSize: 13, color: "var(--text2)", marginBottom: 18 }}>
              Who's handling <span style={{ color: "var(--text)", fontWeight: 600 }}>"{form.title}"</span>?
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 20 }}>
              {assignees.map((a: any) => (
                <div key={a.id} onClick={() => setForm({ ...form, assignee: a.name })}
                  style={{ background: form.assignee === a.name ? "var(--accent-bg)" : "var(--glass2)", border: `1px solid ${form.assignee === a.name ? "var(--accent-border)" : "var(--border2)"}`, borderRadius: "var(--radius2)", padding: "14px 10px", textAlign: "center", cursor: "pointer" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: a.color || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", margin: "0 auto 8px" }}>{a.name[0]}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{a.name}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("form")} className="btn-ghost" style={{ flex: 1, justifyContent: "center", padding: 12 }}>
                <i className="ti ti-arrow-left" style={{ marginRight: 6 }} />Back
              </button>
              <button onClick={onSave} className="btn-primary" style={{ flex: 1, justifyContent: "center", padding: 12, fontSize: 14 }}>
                <i className="ti ti-check" style={{ marginRight: 6 }} />Create Idea
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
