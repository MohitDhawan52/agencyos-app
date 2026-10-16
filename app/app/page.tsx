"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/components/supabase";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/components/Dashboard";
import Clients from "@/components/Clients";
import VideoTracker from "@/components/VideoTracker";
import Tasks from "@/components/Tasks";
import Board from "@/components/Board";
import Team from "@/components/Team";
import Permissions from "@/components/Permissions";
import Activity from "@/components/Activity";
import Settings from "@/components/Settings";
import Finance from "@/components/Finance";
import ContentCalendar from "@/components/ContentCalendar";
import MemberDashboard from "@/components/MemberDashboard";
import ChatPanel from "@/components/ChatPanel";
import { ToastContainer, showToast } from "@/components/ToastNotification";
import Attendance from "@/components/Attendance";
import Reports from "@/components/Reports";
import ClientPortalManager from "@/components/ClientPortalManager";
import Timesheet from "@/components/Timesheet";
import ShootPlanner from "@/components/ShootPlanner";
import Leads from "@/components/Leads";
import Meetings from "@/components/Meetings";
import FloatingQuickTask from "@/components/FloatingQuickTask";
import ContentIdea from "@/components/ContentIdea";
import AlertSystem from "@/components/AlertSystem";
import AlertsPage from "@/components/AlertsPage";
import HRPage from "@/components/HRPage";
import MyProfile from "@/components/MyProfile";
import PostingTracker from "@/components/PostingTracker";
import AgentDashboard from "@/components/AgentDashboard";
import Creatives from "@/components/Creatives";
import Billing from "@/components/Billing";
import { setOrg } from "@/lib/org";
import { planAllowsPage, isOrgActive } from "@/lib/plans";
import { BRAND } from "@/lib/brand";

