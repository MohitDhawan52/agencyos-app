"use client";
import { useEffect, useState } from "react";
import NotificationBell from "./NotificationBell";
import { BRAND } from "@/lib/brand";
import { planAllowsPage } from "@/lib/plans";

interface SidebarProps {
  activePage: string;
  setActivePage: (page: string) => void;
  profile: any;
  isAdmin: boolean;
  org?: any;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

// Safe localStorage wrapper — prevents crashes in iOS Safari Private Browsing
const safeStorage = {
  get: (key: string): string | null => {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set: (key: string, val: string): void => {
    try { localStorage.setItem(key, val); } catch {}
  },
};

export default function Sidebar({ activePage, setActivePage, profile, isAdmin, org, onLogout, isOpen = true, onClose }: SidebarProps) {
  const [isDark, setIsDark] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = safeStorage.get("crm-theme");
    if (saved === "light") {
      setIsDark(false);
      document.documentElement.classList.add("light");
    } else {
      setIsDark(true);
      document.documentElement.classList.remove("light");
    }
    const savedCollapsed = safeStorage.get("crm-sidebar-collapsed");
    if (savedCollapsed === "true") setCollapsed(true);
  }, []);

  const toggleTheme = () => {
    const newDark = !isDark;
    setIsDark(newDark);
    if (newDark) {
      document.documentElement.classList.remove("light");
      safeStorage.set("crm-theme", "dark");
    } else {
      document.documentElement.classList.add("light");
      safeStorage.set("crm-theme", "light");
    }
  };

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    safeStorage.set("crm-sidebar-collapsed", String(next));
  };

  const handleNav = (id: string) => {
    setActivePage(id);
    if (onClose) onClose();
  };

  const navItem = (id: string, icon: string, label: string, badge?: number) => {
    if (!planAllowsPage(org?.plan, id)) return null;
    const isActive = activePage === id;
    return (
      <button
        key={id}
        onClick={() => handleNav(id)}
        title={collapsed ? label : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 0 : 10,
          padding: collapsed ? "10px 0" : "9px 12px",
          justifyContent: collapsed ? "center" : "flex-start",
          borderRadius: 10,
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
          border: isActive ? "1px solid rgba(109,93,252,0.25)" : "1px solid transparent",
          fontSize: 13,
          fontWeight: isActive ? 600 : 500,
          transition: "all 0.15s",
          fontFamily: "inherit",
          letterSpacing: "-0.2px",
          background: isActive ? "rgba(109,93,252,0.12)" : "transparent",
          color: isActive ? "var(--accent2)" : "var(--text2)",
          marginBottom: 1,
          minHeight: 40,
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: isActive ? "rgba(109,93,252,0.2)" : "rgba(128,128,128,0.12)",
          border: `1px solid ${isActive ? "rgba(109,93,252,0.3)" : "rgba(128,128,128,0.15)"}`,
        }}>
          <i className={`ti ${icon}`} style={{ fontSize: 15, color: isActive ? "var(--accent2)" : "var(--text2)" }} />
        </div>
        {!collapsed && (
          <>
            <span style={{ flex: 1, color: isActive ? "var(--accent2)" : "var(--text)" }}>{label}</span>
            {badge !== undefined && badge > 0 && (
              <span style={{
                minWidth: 18, height: 18, borderRadius: 9,
                background: "rgba(245,158,11,0.85)", color: "#000",
                fontSize: 10, fontWeight: 800,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "0 5px",
              }}>{badge}</span>
            )}
          </>
        )}
      </button>
    );
  };

  const sectionLabel = (text: string) => (
    collapsed
      ? <div style={{ height: 1, background: "rgba(128,128,128,0.15)", margin: "8px 6px" }} />
      : <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text3)", letterSpacing: "0.8px", textTransform: "uppercase", padding: "10px 12px 5px" }}>{text}</div>
  );

  const divider = () => <div style={{ height: 1, background: "rgba(128,128,128,0.1)", margin: "6px 4px" }} />;

  const avatarColor = profile?.color || "var(--accent)";
  const sidebarWidth = collapsed ? 64 : 252;

  return (
    <nav
      className={`crm-sidebar${isOpen ? " open" : ""}${collapsed ? " collapsed" : ""}`}
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        background: "var(--sidebar-bg)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflowY: "auto",
        overflowX: "hidden",
        position: "relative",
        zIndex: 10,
        transition: "width 0.25s ease, min-width 0.25s ease",
      }}
    >
      {/* Logo & Header */}
      <div style={{ padding: collapsed ? "18px 8px" : "20px 16px 18px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10, justifyContent: collapsed ? "center" : "flex-start" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, overflow: "hidden", flexShrink: 0, boxShadow: "0 3px 12px rgba(109,93,252,0.4)" }}>
            <img src={BRAND.logo} alt={BRAND.name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          </div>
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{org?.name || BRAND.name}</div>
                <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 1 }}>{BRAND.name}</div>
              </div>
              <NotificationBell profile={profile} setActivePage={setActivePage} />
              <button onClick={toggleCollapse} title="Collapse" style={{ background: "transparent", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 18, padding: 4, display: "flex", alignItems: "center" }}>
                <i className="ti ti-layout-sidebar-left" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Nav Items */}
      <div style={{
        padding: collapsed ? "12px 6px" : "12px 10px",
        flex: 1, display: "flex", flexDirection: "column",
        overflowY: "auto", overflowX: "hidden",
      }}>
        {sectionLabel("Overview")}
        {navItem("dashboard", "ti-layout-dashboard", "Dashboard")}
        {(isAdmin || profile?.permissions?.clients) && navItem("clients", "ti-building-store", "Clients")}
        {(isAdmin || profile?.permissions?.videos) && navItem("videos", "ti-video", "Video Tracker")}
        {(isAdmin || profile?.permissions?.shootplanner) && navItem("shootplanner", "ti-camera", "Shoot Planner")}

        {divider()}

        {sectionLabel("Sales")}
        {(isAdmin || profile?.permissions?.leads) && navItem("leads", "ti-user-search", "Leads")}
        {(isAdmin || profile?.permissions?.meetings) && navItem("meetings", "ti-calendar-event", "Meetings")}

        {divider()}

        {sectionLabel("Work")}
        {(isAdmin || profile?.permissions?.tasks) && navItem("tasks", "ti-checkbox", "Tasks")}
        {(isAdmin || profile?.permissions?.board) && navItem("board", "ti-layout-kanban", "D2C Board")}
        {(isAdmin || profile?.permissions?.contentidea) && navItem("contentidea", "ti-bulb", "Content Ideas")}
        {(isAdmin || profile?.permissions?.creatives) && navItem("creatives", "ti-photo-video", "Creatives")}
        {isAdmin && navItem("finance", "ti-report-money", "Finance")}
        {(isAdmin || profile?.permissions?.calendar) && navItem("calendar", "ti-calendar", "Content Calendar")}
        {(isAdmin || profile?.permissions?.postingtracker) && navItem("postingtracker", "ti-chart-line", "Posting Tracker")}

        {divider()}

        {sectionLabel("Attendance")}
        {navItem("attendance", "ti-clock-check", "My Attendance")}
        {(isAdmin || profile?.permissions?.timesheet) && navItem("timesheet", "ti-clock-record", "Timesheet")}
        {isAdmin && navItem("reports", "ti-chart-bar", "Reports")}

        {divider()}
        {!isAdmin && sectionLabel("Profile")}
        {!isAdmin && navItem("myprofile", "ti-user-circle", "My Profile")}
        {!isAdmin && navItem("hr", "ti-report-money", "My Payroll")}

        {isAdmin && (
          <>
            {divider()}
            {sectionLabel("Agent")}
            {navItem("agent", "ti-robot", "Morning Briefing")}
            {divider()}
            {sectionLabel("Admin")}
            {navItem("team", "ti-users", "Team")}
            {navItem("hr", "ti-heart-rate-monitor", "HR Management")}
            {navItem("alerts", "ti-bell-ringing", "Alerts")}
            {navItem("clientportal", "ti-portal", "Client Portal")}
            {navItem("settings", "ti-settings-2", "Settings")}
            {navItem("billing", "ti-credit-card", "Plan & Billing")}
          </>
        )}
      </div>

      {/* Bottom */}
      <div style={{ padding: collapsed ? "10px 6px 16px" : "10px 10px 16px", borderTop: "1px solid var(--border)" }}>

        {/* Collapse toggle */}
        <button onClick={toggleCollapse} title={collapsed ? "Expand" : "Collapse"} style={{
          display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "flex-start",
          gap: 8, width: "100%", padding: collapsed ? "8px 0" : "8px 12px", marginBottom: 6,
          borderRadius: 8, background: "rgba(128,128,128,0.08)", border: "1px solid rgba(128,128,128,0.12)",
          color: "var(--text3)", cursor: "pointer", fontSize: 13, fontWeight: 500, fontFamily: "inherit",
        }}>
          <i className={`ti ${collapsed ? "ti-layout-sidebar-right" : "ti-layout-sidebar-left"}`} style={{ fontSize: 15 }} />
          {!collapsed && <span style={{ color: "var(--text2)" }}>Collapse</span>}
        </button>

        {/* Theme toggle */}
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px", marginBottom: 6, borderRadius: 8, background: "rgba(128,128,128,0.08)", border: "1px solid rgba(128,128,128,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <i className={`ti ${isDark ? "ti-moon" : "ti-sun"}`} style={{ fontSize: 13, color: isDark ? "var(--accent2)" : "#fbbf24" }} />
              <span style={{ fontSize: 12, color: "var(--text2)", fontWeight: 500 }}>{isDark ? "Dark" : "Light"} Mode</span>
            </div>
            <div onClick={toggleTheme} style={{
              width: 38, height: 22, borderRadius: 11,
              background: isDark ? "var(--accent)" : "rgba(128,128,128,0.25)",
              position: "relative", cursor: "pointer", transition: "background 0.25s", flexShrink: 0,
            }}>
              <div style={{
                position: "absolute", width: 16, height: 16, background: "#fff", borderRadius: "50%",
                top: 3, left: isDark ? 19 : 3, transition: "left 0.25s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
              }} />
            </div>
          </div>
        )}

        {/* Profile */}
        <div style={{
          display: "flex", alignItems: "center", gap: collapsed ? 0 : 10,
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "8px 0" : "10px 12px", borderRadius: 10,
          background: "rgba(128,128,128,0.08)", border: "1px solid rgba(128,128,128,0.12)",
        }}>
          <div title={collapsed ? `${profile?.name} · ${profile?.role}` : undefined} style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: avatarColor, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff",
          }}>{profile?.name?.[0] || "U"}</div>
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{profile?.name || "User"}</div>
                <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "capitalize" }}>{profile?.role || "member"}</div>
              </div>
              <button onClick={onLogout} title="Sign out" style={{ background: "transparent", border: "1px solid rgba(128,128,128,0.2)", borderRadius: 7, padding: "5px 7px", color: "var(--text3)", cursor: "pointer", fontSize: 13 }}>
                <i className="ti ti-logout" />
              </button>
            </>
          )}
        </div>

        {collapsed && (
          <button onClick={onLogout} title="Sign out" style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: "100%", marginTop: 6, padding: "8px 0", borderRadius: 8,
            background: "transparent", border: "1px solid rgba(128,128,128,0.15)",
            color: "var(--text3)", cursor: "pointer", fontSize: 14,
          }}>
            <i className="ti ti-logout" />
          </button>
        )}
      </div>
    </nav>
  );
}