"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import { createNotification } from "./NotificationBell";

function playMsgSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [523.25, 659.25].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.35);
    });
  } catch (e) {}
}

export default function ChatPanel({ profile }: { profile: any }) {
  const [open, setOpen] = useState(false);
  const [dmMessages, setDmMessages] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [dmTarget, setDmTarget] = useState<any>(null);
  const [input, setInput] = useState("");
  const [unread, setUnread] = useState(0);
  const [dmUnreads, setDmUnreads] = useState<Record<string, number>>({});
  const [activeConversations, setActiveConversations] = useState<Set<string>>(new Set());
  const [showNewContact, setShowNewContact] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchMembers = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase.from("profiles").select("*").neq("id", profile.id).neq("status", "left");
    if (data) setMembers(data);
  }, [profile?.id]);

  const fetchActiveConversations = useCallback(async () => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from("messages")
      .select("sender_id, receiver_id")
      .eq("is_group", false)
      .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`);
    if (data) {
      const ids = new Set<string>();
      data.forEach((m: any) => {
        if (m.sender_id !== profile.id) ids.add(m.sender_id);
        if (m.receiver_id !== profile.id) ids.add(m.receiver_id);
      });
      setActiveConversations(ids);
    }
  }, [profile?.id]);

  const fetchDmMessages = useCallback(async (targetId: string) => {
    if (!profile?.id) return;
    const { data } = await supabase
      .from("messages").select("*")
      .eq("is_group", false)
      .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${targetId}),and(sender_id.eq.${targetId},receiver_id.eq.${profile.id})`)
      .order("created_at", { ascending: true }).limit(100);
    if (data) setDmMessages(data);
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchMembers();
    fetchActiveConversations();

    const channel = supabase
      .channel(`chat-${profile.id}-${dmTarget?.id || "none"}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const msg = payload.new as any;
        if (msg.is_group) return;
        const myId = profile.id;
        const isFromMe = msg.sender_id === myId;

        if (msg.sender_id === myId || msg.receiver_id === myId) {
          const otherId = isFromMe ? msg.receiver_id : msg.sender_id;
          setActiveConversations(prev => new Set([...prev, otherId]));

          const isCurrentConvo = dmTarget && (msg.sender_id === dmTarget.id || msg.receiver_id === dmTarget.id);
          if (isCurrentConvo) {
            setDmMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
          }

          if (!isFromMe) {
            const isViewing = open && dmTarget?.id === msg.sender_id;
            if (!isViewing) {
              setDmUnreads(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }));
              setUnread(u => u + 1);
              playMsgSound();
              await createNotification({
                userId: myId,
                type: "dm",
                title: `DM from ${msg.sender_name}`,
                body: msg.content,
                meta: { sender_id: msg.sender_id },
              });
            }
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, open, dmTarget, fetchMembers, fetchActiveConversations]);

  useEffect(() => {
    if (dmTarget) {
      fetchDmMessages(dmTarget.id);
      setDmUnreads(prev => { const n = { ...prev }; delete n[dmTarget.id]; return n; });
    }
  }, [dmTarget, fetchDmMessages]);

  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }, [dmMessages, open, dmTarget]);

  useEffect(() => { if (open) setUnread(0); }, [open]);

  const sendMessage = async () => {
    if (!input.trim() || !dmTarget) return;
    const text = input.trim();
    setInput("");
    await supabase.from("messages").insert([{
      sender_id: profile?.id,
      sender_name: profile?.name,
      sender_color: profile?.color || "var(--accent)",
      receiver_id: dmTarget.id,
      is_group: false,
      content: text,
    }]);
    setActiveConversations(prev => new Set([...prev, dmTarget.id]));
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const openDm = (member: any) => {
    setDmTarget(member);
    setShowNewContact(false);
    setContactSearch("");
  };

  const conversationMembers = members.filter(m => activeConversations.has(m.id));
  const totalDmUnread = Object.values(dmUnreads).reduce((a: number, b) => a + (b as number), 0);

  return (
    <>
      <style>{`
        .chat-panel-wrap { background: var(--card) !important; border-color: var(--border) !important; }
        .chat-panel-wrap input, .chat-panel-wrap textarea {
          background: var(--input-bg, rgba(0,0,0,0.06)) !important;
          color: var(--text) !important;
          border-color: var(--border2) !important;
        }
        .chat-panel-wrap input::placeholder { color: var(--text3) !important; }
        .chat-row:hover { background: var(--hover, rgba(0,0,0,0.04)) !important; }
        .chat-picker { background: var(--card) !important; border-color: var(--border) !important; }
      `}</style>

      {/* Floating Button */}
      <div style={{ position: "fixed", bottom: 28, right: 28, zIndex: 1000 }}>
        {!open && (
          <button onClick={() => setOpen(true)} style={{
            width: 54, height: 54, borderRadius: "50%",
            background: "linear-gradient(135deg, var(--accent3), var(--accent2))",
            border: "none", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 20px rgba(109,93,252,0.5)", position: "relative",
          }}>
            <i className="ti ti-messages" style={{ fontSize: 22, color: "#fff" }} />
            {unread > 0 && (
              <div style={{
                position: "absolute", top: -4, right: -4,
                width: 20, height: 20, borderRadius: "50%",
                background: "#f87171", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff",
                border: "2px solid var(--bg)",
              }}>
                {unread > 9 ? "9+" : unread}
              </div>
            )}
          </button>
        )}
      </div>

      {/* Chat Panel */}
      {open && (
        <div className="chat-panel-wrap" style={{
          position: "fixed", bottom: 28, right: 28, zIndex: 1000,
          width: 360, height: 540, borderRadius: 20,
          background: "var(--card)", backdropFilter: "blur(24px)",
          border: "1px solid var(--border)", boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{
            padding: "14px 16px", borderBottom: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
            background: "var(--card)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {dmTarget && (
                <button onClick={() => { setDmTarget(null); setDmMessages([]); }} style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text3)", padding: 0, display: "flex", alignItems: "center",
                }}>
                  <i className="ti ti-arrow-left" style={{ fontSize: 16 }} />
                </button>
              )}
              {dmTarget ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: dmTarget.color || "var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: "#fff",
                  }}>{dmTarget.name?.[0]?.toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{dmTarget.name}</div>
                    <div style={{ fontSize: 10, color: "var(--text3)" }}>Direct message</div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                  Messages
                  {totalDmUnread > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 11, padding: "2px 7px", borderRadius: 20, background: "rgba(248,113,113,0.15)", color: "#f87171", fontWeight: 700 }}>
                      {totalDmUnread} new
                    </span>
                  )}
                </div>
              )}
            </div>
            <button onClick={() => setOpen(false)} style={{
              width: 28, height: 28, borderRadius: 8, background: "var(--border)",
              border: "none", cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center", color: "var(--text2)",
            }}>
              <i className="ti ti-x" style={{ fontSize: 14 }} />
            </button>
          </div>

          {/* Conversation List */}
          {!dmTarget && (
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", background: "var(--card)" }}>
              {conversationMembers.length === 0 ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text3)", padding: 32, textAlign: "center" }}>
                  <i className="ti ti-message-off" style={{ fontSize: 36, opacity: .2, marginBottom: 12 }} />
                  <div style={{ fontSize: 14, marginBottom: 6, color: "var(--text2)" }}>No conversations yet</div>
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>Tap + to start a new chat</div>
                </div>
              ) : (
                conversationMembers.map(m => (
                  <div key={m.id} onClick={() => openDm(m)} className="chat-row" style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", cursor: "pointer",
                    borderBottom: "1px solid var(--border)",
                    transition: "background .15s",
                  }}>
                    <div style={{ position: "relative" }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%",
                        background: m.color || "var(--accent)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0,
                      }}>{m.name?.[0]?.toUpperCase() || "?"}</div>
                      {dmUnreads[m.id] > 0 && (
                        <div style={{
                          position: "absolute", top: -3, right: -3,
                          width: 16, height: 16, borderRadius: "50%",
                          background: "#f87171", fontSize: 9, fontWeight: 800,
                          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                          border: "2px solid var(--card)",
                        }}>{dmUnreads[m.id]}</div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: dmUnreads[m.id] > 0 ? 700 : 600, color: "var(--text)" }}>{m.name}</div>
                      <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>{m.role || "member"}</div>
                    </div>
                    <i className="ti ti-chevron-right" style={{ fontSize: 14, color: "var(--text3)", opacity: .4 }} />
                  </div>
                ))
              )}
            </div>
          )}

          {/* DM Messages */}
          {dmTarget && (
            <div style={{
              flex: 1, overflowY: "auto", padding: "12px 14px",
              display: "flex", flexDirection: "column", gap: 8,
              background: "var(--bg)",
            }}>
              {dmMessages.length === 0 && (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 13 }}>
                  Say hello to {dmTarget.name}! 👋
                </div>
              )}
              {dmMessages.map((msg, i) => {
                const isMe = msg.sender_id === profile?.id;
                return (
                  <div key={msg.id || i} style={{ display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                    {!isMe && (
                      <div style={{ fontSize: 11, color: msg.sender_color || "var(--accent2)", fontWeight: 600, marginBottom: 3, paddingLeft: 4 }}>
                        {msg.sender_name}
                      </div>
                    )}
                    <div style={{
                      maxWidth: "78%", padding: "9px 13px",
                      borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      background: isMe ? "var(--accent)" : "var(--border2)",
                      color: isMe ? "#fff" : "var(--text)",
                      fontSize: 13, lineHeight: 1.5, wordBreak: "break-word",
                    }}>{msg.content}</div>
                    <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 3, paddingLeft: 4, paddingRight: 4 }}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Message Input */}
          {dmTarget && (
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, flexShrink: 0, background: "var(--card)" }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder={`Message ${dmTarget?.name}...`}
                style={{
                  flex: 1, background: "var(--bg)",
                  border: "1px solid var(--border2)", borderRadius: 10,
                  padding: "9px 12px", color: "var(--text)",
                  fontFamily: "inherit", fontSize: 13, outline: "none",
                }}
              />
              <button onClick={sendMessage} style={{
                width: 36, height: 36, borderRadius: 10, background: "var(--accent)",
                border: "none", cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <i className="ti ti-send" style={{ fontSize: 15, color: "#fff" }} />
              </button>
            </div>
          )}

          {/* Bottom bar with + */}
          {!dmTarget && (
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", flexShrink: 0, position: "relative", display: "flex", alignItems: "center", background: "var(--card)" }}>

              {/* Contact picker */}
              {showNewContact && (
                <div className="chat-picker" style={{
                  position: "absolute", bottom: "calc(100% + 8px)", left: 14,
                  width: 300, maxHeight: 280, borderRadius: 14,
                  background: "var(--card)", backdropFilter: "blur(20px)",
                  border: "1px solid var(--border)", boxShadow: "0 8px 30px rgba(0,0,0,0.2)",
                  overflow: "hidden", display: "flex", flexDirection: "column", zIndex: 10,
                }}>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>New Message</span>
                    <button onClick={() => setShowNewContact(false)} style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", fontSize: 16 }}>
                      <i className="ti ti-x" />
                    </button>
                  </div>
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    <input
                      autoFocus
                      placeholder="Search people..."
                      value={contactSearch}
                      onChange={e => setContactSearch(e.target.value)}
                      style={{
                        width: "100%", background: "var(--bg)",
                        border: "1px solid var(--border2)", borderRadius: 8,
                        padding: "7px 10px", color: "var(--text)", fontFamily: "inherit",
                        fontSize: 13, outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div style={{ overflowY: "auto", flex: 1 }}>
                    {members.filter(m => m.name?.toLowerCase().includes(contactSearch.toLowerCase())).length === 0 ? (
                      <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--text3)" }}>No members found</div>
                    ) : (
                      members
                        .filter(m => m.name?.toLowerCase().includes(contactSearch.toLowerCase()))
                        .map(m => (
                          <div key={m.id} onClick={() => openDm(m)} className="chat-row" style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "10px 12px", cursor: "pointer",
                            borderBottom: "1px solid var(--border)",
                            transition: "background .15s",
                          }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: "50%",
                              background: m.color || "var(--accent)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
                            }}>{m.name?.[0]?.toUpperCase() || "?"}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{m.name}</div>
                              <div style={{ fontSize: 11, color: "var(--text3)" }}>{m.role || "member"}</div>
                            </div>
                            {activeConversations.has(m.id) && (
                              <span style={{ fontSize: 10, color: "var(--text3)", background: "var(--border)", padding: "2px 6px", borderRadius: 6 }}>existing</span>
                            )}
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowNewContact(v => !v)}
                title="New message"
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: showNewContact ? "var(--accent)" : "var(--border)",
                  border: `1px solid ${showNewContact ? "var(--accent)" : "var(--border2)"}`,
                  color: showNewContact ? "#fff" : "var(--text2)",
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all .15s", flexShrink: 0,
                }}
              >
                <i className="ti ti-plus" style={{ fontSize: 17 }} />
              </button>
              <span style={{ fontSize: 12, color: "var(--text3)", marginLeft: 10 }}>
                {conversationMembers.length > 0 ? "New conversation" : "Start a conversation"}
              </span>
            </div>
          )}
        </div>
      )}
    </>
  );
}