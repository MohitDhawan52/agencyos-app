"use client";
import { useState, useEffect, useCallback } from "react";

export type ToastType = "message" | "dm" | "task";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  body: string;
  noClick?: boolean;
}

// ── Global event bus (works across components without prop drilling) ──────────
const listeners: Array<(toast: Toast) => void> = [];

export function showToast(toast: Omit<Toast, "id">) {
  const full: Toast = { ...toast, id: `toast-${Date.now()}-${Math.random()}` };
  listeners.forEach(fn => fn(full));
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Toast) => {
    setToasts(prev => [...prev, toast]);
    // Auto-dismiss after 5s
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, 5000);
  }, []);

  useEffect(() => {
    listeners.push(addToast);
    return () => {
      const idx = listeners.indexOf(addToast);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, [addToast]);

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const iconFor = (type: ToastType) => {
    if (type === "task") return "ti-checkbox";
    if (type === "dm") return "ti-message";
    return "ti-messages";
  };

  const colorFor = (type: ToastType) => {
    if (type === "task") return "#fbbf24";
    if (type === "dm") return "#60a5fa";
    return "var(--accent2)";
  };

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 99999,
      display: "flex", flexDirection: "column", gap: 10,
      pointerEvents: "none",
    }}>
      {toasts.map((toast, i) => (
        <div
          key={toast.id}
          style={{
            pointerEvents: "all",
            width: 320,
            background: "rgba(13,13,20,0.97)",
            backdropFilter: "blur(20px)",
            border: `1px solid ${colorFor(toast.type)}40`,
            borderLeft: `3px solid ${colorFor(toast.type)}`,
            borderRadius: 14,
            padding: "14px 16px",
            display: "flex", gap: 12, alignItems: "flex-start",
            boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${colorFor(toast.type)}10`,
            animation: "toastSlideIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards",
            cursor: toast.noClick ? "default" : "pointer",
          }}
          onClick={toast.noClick ? undefined : () => dismiss(toast.id)}
        >
          {/* Icon */}
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: `${colorFor(toast.type)}18`,
            border: `1px solid ${colorFor(toast.type)}30`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <i className={`ti ${iconFor(toast.type)}`} style={{ fontSize: 17, color: colorFor(toast.type) }} />
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 3 }}>
              {toast.title}
            </div>
            <div style={{
              fontSize: 12, color: "var(--text3)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>
              {toast.body}
            </div>
          </div>

          {/* Close */}
          <button
            onClick={e => { e.stopPropagation(); dismiss(toast.id); }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text3)", padding: 2, flexShrink: 0, fontSize: 14,
            }}
          >
            <i className="ti ti-x" />
          </button>

          {/* Progress bar */}
          <div style={{
            position: "absolute", bottom: 0, left: 0,
            height: 2, borderRadius: "0 0 14px 14px",
            background: colorFor(toast.type),
            animation: "toastProgress 5s linear forwards",
            width: "100%",
          }} />
        </div>
      ))}

      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateX(120px) scale(0.92); }
          to   { opacity: 1; transform: translateX(0)    scale(1); }
        }
        @keyframes toastProgress {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}