"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/components/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClientProfile {
  id: string;
  client_name: string;
  contact_name: string;
  email: string;
}

interface ContentEntry {
  id: string;
  title: string;
  platform: string;
  content_type: string;
  status: string;
  scheduled_date: string;
  client_approval: string;
  client_comment: string;
  notes: string;
  drive_link: string;
  client: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  Instagram: "#e1306c",
  YouTube: "#ff0000",
  Facebook: "#1877f2",
  LinkedIn: "#0a66c2",
  Twitter: "#1da1f2",
  X: "#1a1a2e",
  TikTok: "#010101",
};

const STATUS_COLORS_DARK: Record<string, { bg: string; color: string; border: string }> = {
  "Idea":        { bg: "rgba(148,163,184,0.1)",  color: "#94a3b8", border: "rgba(148,163,184,0.2)" },
  "In Progress": { bg: "rgba(251,191,36,0.1)",   color: "#fbbf24", border: "rgba(251,191,36,0.2)" },
  "Review":      { bg: "rgba(109,93,252,0.1)",  color: "#6d5dfc", border: "rgba(109,93,252,0.2)" },
  "Approved":    { bg: "rgba(74,222,128,0.1)",   color: "#4ade80", border: "rgba(74,222,128,0.2)" },
  "Scheduled":   { bg: "rgba(96,165,250,0.1)",   color: "#60a5fa", border: "rgba(96,165,250,0.2)" },
  "Posted":      { bg: "rgba(74,222,128,0.08)",  color: "#4ade80", border: "rgba(74,222,128,0.15)" },
  "Cancelled":   { bg: "rgba(248,113,113,0.1)",  color: "#f87171", border: "rgba(248,113,113,0.2)" },
};

