"use client";

/**
 * ChatDrawer -- Farmer-Arthi Direct Text Messaging
 *
 * A slide-over drawer for real-time text chat between a Farmer and their
 * linked Arthi. Backed by the Supabase `messages` table with realtime
 * subscription for live updates.
 *
 * Usage:
 *   <ChatDrawer
 *     isOpen={chatOpen}
 *     onClose={() => setChatOpen(false)}
 *     currentUserId={profile.id}
 *     recipientId={arthi.id}
 *     recipientName={arthi.name}
 *   />
 */

import {
  useState, useEffect, useRef, useCallback,
  type FormEvent, type CSSProperties,
} from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/supabase";
import { X, Send, MessageSquare } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MessageRow = Tables<"messages">;

interface ChatMessage extends MessageRow {
  isMine: boolean;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: number;
  recipientId: number;
  recipientName: string | null;
}

// ---------------------------------------------------------------------------
// Colors & Styles
// ---------------------------------------------------------------------------

const c = {
  primary: "#006633", accent: "#D4AF37", white: "#fff",
  bg: "#f4f7f5", text: "#1a1a1a", muted: "#555", border: "#dde3df",
};

const s: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 1100,
    background: "rgba(0,0,0,0.35)", transition: "opacity 0.25s",
  },
  drawer: {
    position: "fixed", top: 0, right: 0, bottom: 0,
    width: "100%", maxWidth: 420, zIndex: 1101,
    background: c.white, boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
    display: "flex", flexDirection: "column",
    borderLeft: `2px solid ${c.accent}`,
    transition: "transform 0.3s ease",
  },
  header: {
    background: c.primary, color: c.white,
    padding: "0.85rem 1rem",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: "1rem", fontWeight: 700,
    display: "flex", alignItems: "center", gap: 8,
  },
  closeBtn: {
    background: "rgba(255,255,255,0.15)", border: "none",
    color: c.white, width: 32, height: 32, borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer",
  },
  messages: {
    flex: 1, overflowY: "auto", padding: "1rem",
    display: "flex", flexDirection: "column", gap: "0.5rem",
  },
  bubbleMine: {
    alignSelf: "flex-start", background: c.primary, color: c.white,
    padding: "0.55rem 0.85rem", borderRadius: "12px 12px 12px 4px",
    maxWidth: "80%", fontSize: "0.9rem", lineHeight: 1.5,
    wordBreak: "break-word",
  },
  bubbleTheirs: {
    alignSelf: "flex-end", background: "#f0f2f1", color: c.text,
    padding: "0.55rem 0.85rem", borderRadius: "12px 12px 4px 12px",
    maxWidth: "80%", fontSize: "0.9rem", lineHeight: 1.5,
    wordBreak: "break-word",
  },
  timestamp: {
    fontSize: "0.65rem", color: c.muted, marginTop: 2,
    textAlign: "center",
  },
  form: {
    display: "flex", gap: "0.5rem", padding: "0.75rem 1rem",
    borderTop: `1.5px solid ${c.border}`, flexShrink: 0,
    background: c.white,
  },
  input: {
    flex: 1, padding: "0.6rem 0.85rem",
    border: `1.5px solid ${c.border}`, borderRadius: 10,
    fontSize: "0.9rem", outline: "none",
    fontFamily: "inherit",
  },
  sendBtn: {
    padding: "0.55rem 0.85rem", background: c.primary, color: c.white,
    border: "none", borderRadius: 10, display: "flex",
    alignItems: "center", justifyContent: "center", gap: 4,
    fontWeight: 600, fontSize: "0.85rem",
    cursor: "pointer", flexShrink: 0,
  },
  sendBtnDisabled: {
    padding: "0.55rem 0.85rem", background: "#99b3a6", color: c.white,
    border: "none", borderRadius: 10, display: "flex",
    alignItems: "center", justifyContent: "center", gap: 4,
    fontWeight: 600, fontSize: "0.85rem",
    cursor: "not-allowed", flexShrink: 0,
  },
  empty: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    color: "#999", fontSize: "0.9rem", textAlign: "center",
    padding: "2rem",
  },
  loading: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    color: c.muted, fontSize: "0.9rem",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString("ur-PK", {
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatDrawer({
  isOpen, onClose, currentUserId, recipientId, recipientName,
}: ChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelRef = useRef<any>(null);

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // -----------------------------------------------------------------------
  // Load message history
  // -----------------------------------------------------------------------
  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${recipientId}),` +
          `and(sender_id.eq.${recipientId},receiver_id.eq.${currentUserId})`
        )
        .order("created_at", { ascending: true })
        .limit(200);

      const msgs = (data ?? []).map(m => ({
        ...m,
        isMine: m.sender_id === currentUserId,
      }));
      setMessages(msgs);

      // Mark received messages as read
      const unreadIds = msgs
        .filter(m => !m.isMine && !m.is_read)
        .map(m => m.id);
      if (unreadIds.length > 0) {
        await supabase.from("messages")
          .update({ is_read: true })
          .in("id", unreadIds);
      }
    } catch (err) {
      console.error("[Chat] Load error:", err);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  }, [currentUserId, recipientId, scrollToBottom]);

  // -----------------------------------------------------------------------
  // Realtime subscription
  // -----------------------------------------------------------------------
  const subscribeToMessages = useCallback(() => {
    const supabase = createClient();

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`chat-${currentUserId}-${recipientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const newMsg = payload.new as MessageRow;
          // Only process messages in this conversation
          const isInConversation =
            (newMsg.sender_id === currentUserId && newMsg.receiver_id === recipientId) ||
            (newMsg.sender_id === recipientId && newMsg.receiver_id === currentUserId);

          if (!isInConversation) return;

          setMessages(prev => {
            // Replace optimistic message (negative ID) with real one, or add new
            const realAlreadyExists = prev.some(m => m.id === newMsg.id && m.id > 0);
            if (realAlreadyExists) return prev;
            // If this is our own message, replace the optimistic one
            if (newMsg.sender_id === currentUserId) {
              const optimisticIdx = prev.findIndex(m => m.id < 0 && m.isMine && m.message === newMsg.message);
              if (optimisticIdx >= 0) {
                const updated = [...prev];
                updated[optimisticIdx] = { ...newMsg, isMine: true };
                return updated;
              }
            }
            return [...prev, {
              ...newMsg,
              isMine: newMsg.sender_id === currentUserId,
            }];
          });

          // Mark as read if received
          if (newMsg.sender_id !== currentUserId && !newMsg.is_read) {
            supabase.from("messages")
              .update({ is_read: true })
              .eq("id", newMsg.id);
          }

          setTimeout(scrollToBottom, 50);
        }
      )
      .subscribe();

    channelRef.current = channel;
  }, [currentUserId, recipientId, scrollToBottom]);

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      loadMessages();
      subscribeToMessages();
    }
    return () => {
      if (channelRef.current) {
        const supabase = createClient();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [isOpen, loadMessages, subscribeToMessages]);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // -----------------------------------------------------------------------
  // Send message
  // -----------------------------------------------------------------------
  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");

    // Optimistic update: show message immediately before server confirms
    const optimisticMsg: ChatMessage = {
      id: -Date.now(), // temporary negative ID
      sender_id: currentUserId,
      receiver_id: recipientId,
      message: text,
      is_read: false,
      created_at: new Date().toISOString(),
      isMine: true,
    } as ChatMessage;
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(scrollToBottom, 50);

    try {
      const supabase = createClient();
      const { error } = await supabase.from("messages").insert({
        sender_id: currentUserId,
        receiver_id: recipientId,
        message: text,
        is_read: false,
      });
      if (error) {
        console.error("[Chat] Send error:", error.message);
        // Remove optimistic message on failure
        setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
        setInput(text);
      }
      // The realtime subscription will replace the optimistic message with the real one
    } catch (err) {
      console.error("[Chat] Send error:", err);
      setMessages(prev => prev.filter(m => m.id !== optimisticMsg.id));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div style={s.overlay} onClick={onClose} />

      {/* Drawer */}
      <div style={s.drawer}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.headerTitle}>
            <MessageSquare size={18} />
            {recipientName ?? "پیغام"}
          </div>
          <button onClick={onClose} style={s.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        {loading ? (
          <div style={s.loading}>لوڈ ہو رہا ہے...</div>
        ) : messages.length === 0 ? (
          <div style={s.empty}>
            <div>
              <MessageSquare size={32} color={c.accent} />
              <div style={{ marginTop: "0.75rem" }}>
                ابھی تک کوئی پیغام نہیں۔ پہلا پیغام بھیجیں!
              </div>
            </div>
          </div>
        ) : (
          <div style={s.messages}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ display: "flex", flexDirection: "column" }}>
                <div style={msg.isMine ? s.bubbleMine : s.bubbleTheirs}>
                  {msg.message}
                </div>
                <div style={{
                  ...s.timestamp,
                  alignSelf: msg.isMine ? "flex-start" : "flex-end",
                }}>
                  {fmtTime(msg.created_at)}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSend} style={s.form}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="پیغام لکھیں..."
            style={s.input}
            disabled={sending}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            style={sending || !input.trim() ? s.sendBtnDisabled : s.sendBtn}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </>
  );
}
