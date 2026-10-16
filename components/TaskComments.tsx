"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import { createNotification } from "./NotificationBell";

interface Props {
  taskId: string;
  taskTitle: string;
  profile: any;
  teamMembers: any[];
  onRead?: () => void;
}

export default function TaskComments({ taskId, taskTitle, profile, teamMembers, onRead }: Props) {
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendError, setSendError] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionPos, setMentionPos] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchComments();
    const ch = supabase.channel(`task-comments-${taskId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, (payload: any) => {
        const id = payload.new?.task_id || payload.old?.task_id;
        if (id === taskId) fetchComments();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [taskId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const fetchComments = async () => {
    const { data } = await supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at", { ascending: true });
    if (data) {
      setComments(data);
      markAsRead(data);
    }
  };

  const markAsRead = async (commentList: any[]) => {
    const myName = profile?.name;
    if (!myName) return;
    const unread = commentList.filter(c => !(c.read_by || []).includes(myName));
    if (!unread.length) return;
    await Promise.all(
      unread.map(c =>
        supabase.from("task_comments").update({ read_by: [...(c.read_by || []), myName] }).eq("id", c.id)
      )
    );
    onRead?.();
  };

  const handleTextChange = (val: string) => {
    setText(val);
    // Detect @mention trigger
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1) {
      const afterAt = val.slice(lastAt + 1);
      if (/^[a-zA-Z]*$/.test(afterAt)) {
        setMentionQuery(afterAt.toLowerCase());
        setMentionPos(lastAt);
        return;
      }
    }
    setMentionQuery(null);
  };

  const insertMention = (name: string) => {
    const before = text.slice(0, mentionPos);
    const after = text.slice(mentionPos + 1 + (mentionQuery?.length || 0));
    const newText = `${before}@${name} ${after}`;
    setText(newText);
    setMentionQuery(null);
    textareaRef.current?.focus();
  };

  const parseMentions = (t: string): string[] => {
    const matches = t.match(/@([A-Za-z]+)/g) || [];
    return matches.map(m => m.slice(1)).filter(n => teamMembers.some(tm => tm.name.toLowerCase() === n.toLowerCase()));
  };

  const sendComment = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setSendError("");
    const mentions = parseMentions(text);
    const senderName = profile?.name || "Unknown";
    const { error } = await supabase.from("task_comments").insert([{
      task_id: taskId,
      user_name: senderName,
      user_color: profile?.color || "#6366f1",
      text: text.trim(),
      mentions,
      read_by: [senderName],
    }]);
    if (error) {
      setSendError(error.message);
      setSaving(false);
      return;
    }
    // Notify mentioned people
    for (const mention of mentions) {
      const member = teamMembers.find(m => m.name.toLowerCase() === mention.toLowerCase());
      if (member?.id && member.id !== profile?.id) {
        await createNotification({
          userId: member.id,
          type: "task",
          title: `${profile?.name || "Someone"} mentioned you in a task`,
          body: `"${taskTitle}" — ${text.trim().slice(0, 80)}`,
          meta: { task_id: taskId },
        });
      }
    }
    setText("");
    setMentionQuery(null);
    setSaving(false);
    fetchComments();
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  };

  const renderText = (t: string) => {
    const parts = t.split(/(@[A-Za-z]+)/g);
    return parts.map((p, i) => {
      if (p.startsWith("@") && teamMembers.some(m => m.name.toLowerCase() === p.slice(1).toLowerCase())) {
        const member = teamMembers.find(m => m.name.toLowerCase() === p.slice(1).toLowerCase());
        return <span key={i} style={{ color: member?.color || "var(--accent2)", fontWeight: 700 }}>{p}</span>;
      }
      return <span key={i}>{p}</span>;
    });
  };

  const filteredMembers = mentionQuery !== null
    ? teamMembers.filter(m => m.name.toLowerCase().startsWith(mentionQuery))
    : [];

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: ".6px", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <i className="ti ti-message-circle" style={{ fontSize: 14 }} />
        Comments {comments.length > 0 && <span style={{ background: "rgba(255,255,255,0.08)", borderRadius: 8, padding: "1px 7px", fontSize: 11, color: "var(--text3)" }}>{comments.length}</span>}
      </div>

      {/* Comment list */}
      <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, paddingRight: 4 }}>
        {comments.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text3)", textAlign: "center", padding: "20px 0" }}>No comments yet. Start the discussion.</div>
        ) : (
          comments.map(c => (
            <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: c.user_color || "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: 2 }}>
                {(c.user_name || "?")[0]}
              </div>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{c.user_name}</span>
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>{fmtTime(c.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: "#ffffff", lineHeight: 1.5 }}>{renderText(c.text)}</div>
                {c.user_name === profile?.name && (
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                    <span style={{ fontSize: 13, color: (c.read_by || []).some((name: string) => name !== c.user_name) ? "#6d5dfc" : "rgba(255,255,255,0.3)", letterSpacing: "-2px" }}>✓✓</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {sendError && (
        <div style={{ fontSize: 12, color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>
          <i className="ti ti-alert-circle" style={{ marginRight: 6 }} />{sendError}
        </div>
      )}

      {/* Input area */}
      <div style={{ position: "relative" }}>
        {/* @mention dropdown */}
        {filteredMembers.length > 0 && (
          <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, background: "var(--card)", border: "1px solid var(--border2)", borderRadius: 10, marginBottom: 4, overflow: "hidden", zIndex: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
            {filteredMembers.map(m => (
              <div key={m.id} onClick={() => insertMention(m.name)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", fontSize: 13, color: "var(--text)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: m.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff" }}>{m.name[0]}</div>
                <span style={{ fontWeight: 600 }}>{m.name}</span>
                <span style={{ fontSize: 11, color: "var(--text3)", marginLeft: "auto" }}>@{m.name.toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: profile?.color || "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0, marginBottom: 2 }}>
            {(profile?.name || "?")[0]}
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => handleTextChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); }
              if (e.key === "Escape") setMentionQuery(null);
            }}
            placeholder="Write a comment… use @name to mention someone"
            rows={2}
            style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid var(--border2)", borderRadius: 10, padding: "9px 12px", color: "var(--text)", fontFamily: "inherit", fontSize: 13, outline: "none", resize: "none", lineHeight: 1.5 }}
          />
          <button onClick={sendComment} disabled={!text.trim() || saving} style={{ width: 36, height: 36, borderRadius: 10, border: "none", background: text.trim() ? "var(--accent)" : "rgba(255,255,255,0.05)", color: text.trim() ? "#fff" : "var(--text3)", cursor: text.trim() ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-send" style={{ fontSize: 15 }} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 5, marginLeft: 36 }}>Enter to send · Shift+Enter for new line · @name to mention</div>
      </div>
    </div>
  );
}