const PAGE_TITLES: Record<string, string> = {
  dashboard:    "Dashboard",
  clients:      "Clients",
  videos:       "Video Tracker",
  tasks:        "Tasks",
  board:        "D2C Board",
  finance:      "Finance",
  calendar:     "Content Calendar",
  postingtracker: "Posting Tracker",
  attendance:   "My Attendance",
  reports:      "Reports",
  team:         "Team",
  permissions:  "Permissions",
  activity:     "Activity",
  settings:     "Settings",
  timesheet:    "Timesheet",
  shootplanner: "Shoot Planner",
  leads:        "Leads",
  meetings:     "Meetings",
  contentidea:  "Content Ideas",
  creatives:    "Creatives",
  alerts:       "Alerts",
  hr:           "HR Management",
  myprofile:    "My Profile",
  agent:        "Morning Briefing",
  billing:      "Plan & Billing",
};

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [org, setOrgState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePageState] = useState("dashboard");
  const setActivePage = (page: string) => {
    try { localStorage.setItem("crm-active-page", page); } catch {}
    setActivePageState(page);
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("crm-active-page");
      if (saved) setActivePageState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    // Safety timeout — if auth never resolves (e.g. iPhone Safari ITP), show login after 8s
    // authResolved prevents the timeout from firing after auth already handled loading state
    let authResolved = false;
    const timeout = setTimeout(() => {
      if (!authResolved) setLoading(false);
    }, 8000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      authResolved = true;
      clearTimeout(timeout);
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authResolved = true;
      clearTimeout(timeout);
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => { subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  // Re-fetch profile whenever admin changes permissions for the logged-in user
  useEffect(() => {
    if (!session?.user?.id) return;
    const channel = supabase
      .channel(`profile-${session.user.id}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${session.user.id}`,
      }, () => {
        fetchProfile(session.user.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .limit(1);
      if (error) {
        console.error("Profile fetch error:", error.message);
        setProfile({ id: userId });
      } else if (data && data.length > 0) {
        if (data[0].status === "left") {
          await supabase.auth.signOut();
          setError("Your access has been revoked. Please contact your administrator.");
          setLoading(false);
          return;
        }
        await fetchOrg(data[0].org_id);
        setProfile(data[0]);
      } else {
        // Not a team member: client-portal users belong on /client.
        const { data: cp } = await supabase.from("client_profiles").select("id").eq("id", userId).maybeSingle();
        if (cp) { window.location.href = "/client"; return; }
        await supabase.auth.signOut();
        setError("This account is not linked to any workspace.");
      }
    } catch (err) {
      console.error("fetchProfile exception:", err);
      setProfile({ id: userId });
    }
    setLoading(false);
  };

  const fetchOrg = async (orgId: string) => {
    const { data } = await supabase.from("organizations").select("*").eq("id", orgId).maybeSingle();
    setOrg(data);
    setOrgState(data);
  };

  const handleLogin = async () => {
    setLoggingIn(true);
    setError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError("Invalid email or password. Please try again.");
      setLoggingIn(false);
      return;
    }
    // Explicitly set session + fetch profile for iPhone Safari
    if (data?.session) {
      setSession(data.session);
      await fetchProfile(data.session.user.id);
    }
    setLoggingIn(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    try { localStorage.removeItem("crm-active-page"); } catch {}
    setActivePageState("dashboard");
  };

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!profile?.name) return;
    const ch = supabase
      .channel(`board-assign-${profile.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "board_tasks" }, (payload) => {
        const task = payload.new as any;
        const names: string[] = task.assignee?.split(", ").filter(Boolean) || [];
        if (names.includes(profile.name)) {
          showToast({ type: "task", title: "New D2C Task Assigned", body: `${task.title}${task.client ? " · " + task.client : ""}`, noClick: true });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.name]);

  const renderPage = () => {
    const inPlan = (page: string) => planAllowsPage(org?.plan, page);
    const can = (page: string) => inPlan(page) && (isAdmin || profile?.permissions?.[page] === true);
    if (PAGE_TITLES[activePage] && !inPlan(activePage)) {
      return <UpgradeRequired isAdmin={isAdmin} onUpgrade={() => setActivePage("billing")} />;
    }
    switch (activePage) {
      case "billing":      return isAdmin             ? <Billing org={org} onChanged={() => fetchOrg(org.id)} />  : <AccessDenied />;
      case "dashboard":    return isAdmin ? <Dashboard profile={profile} isAdmin={isAdmin} setActivePage={setActivePage} /> : <MemberDashboard profile={profile} setActivePage={setActivePage} />;
      case "clients":      return can("clients")      ? <Clients />                                              : <AccessDenied />;
      case "videos":       return can("videos")       ? <VideoTracker />                                         : <AccessDenied />;
      case "tasks":        return can("tasks")        ? <Tasks profile={profile} isAdmin={isAdmin} />            : <AccessDenied />;
      case "board":        return can("board")        ? <Board />                                                : <AccessDenied />;
      case "finance":      return can("finance")      ? <Finance />                                              : <AccessDenied />;
      case "calendar":     return can("calendar")     ? <ContentCalendar />                                      : <AccessDenied />;
      case "postingtracker": return can("postingtracker") ? <PostingTracker />                                     : <AccessDenied />;
      case "attendance":   return <AttendancePage profile={profile} isAdmin={isAdmin} />;
      case "reports":      return isAdmin             ? <Reports profile={profile} isAdmin={isAdmin} />          : <AccessDenied />;
      case "team":         return isAdmin             ? <Team />                                                  : <AccessDenied />;
      case "permissions":  return isAdmin             ? <Permissions />                                          : <AccessDenied />;
      case "activity":     return isAdmin             ? <Activity />                                             : <AccessDenied />;
      case "settings":     return isAdmin             ? <Settings />                                             : <AccessDenied />;
      case "alerts":       return isAdmin             ? <AlertsPage />                                           : <AccessDenied />;
      case "clientportal": return isAdmin             ? <ClientPortalManager />                                  : <AccessDenied />;
      case "timesheet":    return can("timesheet")    ? <Timesheet profile={profile} isAdmin={isAdmin} />        : <AccessDenied />;
      case "leads":        return can("leads")        ? <Leads profile={profile} isAdmin={isAdmin} />           : <AccessDenied />;
      case "meetings":     return can("meetings")     ? <Meetings profile={profile} isAdmin={isAdmin} />        : <AccessDenied />;
      case "shootplanner": return can("shootplanner") ? <ShootPlanner />                                        : <AccessDenied />;
      case "contentidea":  return can("contentidea")   ? <ContentIdea />                                          : <AccessDenied />;
      case "creatives":    return can("creatives")     ? <Creatives profile={profile} isAdmin={isAdmin} />         : <AccessDenied />;
      case "hr":           return <HRPage profile={profile} isAdmin={isAdmin} />;
      case "agent":        return isAdmin             ? <AgentDashboard setActivePage={setActivePage} />          : <AccessDenied />;
      case "myprofile":    return <MyProfile profile={profile} />;
      default:             return <Dashboard profile={profile} isAdmin={isAdmin} setActivePage={setActivePage} />;
    }
  };

  if (loading) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ textAlign: "center", color: "var(--text3)" }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, overflow: "hidden", margin: "0 auto 16px" }}>
          <img src={BRAND.logo} alt={BRAND.name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
        </div>
        <div style={{ fontSize: 15 }}>Loading...</div>
      </div>
    </div>
  );

  if (!session) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: "16px" }}>
      <div style={{
        position: "fixed", inset: 0,
        background: "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(109,93,252,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(96,165,250,0.05) 0%, transparent 60%)",
        pointerEvents: "none"
      }} />
      <div style={{
        background: "var(--modal-bg)", border: "1px solid var(--border2)",
        borderRadius: 20, padding: "32px 28px", width: "100%", maxWidth: 420,
        position: "relative", zIndex: 1
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden", margin: "0 auto 14px", boxShadow: "0 8px 24px rgba(109,93,252,0.4)" }}>
            <img src={BRAND.logo} alt={BRAND.name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px" }}>{BRAND.name}</div>
          <div style={{ fontSize: 14, color: "var(--text3)", marginTop: 4 }}>Sign in to your workspace</div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" }}>Email</label>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="your@email.com"
            type="email"
            autoCapitalize="none"
            autoCorrect="off"
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{ width: "100%", background: "var(--input-bg)", border: "1px solid var(--border2)", borderRadius: 10, padding: "13px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 16, outline: "none", WebkitAppearance: "none" }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text3)", display: "block", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".6px" }}>Password</label>
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            type="password"
            onKeyDown={e => e.key === "Enter" && handleLogin()}
            style={{ width: "100%", background: "var(--input-bg)", border: "1px solid var(--border2)", borderRadius: 10, padding: "13px 14px", color: "var(--text)", fontFamily: "inherit", fontSize: 16, outline: "none", WebkitAppearance: "none" }}
          />
        </div>

        {error && (
          <div style={{ background: "var(--red-bg)", border: "1px solid var(--red-border)", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "var(--red)", marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loggingIn}
          style={{ width: "100%", padding: 14, background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: loggingIn ? 0.7 : 1, WebkitTapHighlightColor: "transparent" }}
        >
          {loggingIn ? "Signing in..." : "Sign In"}
        </button>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 12, color: "var(--text3)" }}>
          New agency? <a href="/signup" style={{ color: "var(--accent2)", fontWeight: 600 }}>Create your workspace</a>
          <div style={{ marginTop: 6 }}>Team member? Ask your workspace admin for access.</div>
        </div>
      </div>
    </div>
  );

  if (!isOrgActive(org)) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", overflowY: "auto" }}>
      {isAdmin ? (
        <Billing org={org} locked onChanged={() => fetchOrg(org.id)} onLogout={handleLogout} />
      ) : (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ textAlign: "center", color: "var(--text2)", maxWidth: 380 }}>
            <i className="ti ti-lock" style={{ fontSize: 44, opacity: .4 }} />
            <div style={{ marginTop: 14, fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Workspace paused</div>
            <div style={{ marginTop: 8, fontSize: 14 }}>{org?.name || "This workspace"}&apos;s subscription is inactive. Please ask your workspace admin to renew the plan.</div>
            <button onClick={handleLogout} style={{ marginTop: 20, padding: "10px 18px", borderRadius: 10, border: "1px solid var(--border2)", background: "transparent", color: "var(--text2)", cursor: "pointer", fontFamily: "inherit" }}>Sign out</button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div
        className={`sidebar-overlay${sidebarOpen ? " open" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(true)}
        aria-label="Open menu"
      >
        <i className="ti ti-menu-2" />
      </button>

      <div className="crm-app-layout" style={{ display: "flex", overflow: "hidden", background: "var(--bg)" }}>
        <Sidebar
          activePage={activePage}
          setActivePage={setActivePage}
          profile={profile}
          isAdmin={isAdmin}
          org={org}
          onLogout={handleLogout}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <main className="crm-main" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="mobile-topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                <img src={BRAND.logo} alt={BRAND.name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              </div>
              <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", letterSpacing: "-0.3px" }}>
                {PAGE_TITLES[activePage] || BRAND.name}
              </span>
            </div>
          </div>
          {renderPage()}
        </main>
        <ChatPanel profile={profile} />
        <ToastContainer />
        <FloatingQuickTask isAdmin={isAdmin} />
        <AlertSystem profile={profile} />
      </div>
    </>
  );
}

function AttendancePage({ profile, isAdmin }: { profile: any; isAdmin: boolean }) {
  const todayLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  if (isAdmin) return <AdminAttendancePage todayLabel={todayLabel} />;

  return (
    <div className="page-wrap" style={{ maxWidth: 680, margin: "0 auto", width: "100%" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px", margin: 0 }}>
          <i className="ti ti-clock-check" style={{ marginRight: 10, color: "var(--accent2)" }} />
          My Attendance
        </h1>
        <p style={{ fontSize: 14, color: "var(--text3)", marginTop: 6, marginBottom: 0 }}>{todayLabel}</p>
      </div>
      <div className="crm-card" style={{ padding: 24, marginBottom: 20 }}>
        <Attendance profile={profile} key={profile?.id} />
      </div>
      <PersonalHistory profile={profile} />
    </div>
  );
}

function AdminAttendancePage({ todayLabel }: { todayLabel: string }) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [members, setMembers] = useState<any[]>([]);
  const [records, setRecords] = useState<Record<string, any>>({});
  const [leavesMap, setLeavesMap] = useState<Record<string, any>>({});
  const [pendingLeavesMap, setPendingLeavesMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<Record<string, number>>({});

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    const ch = supabase.channel("admin-attendance-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, () => fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "leave_requests" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(prev => {
        const next = { ...prev };
        Object.values(records).forEach((rec: any) => {
          if (rec.clock_in && !rec.clock_out) {
            const workedMs = Date.now() - new Date(rec.clock_in).getTime() - (rec.total_break_minutes || 0) * 60000;
            next[rec.user_id] = Math.max(0, Math.floor(workedMs / 1000));
          }
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [records]);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: team }, { data: att }, { data: leaves }, { data: pendingLeaves }] = await Promise.all([
      supabase.from("profiles").select("id, name, color, role").neq("role", "admin").neq("status", "left").order("created_at"),
      supabase.from("attendance").select("*").eq("date", todayStr),
      supabase.from("leave_requests").select("*").eq("status", "approved")
        .lte("start_date", todayStr).gte("end_date", todayStr),
      supabase.from("leave_requests").select("*").eq("status", "pending")
        .lte("start_date", todayStr).gte("end_date", todayStr),
    ]);
    if (team) setMembers(team);
    if (att) {
      const rec: Record<string, any> = {};
      att.forEach((r: any) => { rec[r.user_id] = r; });
      setRecords(rec);
    }
    if (leaves) {
      const lm: Record<string, any> = {};
      leaves.forEach((l: any) => { lm[l.member_id] = l; });
      setLeavesMap(lm);
    }
    if (pendingLeaves) {
      const pm: Record<string, any> = {};
      pendingLeaves.forEach((l: any) => { pm[l.member_id] = l; });
      setPendingLeavesMap(pm);
    }
    setLoading(false);
  };

  const doClockIn = async (userId: string) => {
    setActing(userId);
    const now = new Date().toISOString();
    // If a record exists (e.g. already clocked out), restart the session on that record
    const { data: existing } = await supabase.from("attendance").select("id").eq("user_id", userId).eq("date", todayStr).maybeSingle();
    if (existing) {
      const { data } = await supabase.from("attendance")
        .update({ clock_in: now, clock_out: null, break_start: null, break_end: null, total_break_minutes: 0, on_shoot: false, work_from_home: false })
        .eq("id", existing.id).select().single();
      if (data) setRecords(r => ({ ...r, [userId]: data }));
    } else {
      const { data } = await supabase.from("attendance").insert({ user_id: userId, date: todayStr, clock_in: now, total_break_minutes: 0, on_shoot: false }).select().single();
      if (data) setRecords(r => ({ ...r, [userId]: data }));
    }
    setActing(null);
  };

  const doClockOut = async (rec: any) => {
    setActing(rec.user_id);
    const { data } = await supabase.from("attendance").update({ clock_out: new Date().toISOString(), on_shoot: false, shoot_start: null }).eq("id", rec.id).select().single();
    if (data) setRecords(r => ({ ...r, [rec.user_id]: data }));
    setActing(null);
  };

  const doShootStart = async (rec: any) => {
    setActing(rec.user_id);
    const { data } = await supabase.from("attendance").update({ on_shoot: true, shoot_start: new Date().toISOString() }).eq("id", rec.id).select().single();
    if (data) setRecords(r => ({ ...r, [rec.user_id]: data }));
    setActing(null);
  };

  const doShootEnd = async (rec: any) => {
    setActing(rec.user_id);
    const { data } = await supabase.from("attendance").update({ on_shoot: false, shoot_start: null }).eq("id", rec.id).select().single();
    if (data) setRecords(r => ({ ...r, [rec.user_id]: data }));
    setActing(null);
  };

  const doBreakStart = async (rec: any) => {
    setActing(rec.user_id);
    const now = new Date().toISOString();
    const { data, error } = await supabase.from("attendance").update({ break_start: now, break_end: null }).eq("id", rec.id).select().single();
    if (error) console.error("Admin break start error:", error);
    const updated = data ?? { ...rec, break_start: now, break_end: null };
    setRecords(r => ({ ...r, [rec.user_id]: updated }));
    setActing(null);
  };

  const doBreakEnd = async (rec: any) => {
    setActing(rec.user_id);
    const now = new Date();
    const breakMins = Math.round((now.getTime() - new Date(rec.break_start).getTime()) / 60000);
    const totalBreak = (rec.total_break_minutes || 0) + breakMins;
    const { data, error } = await supabase.from("attendance").update({ break_end: now.toISOString(), total_break_minutes: totalBreak, break_start: null }).eq("id", rec.id).select().single();
    if (error) console.error("Admin break end error:", error);
    const updated = data ?? { ...rec, break_start: null, break_end: now.toISOString(), total_break_minutes: totalBreak };
    setRecords(r => ({ ...r, [rec.user_id]: updated }));
    setActing(null);
  };

  const doMarkAbsent = async (userId: string) => {
    setActing(userId);
    const { data: existing } = await supabase.from("attendance").select("id").eq("user_id", userId).eq("date", todayStr).maybeSingle();
    if (existing) {
      const { data } = await supabase.from("attendance").update({ is_absent: true }).eq("id", existing.id).select().single();
      if (data) setRecords(r => ({ ...r, [userId]: data }));
    } else {
      const { data } = await supabase.from("attendance").insert({ user_id: userId, date: todayStr, is_absent: true, total_break_minutes: 0, on_shoot: false }).select().single();
      if (data) setRecords(r => ({ ...r, [userId]: data }));
    }
    setActing(null);
  };

  const doMedicalLeave = async (member: any) => {
    setActing(member.id);
    const { data: existing } = await supabase.from("attendance").select("id").eq("user_id", member.id).eq("date", todayStr).maybeSingle();
    if (existing) {
      const { data } = await supabase.from("attendance").update({ on_leave: true, leave_type: "medical", is_absent: false }).eq("id", existing.id).select().single();
      if (data) setRecords(r => ({ ...r, [member.id]: data }));
    } else {
      const { data } = await supabase.from("attendance").insert({ user_id: member.id, date: todayStr, on_leave: true, leave_type: "medical", total_break_minutes: 0, on_shoot: false }).select().single();
      if (data) setRecords(r => ({ ...r, [member.id]: data }));
    }
    await supabase.from("leave_requests").insert([{
      member_id: member.id, member_name: member.name,
      start_date: todayStr, end_date: todayStr,
      leave_type: "medical", reason: "Medical leave marked by admin", status: "approved",
    }]);
    setPendingLeavesMap(p => { const n = { ...p }; delete n[member.id]; return n; });
    setActing(null);
  };

  const fmtTime = (iso: string) => iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—";
  const fmtElapsed = (secs: number) => {
    if (!secs) return "00:00:00";
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  };
  const fmtMins = (mins: number) => {
    if (!mins) return "0m";
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const btnStyle = (color: string, bg: string, border: string): React.CSSProperties => ({
    padding: "6px 12px", borderRadius: 8, border: `1px solid ${border}`,
    background: bg, color, fontSize: 12, fontWeight: 700, cursor: "pointer",
    fontFamily: "inherit", whiteSpace: "nowrap",
  });

  const wfhCount          = members.filter(m => records[m.id]?.clock_in && !records[m.id]?.clock_out && !records[m.id]?.on_shoot && !records[m.id]?.is_absent && records[m.id]?.work_from_home).length;
  const presentCount      = members.filter(m => records[m.id]?.clock_in && !records[m.id]?.clock_out && !records[m.id]?.on_shoot && !records[m.id]?.is_absent && !records[m.id]?.work_from_home).length;
  const onShootCount      = members.filter(m => records[m.id]?.on_shoot).length;
  const onLeaveCount      = members.filter(m => !records[m.id]?.clock_in && (leavesMap[m.id] || (records[m.id]?.on_leave && !records[m.id]?.is_absent))).length;
  const absentCount       = members.filter(m => records[m.id]?.is_absent || (!records[m.id] && !leavesMap[m.id] && !pendingLeavesMap[m.id])).length;
  const pendingLeaveCount = members.filter(m => pendingLeavesMap[m.id] && !records[m.id] && !leavesMap[m.id]).length;
  const doneCount         = members.filter(m => records[m.id]?.clock_out).length;

  return (
    <div className="page-wrap">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.5px", margin: 0 }}>
            <i className="ti ti-calendar-check" style={{ marginRight: 10, color: "var(--accent2)" }} />
            Team Attendance
          </h1>
          <p style={{ fontSize: 14, color: "var(--text3)", marginTop: 6, marginBottom: 0 }}>{todayLabel}</p>
        </div>
        <button onClick={fetchAll} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border2)", background: "var(--glass2)", color: "var(--text2)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ti ti-refresh" /> Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="stat-grid-4" style={{ gridTemplateColumns: "repeat(7,1fr)" }}>
        {[
          { label: "In Office",     val: presentCount,      color: "var(--green)", icon: "ti-clock-play"  },
          { label: "Work From Home",val: wfhCount,          color: "#60a5fa",      icon: "ti-home"        },
          { label: "On Shoot",      val: onShootCount,      color: "#a78bfa",      icon: "ti-camera"      },
          { label: "On Leave",      val: onLeaveCount,      color: "#4ade80",      icon: "ti-beach"       },
          { label: "Leave Applied", val: pendingLeaveCount, color: "var(--amber)", icon: "ti-clock"       },
          { label: "Absent",        val: absentCount,       color: "var(--red)",   icon: "ti-clock-off"   },
          { label: "Checked Out",   val: doneCount,         color: "var(--text3)", icon: "ti-clock-stop"  },
        ].map((s, i) => (
          <div key={i} className="crm-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${s.color}18`, border: `1px solid ${s.color}25`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${s.icon}`} style={{ color: s.color, fontSize: 17 }} />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color, letterSpacing: "-0.5px", lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
          <i className="ti ti-loader" style={{ fontSize: 32, opacity: .4 }} />
          <div style={{ marginTop: 12, fontSize: 15 }}>Loading attendance...</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {members.map(member => {
            const rec             = records[member.id];
            const leaveRec        = leavesMap[member.id];
            const pendingLeaveRec = pendingLeavesMap[member.id];
            const isActing        = acting === member.id;
            const isAbsentMarked  = !!rec?.is_absent;
            const hasClockedIn    = !!rec?.clock_in;
            // half-day leave: person can clock in for afternoon — once clocked in they are no longer "on leave"
            const isOnLeave       = !hasClockedIn && (!!leaveRec || !!rec?.on_leave) && !isAbsentMarked;
            const isPendingLeave  = !!pendingLeaveRec && !leaveRec && !rec;
            // allow isClockedIn even if on_leave=true (old records before fix) as long as clock_in is set and leave_type is half_day
            const isClockedIn     = !!rec?.clock_in && !rec?.clock_out && !isAbsentMarked && (!rec?.on_leave || rec?.leave_type === "half_day");
            const isOnBreak       = isClockedIn && !!rec?.break_start && !rec?.break_end;
            const isOnShoot       = isClockedIn && !!rec?.on_shoot;
            const isWFH           = isClockedIn && !!rec?.work_from_home;
            const isClockedOut    = !!rec?.clock_out;
            const isAbsent        = !rec && !leaveRec && !pendingLeaveRec;

            const leaveType = (leaveRec?.leave_type || rec?.leave_type) || "paid";
            const leaveLabel = leaveType === "half_day" ? "Paid Leave ½ Day" : leaveType.charAt(0).toUpperCase() + leaveType.slice(1) + " Leave";

            let statusLabel  = "Absent";
            let statusColor  = "var(--red)";
            let statusBg     = "rgba(248,113,113,0.1)";
            let statusBorder = "rgba(248,113,113,0.2)";
            if (isClockedOut)    { statusLabel = "Checked Out";     statusColor = "var(--text3)"; statusBg = "rgba(255,255,255,0.04)"; statusBorder = "var(--border)"; }
            else if (isOnShoot)  { statusLabel = "On Shoot";        statusColor = "#a78bfa";      statusBg = "rgba(167,139,250,0.1)";  statusBorder = "rgba(167,139,250,0.3)"; }
            else if (isOnBreak)  { statusLabel = "On Break";        statusColor = "var(--amber)"; statusBg = "rgba(251,191,36,0.1)";   statusBorder = "rgba(251,191,36,0.2)"; }
            else if (isWFH)      { statusLabel = "Work From Home";  statusColor = "#60a5fa";      statusBg = "rgba(96,165,250,0.1)";   statusBorder = "rgba(96,165,250,0.3)"; }
            else if (isClockedIn){ statusLabel = "In Office";       statusColor = "var(--green)"; statusBg = "rgba(52,211,153,0.1)";   statusBorder = "rgba(52,211,153,0.2)"; }
            else if (isAbsentMarked) { statusLabel = "Absent ✓"; statusColor = "var(--red)";  statusBg = "rgba(248,113,113,0.15)"; statusBorder = "rgba(248,113,113,0.4)"; }
            else if (isOnLeave)  { statusLabel = leaveLabel;     statusColor = "#4ade80";      statusBg = "rgba(74,222,128,0.1)";   statusBorder = "rgba(74,222,128,0.3)"; }
            else if (isPendingLeave) { statusLabel = "Leave Applied"; statusColor = "var(--amber)"; statusBg = "rgba(251,191,36,0.1)"; statusBorder = "rgba(251,191,36,0.2)"; }

            return (
              <div key={member.id} className="crm-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                {/* Avatar */}
                <div style={{ width: 42, height: 42, borderRadius: 12, background: member.color || "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                  {member.name?.[0] || "?"}
                </div>

                {/* Name + times */}
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 15 }}>{member.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {isAbsentMarked
                      ? <span style={{ color: "var(--red)" }}><i className="ti ti-clock-off" style={{ marginRight: 4 }} />Marked absent today</span>
                      : isPendingLeave
                        ? <span style={{ color: "var(--amber)" }}><i className="ti ti-clock" style={{ marginRight: 4 }} />Leave applied · Pending approval</span>
                        : isOnLeave
                          ? <span style={{ color: "#4ade80" }}><i className="ti ti-beach" style={{ marginRight: 4 }} />{leaveLabel} approved</span>
                          : <>
                              <span><i className="ti ti-login"  style={{ marginRight: 3 }} />{rec?.clock_in  ? fmtTime(rec.clock_in)  : "—"}</span>
                              <span><i className="ti ti-logout" style={{ marginRight: 3 }} />{rec?.clock_out ? fmtTime(rec.clock_out) : "—"}</span>
                              {(rec?.total_break_minutes > 0) && <span><i className="ti ti-coffee" style={{ marginRight: 3 }} />{fmtMins(rec.total_break_minutes)}</span>}
                            </>
                    }
                  </div>
                </div>

                {/* Live timer if present */}
                {isClockedIn && !isClockedOut && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: isOnShoot ? "#a78bfa" : isOnBreak ? "var(--amber)" : "var(--accent2)", fontVariantNumeric: "tabular-nums", minWidth: 70, textAlign: "center" }}>
                    {isOnBreak ? <i className="ti ti-coffee" /> : isOnShoot ? <><i className="ti ti-camera" style={{ display: "block", marginBottom: 2 }} /><span style={{ fontSize: 10, fontWeight: 600 }}>{rec?.shoot_start ? fmtTime(rec.shoot_start) : ""}</span></> : fmtElapsed(elapsed[member.id] || 0)}
                  </div>
                )}

                {/* Status badge */}
                <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, background: statusBg, color: statusColor, border: `1px solid ${statusBorder}`, whiteSpace: "nowrap" }}>
                  {statusLabel}
                </span>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {isAbsent && (
                    <>
                      <button onClick={() => doClockIn(member.id)} disabled={isActing} style={btnStyle("var(--green)", "rgba(52,211,153,0.1)", "rgba(52,211,153,0.3)")}>
                        {isActing ? "..." : <><i className="ti ti-clock-play" /> Clock In</>}
                      </button>
                      <button onClick={() => doMarkAbsent(member.id)} disabled={isActing} style={btnStyle("var(--red)", "rgba(248,113,113,0.1)", "rgba(248,113,113,0.3)")}>
                        {isActing ? "..." : <><i className="ti ti-clock-off" /> Mark Absent</>}
                      </button>
                      <button onClick={() => doMedicalLeave(member)} disabled={isActing} style={btnStyle("#4ade80", "rgba(74,222,128,0.1)", "rgba(74,222,128,0.3)")}>
                        {isActing ? "..." : <><i className="ti ti-heart-rate-monitor" /> Medical Leave</>}
                      </button>
                    </>
                  )}
                  {isPendingLeave && (
                    <>
                      <button onClick={() => doClockIn(member.id)} disabled={isActing} style={btnStyle("var(--green)", "rgba(52,211,153,0.1)", "rgba(52,211,153,0.3)")}>
                        {isActing ? "..." : <><i className="ti ti-clock-play" /> Clock In</>}
                      </button>
                      <button onClick={() => doMarkAbsent(member.id)} disabled={isActing} style={btnStyle("var(--red)", "rgba(248,113,113,0.1)", "rgba(248,113,113,0.3)")}>
                        {isActing ? "..." : <><i className="ti ti-clock-off" /> Mark Absent</>}
                      </button>
                    </>
                  )}
                  {(isOnLeave || isAbsentMarked) && (
                    <span style={{ fontSize: 12, color: isAbsentMarked ? "var(--red)" : "#4ade80", padding: "6px 0", display: "flex", alignItems: "center", gap: 5 }}>
                      {isAbsentMarked ? <><i className="ti ti-clock-off" /> Absent marked</> : <><i className="ti ti-beach" /> Approved leave</>}
                    </span>
                  )}
                  {isClockedIn && !isClockedOut && !isOnBreak && !isOnShoot && (
                    <>
                      <button onClick={() => doBreakStart(rec)} disabled={isActing} style={btnStyle("var(--amber)", "rgba(251,191,36,0.1)", "rgba(251,191,36,0.3)")}>
                        {isActing ? "..." : <><i className="ti ti-coffee" /> Break</>}
                      </button>
                      <button onClick={() => doShootStart(rec)} disabled={isActing} style={btnStyle("#a78bfa", "rgba(167,139,250,0.1)", "rgba(167,139,250,0.3)")}>
                        {isActing ? "..." : <><i className="ti ti-camera" /> Shoot</>}
                      </button>
                      <button onClick={() => doClockOut(rec)} disabled={isActing} style={btnStyle("var(--red)", "rgba(248,113,113,0.1)", "rgba(248,113,113,0.3)")}>
                        {isActing ? "..." : <><i className="ti ti-clock-stop" /> Clock Out</>}
                      </button>
                    </>
                  )}
                  {isOnShoot && (
                    <>
                      <button onClick={() => doShootEnd(rec)} disabled={isActing} style={btnStyle("#a78bfa", "rgba(167,139,250,0.15)", "rgba(167,139,250,0.4)")}>
                        {isActing ? "..." : <><i className="ti ti-building" /> Back in Office</>}
                      </button>
                      <button onClick={() => doClockOut(rec)} disabled={isActing} style={btnStyle("var(--red)", "rgba(248,113,113,0.1)", "rgba(248,113,113,0.3)")}>
                        {isActing ? "..." : <><i className="ti ti-clock-stop" /> Clock Out</>}
                      </button>
                    </>
                  )}
                  {isOnBreak && (
                    <>
                      <button onClick={() => doBreakEnd(rec)} disabled={isActing} style={btnStyle("var(--amber)", "rgba(251,191,36,0.15)", "rgba(251,191,36,0.4)")}>
                        {isActing ? "..." : <><i className="ti ti-player-play" /> End Break</>}
                      </button>
                      <button onClick={() => doClockOut(rec)} disabled={isActing} style={btnStyle("var(--red)", "rgba(248,113,113,0.1)", "rgba(248,113,113,0.3)")}>
                        {isActing ? "..." : <><i className="ti ti-clock-stop" /> Clock Out</>}
                      </button>
                    </>
                  )}
                  {isClockedOut && (
                    <span style={{ fontSize: 12, color: "var(--text3)", padding: "6px 0" }}>✓ Done for today</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PersonalHistory({ profile }: { profile: any }) {
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    const from = new Date(); from.setDate(from.getDate() - 6);
    supabase.from("attendance")
      .select("*")
      .eq("user_id", profile.id)
      .gte("date", from.toISOString().split("T")[0])
      .order("date", { ascending: false })
      .then(({ data }) => setRows(data || []));
  }, [profile?.id]);

  const fmtMins = (mins: number) => {
    if (!mins) return "—";
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const calcWorked = (r: any) => {
    if (!r.clock_in) return 0;
    const end = r.clock_out ? new Date(r.clock_out) : new Date();
    return Math.max(0, (end.getTime() - new Date(r.clock_in).getTime()) / 60000 - (r.total_break_minutes || 0));
  };

  if (rows.length === 0) return null;

  return (
    <div className="crm-card" style={{ padding: 24 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 16, letterSpacing: "-0.3px" }}>
        <i className="ti ti-history" style={{ marginRight: 8, color: "var(--accent2)" }} />
        Last 7 Days
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {rows.map((r, i) => {
          const worked = calcWorked(r);
          const isDone = !!r.clock_out;
          return (
            <div key={r.id} style={{
              display: "grid", gridTemplateColumns: "1fr auto auto auto",
              gap: 12, alignItems: "center",
              padding: "11px 0",
              borderBottom: i < rows.length - 1 ? "1px solid var(--border)" : "none",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  {new Date(r.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
                  {r.clock_in ? new Date(r.clock_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                  {" → "}
                  {r.clock_out ? new Date(r.clock_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600 }}>{fmtMins(r.total_break_minutes || 0)}</div>
                <div style={{ fontSize: 10, color: "var(--text3)" }}>break</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{fmtMins(worked)}</div>
                <div style={{ fontSize: 10, color: "var(--text3)" }}>worked</div>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 6,
                background: isDone ? "rgba(74,222,128,0.08)" : "rgba(109,93,252,0.12)",
                color: isDone ? "#4ade80" : "var(--accent2)",
                border: `1px solid ${isDone ? "rgba(74,222,128,0.2)" : "rgba(109,93,252,0.2)"}`,
                whiteSpace: "nowrap",
              }}>
                {isDone ? "Done" : "Active"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UpgradeRequired({ isAdmin, onUpgrade }: { isAdmin: boolean; onUpgrade: () => void }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ textAlign: "center", color: "var(--text3)", maxWidth: 360 }}>
        <i className="ti ti-sparkles" style={{ fontSize: 48, opacity: .4 }} />
        <div style={{ marginTop: 16, fontSize: 18, fontWeight: 600, color: "var(--text2)" }}>Not included in your plan</div>
        <div style={{ marginTop: 8, fontSize: 14 }}>{isAdmin ? "Upgrade your plan to unlock this module." : "Ask your workspace admin to upgrade the plan to unlock this module."}</div>
        {isAdmin && (
          <button onClick={onUpgrade} style={{ marginTop: 18, padding: "10px 18px", borderRadius: 10, border: "none", background: "var(--accent)", color: "#fff", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            See plans
          </button>
        )}
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: "var(--text3)" }}>
        <i className="ti ti-shield-lock" style={{ fontSize: 48, opacity: .3 }} />
        <div style={{ marginTop: 16, fontSize: 18, fontWeight: 600, color: "var(--text2)" }}>Access Restricted</div>
        <div style={{ marginTop: 8, fontSize: 14 }}>You don't have permission to view this page.</div>
      </div>
    </div>
  );
}