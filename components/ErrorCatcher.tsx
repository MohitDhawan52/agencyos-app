"use client";
import { useEffect } from "react";

export function ErrorCatcher() {
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      document.body.innerHTML = `
        <div style="padding:20px;background:#0d0d12;color:#f87171;font-family:monospace;min-height:100vh;font-size:13px;">
          <h2 style="color:#f87171;margin-bottom:16px">⚠ App Error (iPhone Debug)</h2>
          <p><strong>Message:</strong> ${event.message}</p>
          <p><strong>File:</strong> ${event.filename}</p>
          <p><strong>Line:</strong> ${event.lineno}:${event.colno}</p>
          <pre style="margin-top:16px;white-space:pre-wrap;word-break:break-all;color:#fbbf24;font-size:11px">${event.error?.stack || "no stack"}</pre>
        </div>`;
    };
    const promiseHandler = (event: PromiseRejectionEvent) => {
      document.body.innerHTML = `
        <div style="padding:20px;background:#0d0d12;color:#fbbf24;font-family:monospace;min-height:100vh;font-size:13px;">
          <h2 style="color:#fbbf24;margin-bottom:16px">⚠ Promise Error (iPhone Debug)</h2>
          <p>${String(event.reason)}</p>
          <pre style="margin-top:16px;white-space:pre-wrap;word-break:break-all;font-size:11px">${event.reason?.stack || "no stack"}</pre>
        </div>`;
    };
    window.addEventListener("error", handler);
    window.addEventListener("unhandledrejection", promiseHandler);
    return () => {
      window.removeEventListener("error", handler);
      window.removeEventListener("unhandledrejection", promiseHandler);
    };
  }, []);
  return null;
}