const STATUS_COLORS_LIGHT: Record<string, { bg: string; color: string; border: string }> = {
  "Idea":        { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0" },
  "In Progress": { bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
  "Review":      { bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe" },
  "Approved":    { bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" },
  "Scheduled":   { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" },
  "Posted":      { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  "Cancelled":   { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClientPortal() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("portal-theme", next);
  };
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<ContentEntry[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPlatform, setFilterPlatform] = useState("All");
  const [portalView, setPortalView] = useState<"calendar" | "list">("calendar");
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });

  // Login state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Feedback modal
  const [feedbackEntry, setFeedbackEntry] = useState<ContentEntry | null>(null);
  const [feedbackDecision, setFeedbackDecision] = useState<"Approved" | "Changes Needed" | "">("");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  const dk = theme === "dark";
  const T = {
    bg:         dk ? "#0a0a0f"             : "#f8fafc",
    card:       dk ? "rgba(255,255,255,0.03)" : "#fff",
    cardBorder: dk ? "rgba(255,255,255,0.07)" : "#e2e8f0",
    nav:        dk ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.9)",
    navBorder:  dk ? "rgba(255,255,255,0.07)" : "#e2e8f0",
    text:       dk ? "#fff"               : "#0f172a",
    text2:      dk ? "rgba(255,255,255,0.6)"  : "#475569",
    text3:      dk ? "rgba(255,255,255,0.35)" : "#94a3b8",
    input:      dk ? "rgba(255,255,255,0.05)" : "#f1f5f9",
    inputBorder:dk ? "rgba(255,255,255,0.1)"  : "#cbd5e1",
    modal:      dk ? "#12121c"            : "#fff",
    modalBorder:dk ? "rgba(255,255,255,0.1)"  : "#e2e8f0",
    btnGhost:   dk ? "rgba(255,255,255,0.06)" : "#f1f5f9",
    btnBorder:  dk ? "rgba(255,255,255,0.1)"  : "#e2e8f0",
    sc: dk ? STATUS_COLORS_DARK : STATUS_COLORS_LIGHT,
  };

  const IS: React.CSSProperties = {
    width: "100%", background: T.input, border: `1px solid ${T.inputBorder}`,
    borderRadius: 10, padding: "13px 14px", color: T.text,
    fontFamily: "inherit", fontSize: 15, outline: "none", WebkitAppearance: "none",
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // ── Persist theme ─────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("portal-theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let resolved = false;
    const timeout = setTimeout(() => { if (!resolved) setLoading(false); }, 8000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      resolved = true;
      clearTimeout(timeout);
      setSession(session);
      if (session) checkClientProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
      if (session) checkClientProfile(session.user.id);
      else { setProfile(null); setContent([]); setLoading(false); }
    });

    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  const checkClientProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("client_profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (data) {
      setProfile(data);
      fetchContent(data.client_name);
    } else {
      console.error("client_profiles lookup error:", error);
      await supabase.auth.signOut();
      setLoginError("This account is not a client portal account. Please use the main CRM login.");
    }
    setLoading(false);
  };

  const fetchContent = useCallback(async (clientName: string) => {
    setContentLoading(true);

    // Try with drive_link first; fall back without it if column doesn't exist yet
    let result: any = await supabase
      .from("content_calendar")
      .select("id,title,platform,content_type,status,scheduled_date,client_approval,client_comment,notes,drive_link,client")
      .eq("client", clientName)
      .order("scheduled_date", { ascending: false });

    if (result.error?.message?.includes("drive_link")) {
      result = await supabase
        .from("content_calendar")
        .select("id,title,platform,content_type,status,scheduled_date,client_approval,client_comment,notes,client")
        .eq("client", clientName)
        .order("scheduled_date", { ascending: false });
    }

    if (result.error) console.error("fetchContent error:", result.error.message);
    setContent(result.data || []);
    setContentLoading(false);
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) { setLoginError("Please enter email and password."); return; }
    setLoggingIn(true);
    setLoginError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setLoginError("Invalid email or password.");
      setLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // ── Feedback ──────────────────────────────────────────────────────────────
  const openFeedback = (entry: ContentEntry) => {
    setFeedbackEntry(entry);
    setFeedbackDecision(entry.client_approval as any || "");
    setFeedbackComment(entry.client_comment || "");
  };

  const submitFeedback = async () => {
    if (!feedbackEntry || !feedbackDecision) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("content_calendar")
      .update({ client_approval: feedbackDecision, client_comment: feedbackComment })
      .eq("id", feedbackEntry.id);

    if (error) {
      showToast("Failed to save. Please try again.");
    } else {
      showToast(feedbackDecision === "Approved" ? "✓ Approved!" : "✓ Feedback sent!");
      setContent(prev => prev.map(e =>
        e.id === feedbackEntry.id
          ? { ...e, client_approval: feedbackDecision, client_comment: feedbackComment }
          : e
      ));
      setFeedbackEntry(null);
    }
    setSubmitting(false);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const filtered = content.filter(e =>
    (filterStatus === "All" || e.status === filterStatus) &&
    (filterPlatform === "All" || e.platform === filterPlatform)
  );

  const platforms = [...new Set(content.map(e => e.platform).filter(Boolean))];
  const pendingCount = content.filter(e => e.status === "Ready for Review" && !e.client_approval).length;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <div style={{ textAlign: "center", color: T.text3 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg,#8b5cf6,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 auto 14px" }}>M</div>
        <div>Loading your portal…</div>
      </div>
    </div>
  );

  // ── Login ─────────────────────────────────────────────────────────────────
  if (!session || !profile) return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, padding: 20, transition: "background .2s" }}>
      <div style={{ position: "fixed", inset: 0, background: dk ? "radial-gradient(ellipse 70% 50% at 20% 10%, rgba(139,92,246,0.08) 0%, transparent 60%)" : "radial-gradient(ellipse 70% 50% at 20% 10%, rgba(139,92,246,0.04) 0%, transparent 60%)", pointerEvents: "none" }} />

      {/* Theme toggle top-right */}
      <button onClick={() => toggleTheme()}
        style={{ position: "fixed", top: 20, right: 20, width: 40, height: 40, borderRadius: 10, background: T.card, border: `1px solid ${T.cardBorder}`, color: T.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
        {dk ? "☀️" : "🌙"}
      </button>

      <div style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg,#8b5cf6,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 800, color: "#fff", margin: "0 auto 14px", boxShadow: "0 8px 24px rgba(139,92,246,0.4)" }}>M</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: "-0.5px" }}>Client Portal</div>
          <div style={{ fontSize: 14, color: T.text3, marginTop: 4 }}>Content Review</div>
        </div>

        <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 20, padding: "28px 24px" }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" }}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" type="email"
              autoCapitalize="none" autoCorrect="off" onKeyDown={e => e.key === "Enter" && handleLogin()} style={IS} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" }}>Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" type="password"
              onKeyDown={e => e.key === "Enter" && handleLogin()} style={IS} />
          </div>

          {loginError && (
            <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#f87171", marginBottom: 16 }}>
              {loginError}
            </div>
          )}

          <button onClick={handleLogin} disabled={loggingIn}
            style={{ width: "100%", padding: 14, background: "linear-gradient(135deg,#8b5cf6,#6366f1)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: loggingIn ? "not-allowed" : "pointer", opacity: loggingIn ? 0.7 : 1, fontFamily: "inherit" }}>
            {loggingIn ? "Signing in…" : "Sign In"}
          </button>

          <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: T.text3 }}>
            Use the credentials provided by your agency
          </div>
        </div>
      </div>
    </div>
  );

  // ── Portal ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100dvh", background: T.bg, color: T.text, transition: "background .2s, color .2s" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, background: dk ? "rgba(74,222,128,0.15)" : "#f0fdf4", border: "1px solid rgba(74,222,128,0.35)", borderRadius: 12, padding: "12px 20px", fontSize: 14, color: "#16a34a", fontWeight: 600, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
          {toast}
        </div>
      )}

      {/* Navbar */}
      <div style={{ background: T.nav, borderBottom: `1px solid ${T.navBorder}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60, position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(12px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg,#8b5cf6,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>M</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: "-0.3px" }}>{profile.client_name}</div>
            <div style={{ fontSize: 11, color: T.text3 }}>Content Portal</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {pendingCount > 0 && (
            <div style={{ background: dk ? "rgba(251,191,36,0.12)" : "#fffbeb", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: "#d97706", fontWeight: 600 }}>
              {pendingCount} need{pendingCount === 1 ? "s" : ""} review
            </div>
          )}
          {/* Theme toggle */}
          <button onClick={() => toggleTheme()}
            style={{ width: 36, height: 36, borderRadius: 9, background: T.btnGhost, border: `1px solid ${T.btnBorder}`, color: T.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
            {dk ? "☀️" : "🌙"}
          </button>
          <button onClick={handleLogout}
            style={{ padding: "7px 14px", borderRadius: 9, background: T.btnGhost, border: `1px solid ${T.btnBorder}`, color: T.text2, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 920, margin: "0 auto", padding: "28px 20px" }}>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Content", val: content.length, color: "#8b5cf6" },
            { label: "Needs Review",  val: content.filter(e => e.status === "Ready for Review" && !e.client_approval).length, color: "#d97706" },
            { label: "Approved",      val: content.filter(e => e.client_approval === "Approved").length, color: "#16a34a" },
            { label: "Changes Req.",  val: content.filter(e => e.client_approval === "Changes Needed").length, color: "#dc2626" },
          ].map((s, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 14, padding: "16px 18px" }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, letterSpacing: "-0.5px", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 5 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* View toggle + month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          {/* Calendar month nav */}
          {portalView === "calendar" && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setCalMonth(({ year, month }) => month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 })}
                style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.btnBorder}`, background: T.btnGhost, color: T.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, minWidth: 160, textAlign: "center" }}>
                {new Date(calMonth.year, calMonth.month, 1).toLocaleString("default", { month: "long", year: "numeric" })}
              </div>
              <button onClick={() => setCalMonth(({ year, month }) => month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 })}
                style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.btnBorder}`, background: T.btnGhost, color: T.text2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
              <button onClick={() => setCalMonth({ year: new Date().getFullYear(), month: new Date().getMonth() })}
                style={{ padding: "5px 12px", borderRadius: 8, border: `1px solid ${T.btnBorder}`, background: T.btnGhost, color: T.text3, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Today</button>
            </div>
          )}
          {portalView === "list" && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["All", "Ready for Review", "Scheduled", "Posted"].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "1px solid",
                    background: filterStatus === s ? (dk ? "rgba(139,92,246,0.2)" : "#f5f3ff") : T.btnGhost,
                    borderColor: filterStatus === s ? "rgba(139,92,246,0.5)" : T.btnBorder,
                    color: filterStatus === s ? "#8b5cf6" : T.text3 }}>{s}</button>
              ))}
            </div>
          )}
          {/* View switcher */}
          <div style={{ display: "flex", gap: 4, background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 10, padding: 4 }}>
            {(["calendar", "list"] as const).map(v => (
              <button key={v} onClick={() => setPortalView(v)}
                style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", border: "none",
                  background: portalView === v ? (dk ? "rgba(139,92,246,0.25)" : "#f5f3ff") : "transparent",
                  color: portalView === v ? "#8b5cf6" : T.text3, textTransform: "capitalize" }}>
                {v === "calendar" ? "📅 Calendar" : "☰ List"}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {contentLoading ? (
          <div style={{ textAlign: "center", padding: 60, color: T.text3 }}>Loading your content…</div>
        ) : content.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: T.text3, background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text2 }}>No content yet</div>
            <div style={{ fontSize: 13, marginTop: 6, color: T.text3 }}>
              Your content will appear here once the team adds entries for <strong style={{ color: T.text2 }}>{profile.client_name}</strong>
            </div>
          </div>
        ) : portalView === "calendar" ? (() => {
          const { year: cy, month: cm } = calMonth;
          const daysInMo = new Date(cy, cm + 1, 0).getDate();
          const firstDayOfMo = new Date(cy, cm, 1).getDay();
          const todayStr = new Date().toISOString().split("T")[0];
          const getDay = (day: number) => {
            const ds = `${cy}-${String(cm+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            return content.filter(e => e.scheduled_date === ds);
          };
          return (
            <div style={{ background: T.card, border: `1px solid ${T.cardBorder}`, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${T.cardBorder}` }}>
                {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
                  <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: T.text3, padding: "10px 0", textTransform: "uppercase", letterSpacing: ".5px" }}>{d}</div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
                {Array.from({ length: firstDayOfMo }).map((_, i) => (
                  <div key={`e${i}`} style={{ minHeight: 90, borderRight: `1px solid ${T.cardBorder}`, borderBottom: `1px solid ${T.cardBorder}` }} />
                ))}
                {Array.from({ length: daysInMo }).map((_, i) => {
                  const day = i + 1;
                  const ds = `${cy}-${String(cm+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const dayEntries = getDay(day);
                  const isToday = ds === todayStr;
                  const col = (firstDayOfMo + i) % 7;
                  return (
                    <div key={day} style={{ minHeight: 90, padding: "6px 5px", borderRight: col < 6 ? `1px solid ${T.cardBorder}` : "none", borderBottom: `1px solid ${T.cardBorder}`, background: isToday ? (dk ? "rgba(139,92,246,0.06)" : "#faf5ff") : "transparent" }}>
                      <div style={{ fontSize: 12, fontWeight: isToday ? 800 : 500, color: isToday ? "#8b5cf6" : T.text3, marginBottom: 4, width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: isToday ? "rgba(139,92,246,0.15)" : "transparent" }}>{day}</div>
                      {dayEntries.map(entry => {
                        const needsReview = entry.status === "Ready for Review" && !entry.client_approval;
                        return (
                          <div key={entry.id} onClick={() => openFeedback(entry)}
                            style={{ fontSize: 10, fontWeight: 600, padding: "3px 5px", borderRadius: 5, marginBottom: 2, cursor: "pointer", lineHeight: 1.3,
                              background: needsReview ? "rgba(251,191,36,0.15)" : (entry.client_approval === "Approved" ? "rgba(22,163,74,0.1)" : (dk ? "rgba(139,92,246,0.12)" : "#f5f3ff")),
                              color: needsReview ? "#d97706" : (entry.client_approval === "Approved" ? "#16a34a" : "#8b5cf6"),
                              border: `1px solid ${needsReview ? "rgba(251,191,36,0.3)" : (entry.client_approval === "Approved" ? "rgba(22,163,74,0.2)" : "rgba(139,92,246,0.2)")}` }}>
                            {entry.title.length > 18 ? entry.title.slice(0, 17) + "…" : entry.title}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })() : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
            No content matches the selected filter.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(entry => {
              const sc = T.sc[entry.status] || T.sc["Idea"];
              const pColor = PLATFORM_COLORS[entry.platform] || "#8b5cf6";
              const needsReview = entry.status === "Ready for Review";
              const hasApproval = !!entry.client_approval;

              return (
                <div key={entry.id} style={{
                  background: T.card, border: `1px solid ${needsReview && !hasApproval ? "rgba(251,191,36,0.35)" : T.cardBorder}`,
                  borderRadius: 16, padding: "18px 20px", transition: "border-color .2s",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.3px" }}>{entry.title}</div>
                        {needsReview && !hasApproval && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 20, background: "rgba(251,191,36,0.12)", color: "#d97706", border: "1px solid rgba(251,191,36,0.3)" }}>
                            NEEDS YOUR REVIEW
                          </span>
                        )}
                      </div>

                      {/* Meta */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: pColor, background: `${pColor}18`, border: `1px solid ${pColor}28`, borderRadius: 6, padding: "2px 9px" }}>
                          {entry.platform}
                        </span>
                        {entry.content_type && (
                          <span style={{ fontSize: 12, color: T.text3 }}>{entry.content_type}</span>
                        )}
                        {entry.scheduled_date && (
                          <span style={{ fontSize: 12, color: T.text3 }}>
                            📅 {new Date(entry.scheduled_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        )}
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                          {entry.status}
                        </span>
                      </div>

                      {/* Team note */}
                      {entry.notes && (
                        <div style={{ marginTop: 10, padding: "8px 12px", background: dk ? "rgba(139,92,246,0.08)" : "#f5f3ff", borderRadius: 8, borderLeft: "2px solid rgba(139,92,246,0.4)", fontSize: 12, color: T.text2 }}>
                          <span style={{ fontWeight: 700, color: "#8b5cf6", fontSize: 10, textTransform: "uppercase", letterSpacing: ".5px" }}>Team Note: </span>
                          {entry.notes}
                        </div>
                      )}

                      {/* Content preview */}
                      {entry.drive_link && (() => {
                        const url = entry.drive_link;
                        const isImage = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
                        const isVideo = /\.(mp4|mov|webm|avi)(\?|$)/i.test(url);
                        const isDrive = url.includes("drive.google.com");
                        const isYoutube = url.includes("youtube.com") || url.includes("youtu.be");

                        // Convert Google Drive share link to embed/preview
                        let driveEmbedUrl = url;
                        if (isDrive) {
                          const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                          if (fileIdMatch) driveEmbedUrl = `https://drive.google.com/file/d/${fileIdMatch[1]}/preview`;
                        }
                        let youtubeEmbedUrl = url;
                        if (isYoutube) {
                          const ytId = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
                          if (ytId) youtubeEmbedUrl = `https://www.youtube.com/embed/${ytId}`;
                        }

                        return (
                          <div style={{ marginTop: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 8 }}>Content</div>
                            <div style={{ border: `1px solid ${T.cardBorder}`, borderRadius: 12, overflow: "hidden" }}>
                              {isImage ? (
                                <img src={url} alt="content preview"
                                  style={{ width: "100%", maxHeight: 400, objectFit: "contain", display: "block", background: dk ? "rgba(0,0,0,0.4)" : "#f1f5f9" }} />
                              ) : isVideo ? (
                                <video controls src={url}
                                  style={{ width: "100%", maxHeight: 400, display: "block", background: "#000" }} />
                              ) : (isDrive || isYoutube) ? (
                                <iframe src={isDrive ? driveEmbedUrl : youtubeEmbedUrl}
                                  style={{ width: "100%", height: 380, border: "none", display: "block" }}
                                  allow="autoplay" allowFullScreen />
                              ) : null}
                              <div style={{ padding: "10px 14px", display: "flex", justifyContent: "flex-end", borderTop: isImage || isVideo || isDrive || isYoutube ? `1px solid ${T.cardBorder}` : "none", background: dk ? "rgba(255,255,255,0.02)" : "#f8fafc" }}>
                                <a href={url} target="_blank" rel="noopener noreferrer"
                                  style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 9, background: dk ? "rgba(96,165,250,0.1)" : "#eff6ff", border: "1px solid rgba(96,165,250,0.3)", color: "#2563eb", fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                                  📥 Download / Open
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Existing feedback */}
                      {hasApproval && (
                        <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10,
                          background: entry.client_approval === "Approved" ? (dk ? "rgba(74,222,128,0.08)" : "#f0fdf4") : (dk ? "rgba(248,113,113,0.08)" : "#fef2f2"),
                          border: `1px solid ${entry.client_approval === "Approved" ? "rgba(74,222,128,0.2)" : "rgba(248,113,113,0.2)"}` }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: entry.client_approval === "Approved" ? "#16a34a" : "#dc2626", textTransform: "uppercase", letterSpacing: ".5px" }}>
                            {entry.client_approval === "Approved" ? "✓ You approved this" : "✗ You requested changes"}
                          </div>
                          {entry.client_comment && (
                            <div style={{ fontSize: 13, color: T.text2, marginTop: 5 }}>{entry.client_comment}</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    {(needsReview || hasApproval) && (
                      <button onClick={() => openFeedback(entry)}
                        style={{ padding: "9px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0,
                          background: hasApproval ? T.btnGhost : (dk ? "rgba(139,92,246,0.15)" : "#f5f3ff"),
                          border: `1px solid ${hasApproval ? T.btnBorder : "rgba(139,92,246,0.4)"}`,
                          color: hasApproval ? T.text3 : "#8b5cf6" }}>
                        {hasApproval ? "Edit Feedback" : "Give Feedback"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Feedback Modal ──────────────────────────────────────────────────── */}
      {feedbackEntry && (
        <div onClick={() => !submitting && setFeedbackEntry(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20, backdropFilter: "blur(6px)" }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: T.modal, border: `1px solid ${T.modalBorder}`, borderRadius: 20, padding: 28, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.text, letterSpacing: "-0.4px" }}>Your Feedback</div>
              <div style={{ fontSize: 13, color: T.text3, marginTop: 4 }}>{feedbackEntry.title}</div>
            </div>

            {/* Decision */}
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              <button onClick={() => setFeedbackDecision("Approved")}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
                  background: feedbackDecision === "Approved" ? (dk ? "rgba(74,222,128,0.15)" : "#f0fdf4") : T.btnGhost,
                  border: `2px solid ${feedbackDecision === "Approved" ? "rgba(74,222,128,0.5)" : T.btnBorder}`,
                  color: feedbackDecision === "Approved" ? "#16a34a" : T.text3 }}>
                ✓ Approve
              </button>
              <button onClick={() => setFeedbackDecision("Changes Needed")}
                style={{ flex: 1, padding: "14px 0", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all .15s",
                  background: feedbackDecision === "Changes Needed" ? (dk ? "rgba(248,113,113,0.12)" : "#fef2f2") : T.btnGhost,
                  border: `2px solid ${feedbackDecision === "Changes Needed" ? "rgba(248,113,113,0.5)" : T.btnBorder}`,
                  color: feedbackDecision === "Changes Needed" ? "#dc2626" : T.text3 }}>
                ✗ Request Changes
              </button>
            </div>

            {/* Comment */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" }}>
                Comment {feedbackDecision === "Changes Needed" ? "(required)" : "(optional)"}
              </label>
              <textarea
                value={feedbackComment}
                onChange={e => setFeedbackComment(e.target.value)}
                placeholder={feedbackDecision === "Changes Needed" ? "Tell us what changes are needed…" : "Any specific feedback? (optional)"}
                rows={4}
                style={{ ...IS, resize: "vertical", lineHeight: 1.5 }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setFeedbackEntry(null)} disabled={submitting}
                style={{ flex: 1, padding: 12, borderRadius: 10, background: T.btnGhost, border: `1px solid ${T.btnBorder}`, color: T.text2, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={submitFeedback}
                disabled={submitting || !feedbackDecision || (feedbackDecision === "Changes Needed" && !feedbackComment.trim())}
                style={{ flex: 2, padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "opacity .15s",
                  background: feedbackDecision === "Approved" ? (dk ? "rgba(74,222,128,0.2)" : "#dcfce7") : feedbackDecision === "Changes Needed" ? (dk ? "rgba(248,113,113,0.15)" : "#fee2e2") : T.btnGhost,
                  border: `1px solid ${feedbackDecision === "Approved" ? "rgba(74,222,128,0.4)" : feedbackDecision === "Changes Needed" ? "rgba(248,113,113,0.4)" : T.btnBorder}`,
                  color: feedbackDecision === "Approved" ? "#16a34a" : feedbackDecision === "Changes Needed" ? "#dc2626" : T.text3,
                  opacity: (submitting || !feedbackDecision || (feedbackDecision === "Changes Needed" && !feedbackComment.trim())) ? 0.45 : 1 }}>
                {submitting ? "Sending…" : "Submit Feedback"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
