"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

export default function ChatMonitor() {
  const [messages, setMessages] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "group" | string>("all"); // "all" | "group" | userId pair "uid1:uid2"
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel("admin-chat-monitor")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        setMessages(prev => [...prev, payload.new as any]);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: msgs }, { data: profs }] = await Promise.all([
      supabase.from("messages").select("*").order("created_at", { ascending: true }).limit(500),
      supabase.from("profiles").select("id, name, color, role").neq("status", "left"),
    ]);
    if (msgs) setMessages(msgs);
    if (profs) setMembers(profs);
    setLoading(false);
  };

  // Build unique DM pairs
  const dmPairs: { key: string; names: string; ids: [string, string] }[] = [];
  const seenPairs = new Set<string>();
  messages.filter(m => !m.is_group && m.sender_id && m.receiver_id).forEach(m => {
    const sorted = [m.sender_id, m.receiver_id].sort();
    const key = sorted.join(":");
    if (!seenPairs.has(key)) {
      seenPairs.add(key);
      const n1 = members.find(p => p.id === sorted[0])?.name || "Unknown";
      const n2 = members.find(p => p.id === sorted[1])?.name || "Unknown";
      dmPairs.push({ key, names: `${n1} ↔ ${n2}`, ids: [sorted[0], sorted[1]] });
    }
  });

  // Filter messages
  const filtered = messages.filter(m => {
    if (filter === "group") return m.is_group;
    if (filter !== "all" && filter !== "group") {
      const [id1, id2] = filter.split(":");
      return !m.is_group &&
        ((m.sender_id === id1 && m.receiver_id === id2) ||
          (m.sender_id === id2 && m.receiver_id === id1));
    }
    return true;
  }).filter(m =>
    search ? m.content?.toLowerCase().includes(search.toLowerCase()) ||
      m.sender_name?.toLowerCase().includes(search.toLowerCase()) : true
  );

  const getMemberColor = (id: string) =>
    members.find(m => m.id === id)?.color || "var(--accent)";

  const timeStr = (ts: string) => new Date(ts).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const msgCounts: Record<string, number> = {};
  messages.forEach(m => {
    const key = m.is_group ? "group" : [m.sender_id, m.receiver_id].sort().join(":");
    msgCounts[key] = (msgCounts[key] || 0) + 1;
  });

  return (
    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

      {/* Left sidebar: conversation list */}
      <div style={{
        width: 240, borderRight: "1px solid var(--border)", display: "flex",
        flexDirection: "column", flexShrink: 0, background: "rgba(255,255,255,0.01)",
      }}>
        <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 10 }}>
            <i className="ti ti-eye" style={{ marginRight: 8, color: "var(--accent2)" }} />
            Chat Monitor
          </div>
          <input
            placeholder="Search messages..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border)", borderRadius: 8,
              padding: "7px 10px", color: "var(--text)", fontFamily: "inherit",
              fontSize: 12, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
          {/* All */}
          <div onClick={() => setFilter("all")} style={{
            padding: "9px 14px", cursor: "pointer", fontSize: 13,
            background: filter === "all" ? "rgba(109,93,252,0.1)" : "transparent",
            color: filter === "all" ? "var(--accent2)" : "var(--text2)",
            borderLeft: filter === "all" ? "2px solid var(--accent2)" : "2px solid transparent",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span><i className="ti ti-messages" style={{ marginRight: 7 }} />All Messages</span>
            <span style={{ fontSize: 11, opacity: .6 }}>{messages.length}</span>
          </div>

          {/* Group */}
          <div onClick={() => setFilter("group")} style={{
            padding: "9px 14px", cursor: "pointer", fontSize: 13,
            background: filter === "group" ? "rgba(109,93,252,0.1)" : "transparent",
            color: filter === "group" ? "var(--accent2)" : "var(--text2)",
            borderLeft: filter === "group" ? "2px solid var(--accent2)" : "2px solid transparent",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span><i className="ti ti-world" style={{ marginRight: 7 }} />Group Chat</span>
            <span style={{ fontSize: 11, opacity: .6 }}>{msgCounts["group"] || 0}</span>
          </div>

          {/* DM pairs */}
          {dmPairs.length > 0 && (
            <div style={{ padding: "8px 14px 4px", fontSize: 10, color: "var(--text3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".6px" }}>
              Direct Messages
            </div>
          )}
          {dmPairs.map(pair => (
            <div key={pair.key} onClick={() => setFilter(pair.key)} style={{
              padding: "9px 14px", cursor: "pointer", fontSize: 12,
              background: filter === pair.key ? "rgba(109,93,252,0.1)" : "transparent",
              color: filter === pair.key ? "var(--accent2)" : "var(--text2)",
              borderLeft: filter === pair.key ? "2px solid var(--accent2)" : "2px solid transparent",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                <i className="ti ti-message" style={{ marginRight: 7, flexShrink: 0 }} />{pair.names}
              </span>
              <span style={{ fontSize: 11, opacity: .6, flexShrink: 0, marginLeft: 4 }}>{msgCounts[pair.key] || 0}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Messages */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            {filter === "all" ? "All Conversations" :
             filter === "group" ? "Group Chat" :
             dmPairs.find(p => p.key === filter)?.names || "DM"}
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text3)", fontWeight: 400 }}>
              {filtered.length} messages
            </span>
          </div>
          <div style={{ fontSize: 12, color: "var(--text3)" }}>
            <i className="ti ti-refresh" style={{ marginRight: 4, cursor: "pointer" }} onClick={fetchAll} />
            Live
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#4ade80", marginLeft: 6 }} />
          </div>
        </div>

        {/* Message list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text3)" }}>Loading messages...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text3)" }}>
              <i className="ti ti-messages-off" style={{ fontSize: 40, opacity: .2, display: "block", marginBottom: 12 }} />
              No messages found
            </div>
          ) : filtered.map((msg, i) => (
            <div key={msg.id || i} style={{
              display: "flex", gap: 12, padding: "12px 14px",
              background: "rgba(255,255,255,0.02)", borderRadius: 12,
              border: "1px solid var(--border)",
            }}>
              {/* Avatar */}
              <div style={{
                width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
                background: getMemberColor(msg.sender_id),
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, color: "#fff",
              }}>
                {msg.sender_name?.[0]?.toUpperCase() || "?"}
              </div>
              {/* Content */}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{msg.sender_name}</span>
                  {!msg.is_group && msg.receiver_id && (
                    <>
                      <i className="ti ti-arrow-right" style={{ fontSize: 11, color: "var(--text3)" }} />
                      <span style={{ fontSize: 12, color: "var(--text2)" }}>
                        {members.find(m => m.id === msg.receiver_id)?.name || "Unknown"}
                      </span>
                    </>
                  )}
                  {msg.is_group && (
                    <span style={{ fontSize: 11, color: "var(--accent2)", background: "rgba(109,93,252,0.1)", padding: "1px 7px", borderRadius: 10 }}>group</span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: "auto" }}>{timeStr(msg.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.5 }}>{msg.content}</div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}