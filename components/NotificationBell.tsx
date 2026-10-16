"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import { showToast } from "./ToastNotification";

function playNotificationSound(type: "message" | "task" = "message") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (type === "message") {
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "sine"; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.35);
      });
    } else {
      [392, 523.25, 783.99].forEach((freq, i) => {
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = "triangle"; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
        gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + i * 0.1 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.4);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.4);
      });
    }
  } catch (e) {}
}

export function useNotifications(profile: any) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from("notifications").select("*")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false }).limit(30);
    if (data) {
      setNotifications(data);
      setUnreadCount(data.filter((n: any) => !n.read).length);
    }
  }, [profile?.id]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`notifications-${profile.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${profile.id}`,
      }, (payload) => {
        const notif = payload.new as any;
        setNotifications(prev => [notif, ...prev]);
        setUnreadCount(c => c + 1);
        playNotificationSound(notif.type === "task" ? "task" : "message");
        showToast({ type: notif.type, title: notif.title, body: notif.body });
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(notif.title, { body: notif.body, icon: "/favicon.ico" });
        }
      })
      .subscribe();

    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  const markAllRead = async () => {
    if (!profile?.id) return;
    await supabase.from("notifications").update({ read: true })
      .eq("user_id", profile.id).eq("read", false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const markOneRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  return { notifications, unreadCount, markAllRead, markOneRead, refetch: fetchNotifications };
}

export async function createNotification({
  userId, type, title, body, meta,
}: {
  userId: string;
  type: "message" | "task" | "dm";
  title: string;
  body: string;
  meta?: any;
}) {
  await supabase.from("notifications").insert([
    { user_id: userId, type, title, body, meta: meta || {}, read: false },
  ]);
}

// ── Helper: which page to navigate to for a notification type ──
function getNavTarget(type: string): string | null {
  if (type === "task") return "tasks";
  if (type === "dm" || type === "message") return "chat";
  return null;
}

interface NotificationBellProps {
  profile: any;
  setActivePage?: (page: string) => void;
}

export default function NotificationBell({ profile, setActivePage }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markAllRead, markOneRead } = useNotifications(profile);

  const openPanel = () => {
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + 10,
        left: Math.min(rect.left, window.innerWidth - 356),
      });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current && !bellRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Click a notification → mark read + navigate to the relevant page
  const handleNotifClick = async (n: any) => {
    if (!n.read) await markOneRead(n.id);
    const target = getNavTarget(n.type);
    if (target && setActivePage) {
      setActivePage(target);
      setOpen(false);
    }
  };

  const typeIcon = (type: string) => {
    if (type === "task") return "ti-checkbox";
    if (type === "dm") return "ti-message";
    return "ti-messages";
  };
  const typeColor = (type: string) => {
    if (type === "task") return "#fbbf24";
    if (type === "dm") return "#60a5fa";
    return "var(--accent2)";
  };
  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  return (
    <>
      <style>{`
        @keyframes bellRing {
          0%,100% { transform: rotate(0deg); }
          10% { transform: rotate(14deg); }
          20% { transform: rotate(-12deg); }
          30% { transform: rotate(10deg); }
          40% { transform: rotate(-8deg); }
          50% { transform: rotate(0deg); }
        }
        @keyframes notifFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Bell Button */}
      <button
        ref={bellRef}
        onClick={openPanel}
        style={{
          width: 36, height: 36, borderRadius: 10,
          background: open ? "rgba(109,93,252,0.15)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${open ? "rgba(109,93,252,0.4)" : "var(--border)"}`,
          cursor: "pointer", display: "flex", alignItems: "center",
          justifyContent: "center", position: "relative", transition: "all .15s",
          flexShrink: 0,
        }}
      >
        <i className="ti ti-bell" style={{
          fontSize: 16,
          color: open ? "var(--accent2)" : "var(--text2)",
          animation: unreadCount > 0 ? "bellRing 1.2s ease-in-out infinite" : "none",
        }} />
        {unreadCount > 0 && (
          <div style={{
            position: "absolute", top: -5, right: -5,
            minWidth: 18, height: 18, borderRadius: 9,
            background: "#f87171", display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff",
            padding: "0 4px", border: "2px solid var(--bg)", zIndex: 1,
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </div>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: "fixed",
            top: panelPos.top,
            left: panelPos.left,
            width: 340,
            maxHeight: 480,
            borderRadius: 16,
            background: "rgba(13,13,20,0.98)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid var(--border)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
            zIndex: 99999,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            animation: "notifFadeIn .18s ease",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "14px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
              Notifications
              {unreadCount > 0 && (
                <span style={{
                  marginLeft: 8, fontSize: 11, padding: "2px 7px", borderRadius: 20,
                  background: "rgba(248,113,113,0.15)", color: "#f87171", fontWeight: 700,
                }}>{unreadCount} new</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {notifications.some(n => !n.read) && (
                <button onClick={markAllRead} style={{
                  fontSize: 11, color: "var(--accent2)", background: "none",
                  border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0, fontWeight: 600,
                }}>Mark all read</button>
              )}
              <button onClick={() => setOpen(false)} style={{
                width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.06)",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center",
                justifyContent: "center", color: "var(--text3)",
              }}>
                <i className="ti ti-x" style={{ fontSize: 13 }} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
                <i className="ti ti-bell-off" style={{ fontSize: 32, opacity: .2, display: "block", marginBottom: 10 }} />
                No notifications yet
              </div>
            ) : (
              notifications.map(n => {
                const navTarget = getNavTarget(n.type);
                return (
                  <div
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    style={{
                      padding: "13px 16px", borderBottom: "1px solid rgba(255,255,255,0.04)",
                      display: "flex", gap: 12,
                      cursor: navTarget && setActivePage ? "pointer" : "default",
                      background: n.read ? "transparent" : "rgba(109,93,252,0.04)",
                      transition: "background .15s",
                    }}
                    onMouseEnter={e => {
                      if (navTarget && setActivePage)
                        (e.currentTarget as HTMLDivElement).style.background = n.read ? "rgba(255,255,255,0.02)" : "rgba(109,93,252,0.08)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.background = n.read ? "transparent" : "rgba(109,93,252,0.04)";
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      background: `${typeColor(n.type)}18`, border: `1px solid ${typeColor(n.type)}25`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <i className={`ti ${typeIcon(n.type)}`} style={{ fontSize: 15, color: typeColor(n.type) }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: n.read ? 500 : 700,
                        color: n.read ? "var(--text2)" : "var(--text)", marginBottom: 2,
                      }}>
                        {n.title}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {n.body}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--text3)", opacity: .6 }}>{timeAgo(n.created_at)}</span>
                        {navTarget && setActivePage && (
                          <span style={{ fontSize: 11, color: typeColor(n.type), fontWeight: 600, opacity: 0.8 }}>
                            Tap to open →
                          </span>
                        )}
                      </div>
                    </div>
                    {!n.read && (
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent2)", flexShrink: 0, marginTop: 4 }} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}