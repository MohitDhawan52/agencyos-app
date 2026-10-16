"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "./supabase";

interface BannerAlert {
  id: string;
  title: string;
  body: string;
  icon: string;
  color: string;
}

// ── localStorage helpers for one-time banner alerts ───────────────────────────
const getKey       = (id: string) => `crm-alert-${id}`;
const wasDismissed = (id: string) => { try { return localStorage.getItem(getKey(id)) === "1"; } catch { return false; } };
const storeDismiss = (id: string) => { try { localStorage.setItem(getKey(id), "1"); } catch {} };

export default function AlertSystem({ profile }: { profile?: any }) {

  // ── One-time bottom-bar alerts (meetings / high-priority tasks) ───────────
  const [banners, setBanners] = useState<BannerAlert[]>([]);

  const loadBanners = async () => {
    const now      = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const tomorrow = new Date(now.getTime() + 86_400_000);
    const tmrwStr  = tomorrow.toISOString().split("T")[0];
    const found: BannerAlert[] = [];

    const { data: meetings } = await supabase
      .from("meetings")
      .select("id, client_name, reason, date, status")
      .eq("status", "Scheduled")
      .in("date", [todayStr, tmrwStr]);

    for (const m of meetings || []) {
      if (m.date === tmrwStr) {
        const id = `meeting-day-${m.id}`;
        if (!wasDismissed(id))
          found.push({ id, title: "Meeting Tomorrow", body: `${m.client_name}${m.reason ? ` · ${m.reason}` : ""}`, icon: "ti-calendar-event", color: "#60a5fa" });
      }
      if (m.date === todayStr) {
        const id = `meeting-today-${m.id}`;
        if (!wasDismissed(id))
          found.push({ id, title: "Meeting Today", body: `${m.client_name}${m.reason ? ` · ${m.reason}` : ""}`, icon: "ti-alarm", color: "#fbbf24" });
      }
    }

    const { data: tasks } = await supabase.from("board_tasks").select("id, title").eq("priority", "High").neq("column_id", "done");
    if (tasks && tasks.length > 0) {
      const id = `tasks-high-${todayStr}`;
      if (!wasDismissed(id)) {
        const preview = tasks.slice(0, 2).map((t: any) => t.title).join(", ");
        found.push({ id, title: `${tasks.length} High Priority Task${tasks.length > 1 ? "s" : ""} Pending`, body: preview + (tasks.length > 2 ? ` +${tasks.length - 2} more` : ""), icon: "ti-alert-triangle", color: "#f87171" });
      }
    }

    setBanners(prev => {
      const existing = new Set(prev.map(a => a.id));
      const fresh = found.filter(a => !existing.has(a.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  };

  useEffect(() => {
    loadBanners();
    const t = setInterval(loadBanners, 60_000);
    return () => clearInterval(t);
  }, []);

  const dismissBanner = (id: string) => { storeDismiss(id); setBanners(p => p.filter(a => a.id !== id)); };

  // ── Siren (Web Audio API) ────────────────────────────────────────────────
  const playSiren = () => {
    try {
      const ctx  = new AudioContext();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sawtooth";
      const now = ctx.currentTime;
      // Volume envelope: quick attack, sustain, fade out
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.06);
      gain.gain.setValueAtTime(0.18, now + 2.3);
      gain.gain.linearRampToValueAtTime(0, now + 2.7);
      // Frequency sweep: two full siren wails (400 Hz → 1000 Hz × 2)
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(1000, now + 0.65);
      osc.frequency.exponentialRampToValueAtTime(400,  now + 1.3);
      osc.frequency.exponentialRampToValueAtTime(1000, now + 1.95);
      osc.frequency.exponentialRampToValueAtTime(400,  now + 2.6);
      osc.start(now);
      osc.stop(now + 2.7);
      osc.onended = () => { try { ctx.close(); } catch {} };
    } catch {}
  };

  // ── Browser Notification API (works in background / other windows) ────────
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const showSystemNotification = (alert: any) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      const n = new Notification(`🚨 ${alert.title}`, {
        body:             alert.message,
        icon:             "/logo.png",
        tag:              `crm-team-alert-${alert.id}`,
        requireInteraction: true,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch {}
  };

  // ── Recurring admin alerts ────────────────────────────────────────────────
  const [queue,    setQueue]    = useState<any[]>([]);
  const intervals  = useRef<ReturnType<typeof setInterval>[]>([]);
  const initTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const fireAlert = useCallback((alert: any) => {
    // System notification fires for background tabs / other windows
    if (document.hidden) showSystemNotification(alert);
    setQueue(q => q.some(a => a.id === alert.id) ? q : [...q, alert]);
  }, []);

  useEffect(() => {
    if (!profile?.name) return;

    (async () => {
      const { data } = await supabase.from("alerts").select("*").eq("active", true);
      if (!data) return;

      const mine = data.filter((a: any) => {
        const names: string[] = a.assignees?.split(", ").filter(Boolean) || [];
        return names.length === 0 || names.includes(profile.name);
      });

      intervals.current.forEach(clearInterval);
      initTimers.current.forEach(clearTimeout);
      intervals.current  = [];
      initTimers.current = [];

      mine.forEach((alert: any, i: number) => {
        // Staggered initial show so alerts don't pile up at once
        const t = setTimeout(() => fireAlert(alert), (45 + i * 8) * 1000);
        initTimers.current.push(t);

        // Repeat at the configured interval
        const iv = setInterval(() => fireAlert(alert), alert.interval_mins * 60 * 1000);
        intervals.current.push(iv);
      });
    })();

    return () => {
      intervals.current.forEach(clearInterval);
      initTimers.current.forEach(clearTimeout);
    };
  }, [profile?.name, fireAlert]);

  const current  = queue[0];
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  // Play siren every time a new alert enters the queue
  const prevLen = useRef(0);
  useEffect(() => {
    if (queue.length > prevLen.current && queue.length > 0) playSiren();
    prevLen.current = queue.length;
  }, [queue.length]);

  // Play siren when user comes back to this tab if alerts are waiting
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && queueRef.current.length > 0) playSiren();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const dismissModal = () => setQueue(q => q.slice(1));

  return (
    <>
      {/* ── Recurring alert modal ──────────────────────────────────────────── */}
      {current && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 99998,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
        }}>
          <div style={{
            width: 460, maxWidth: "90vw",
            background: "var(--bg, #0d0d1a)",
            border: "2px solid rgba(251,191,36,0.35)",
            borderRadius: 22,
            padding: "36px 40px 32px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(251,191,36,0.08)",
            animation: "crm-modal-alert-in 0.4s cubic-bezier(0.34,1.56,0.64,1)",
            textAlign: "center",
          }}>
            <div style={{
              width: 68, height: 68, borderRadius: 20, margin: "0 auto 20px",
              background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 8px 32px rgba(245,158,11,0.5)",
              animation: "crm-alert-pulse 1.2s ease-in-out infinite alternate",
            }}>
              <i className="ti ti-bell-ringing" style={{ fontSize: 30, color: "#000" }} />
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: 10 }}>
              Team Alert
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#f2f2f7", letterSpacing: "-0.4px", marginBottom: 12 }}>
              {current.title}
            </div>
            <div style={{ fontSize: 15, color: "#8e8ea0", lineHeight: 1.7, marginBottom: 28 }}>
              {current.message}
            </div>

            <button onClick={dismissModal} style={{
              width: "100%", padding: "13px 24px", fontSize: 15, fontWeight: 700,
              background: "linear-gradient(135deg,#f59e0b,#fbbf24)",
              color: "#000", border: "none", borderRadius: 13, cursor: "pointer",
              fontFamily: "inherit", boxShadow: "0 4px 16px rgba(245,158,11,0.4)",
              letterSpacing: "-0.2px",
            }}>
              Got it ✓
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom-bar one-time alerts ─────────────────────────────────────── */}
      {banners.length > 0 && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          display: "flex", flexDirection: "column", gap: 10,
          maxWidth: 360, width: "calc(100vw - 48px)",
          pointerEvents: "none",
        }}>
          {banners.map(alert => (
            <div key={alert.id} style={{
              background: "#16161f",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              borderRight: "1px solid rgba(255,255,255,0.08)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              borderLeft: `4px solid ${alert.color}`,
              borderRadius: 14, padding: "14px 16px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)",
              backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
              display: "flex", gap: 12, alignItems: "flex-start",
              pointerEvents: "auto",
              animation: "crm-alert-in .3s ease",
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: `${alert.color}20`, border: `1px solid ${alert.color}35`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <i className={`ti ${alert.icon}`} style={{ fontSize: 16, color: alert.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#f2f2f7", marginBottom: 3, letterSpacing: "-0.2px" }}>{alert.title}</div>
                <div style={{ fontSize: 11, color: "#8e8ea0", lineHeight: 1.5, wordBreak: "break-word" }}>{alert.body}</div>
              </div>
              <button onClick={() => dismissBanner(alert.id)} style={{ background: "transparent", border: "none", color: "#4a4a5a", cursor: "pointer", fontSize: 15, padding: "2px", lineHeight: 1, flexShrink: 0 }}>
                <i className="ti ti-x" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
