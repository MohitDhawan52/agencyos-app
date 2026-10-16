"use client";
import { useEffect } from "react";

export function TablerLoader() {
  useEffect(() => {
    if (document.getElementById("tabler-icons-css")) return;
    const link = document.createElement("link");
    link.id = "tabler-icons-css";
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/dist/tabler-icons.min.css";
    document.head.appendChild(link);
  }, []);
  return null;
}
