"use client";

/**
 * AssistanceBot -- Slide-over Application Help Drawer
 *
 * Provides a help bot that accepts text or voice input, queries the
 * `chatbot_knowledge` table via ILIKE search (through a server action),
 * and returns helpful Urdu text responses.
 *
 * Usage:
 *   <AssistanceBot isOpen={botOpen} onClose={() => setBotOpen(false)} />
 */

import {
  useState, useRef, useCallback,
  type FormEvent, type CSSProperties,
} from "react";
import {
  X, Send, Mic, MicOff, HelpCircle, BookOpen, Loader2,
} from "lucide-react";
import { askChatbotText, askChatbotVoice } from "@/lib/actions/chatbot";
import type { ChatbotAnswer } from "@/lib/actions/chatbot";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BotMessage {
  id: number;
  role: "user" | "bot";
  text: string;
  title?: string | null;
  category?: string | null;
  sources?: Array<{ title: string; category: string | null }>;
}

// ---------------------------------------------------------------------------
// Colors & Styles
// ---------------------------------------------------------------------------

const c = {
  primary: "#006633", accent: "#D4AF37", white: "#fff",
  bg: "#f4f7f5", text: "#1a1a1a", muted: "#555", border: "#dde3df",
  error: "#cc0000",
};

const s: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 1200,
    background: "rgba(0,0,0,0.35)", transition: "opacity 0.25s",
  },
  drawer: {
    position: "fixed", top: 0, right: 0, bottom: 0,
    width: "100%", maxWidth: 420, zIndex: 1201,
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
  chat: {
    flex: 1, overflowY: "auto", padding: "1rem",
    display: "flex", flexDirection: "column", gap: "0.75rem",
  },
  welcome: {
    textAlign: "center", color: c.muted, padding: "2rem 1rem",
    lineHeight: 1.8,
  },
  suggestions: {
    display: "flex", flexWrap: "wrap", gap: "0.4rem",
    justifyContent: "center", marginTop: "1rem",
  },
  chip: {
    padding: "0.4rem 0.75rem", background: "#f0f5f2",
    border: `1px solid ${c.border}`, borderRadius: 20,
    fontSize: "0.78rem", color: c.primary, cursor: "pointer",
    fontWeight: 500,
  },
  userBubble: {
    alignSelf: "flex-start", background: c.primary, color: c.white,
    padding: "0.6rem 0.9rem", borderRadius: "12px 12px 12px 4px",
    maxWidth: "85%", fontSize: "0.88rem", lineHeight: 1.5,
    wordBreak: "break-word",
  },
  botBubble: {
    alignSelf: "flex-end", background: "#f0f2f1", color: c.text,
    padding: "0.6rem 0.9rem", borderRadius: "12px 12px 4px 12px",
    maxWidth: "85%", fontSize: "0.88rem", lineHeight: 1.6,
    wordBreak: "break-word",
  },
  botTitle: {
    fontSize: "0.72rem", fontWeight: 700, color: c.primary,
    marginBottom: 4, display: "flex", alignItems: "center", gap: 4,
  },
  botCategory: {
    fontSize: "0.65rem", color: c.muted,
    background: "#e8f0eb", padding: "1px 6px", borderRadius: 8,
    marginRight: 4,
  },
  sourceList: {
    marginTop: 6, paddingTop: 6,
    borderTop: `1px solid ${c.border}`,
    fontSize: "0.7rem", color: c.muted,
  },
  form: {
    display: "flex", gap: "0.4rem", padding: "0.75rem 1rem",
    borderTop: `1.5px solid ${c.border}`, flexShrink: 0,
    background: c.white, alignItems: "center",
  },
  input: {
    flex: 1, padding: "0.6rem 0.85rem",
    border: `1.5px solid ${c.border}`, borderRadius: 10,
    fontSize: "0.88rem", outline: "none",
    fontFamily: "inherit",
  },
  sendBtn: {
    padding: "0.55rem 0.75rem", background: c.primary, color: c.white,
    border: "none", borderRadius: 10, display: "flex",
    alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0,
  },
  sendBtnDisabled: {
    padding: "0.55rem 0.75rem", background: "#99b3a6", color: c.white,
    border: "none", borderRadius: 10, display: "flex",
    alignItems: "center", justifyContent: "center",
    cursor: "not-allowed", flexShrink: 0,
  },
  micBtn: {
    padding: "0.55rem 0.75rem", background: "transparent",
    border: `1.5px solid ${c.border}`, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0, color: c.muted,
  },
  micBtnRecording: {
    padding: "0.55rem 0.75rem", background: "#fff0f0",
    border: `1.5px solid ${c.error}`, borderRadius: 10,
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", flexShrink: 0, color: c.error,
  },
  loadingRow: {
    alignSelf: "flex-end", padding: "0.5rem 0.9rem",
    background: "#f0f2f1", borderRadius: "12px 12px 4px 12px",
    display: "flex", alignItems: "center", gap: 6,
    color: c.muted, fontSize: "0.85rem",
  },
  voiceStatus: {
    textAlign: "center", padding: "0.4rem", fontSize: "0.78rem",
    color: c.error, fontWeight: 500,
  },
};

// ---------------------------------------------------------------------------
// Suggestion chips
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  "ٹیب کیسے تبدیل کریں؟",
  "آواز کا نوٹ کیسے ریکارڈ کریں؟",
  "پرچی کی تصویر کیسے اپ لوڈ کریں؟",
  "سیٹلمنٹ کیسے بنائیں؟",
  "سیٹلمنٹ کی تفصیل کیسے دیکھیں؟",
  "نرخ کیسے دیکھیں؟",
  "چیٹ کیسے کھولیں؟",
  "نیلامی کیسے دیکھیں؟",
  "کمیشن کیسے حساب ہوتا ہے؟",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface AssistanceBotProps {
  isOpen: boolean;
  onClose: () => void;
}

let msgIdCounter = 0;

export default function AssistanceBot({ isOpen, onClose }: AssistanceBotProps) {
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Voice recording state
  const [recording, setRecording] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // -----------------------------------------------------------------------
  // Add message helper
  // -----------------------------------------------------------------------
  const addMsg = useCallback((msg: Omit<BotMessage, "id">) => {
    const id = ++msgIdCounter;
    setMessages(prev => [...prev, { ...msg, id }]);
    setTimeout(scrollToBottom, 50);
    return id;
  }, [scrollToBottom]);

  // -----------------------------------------------------------------------
  // Text query
  // -----------------------------------------------------------------------
  const handleTextSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    addMsg({ role: "user", text });
    setLoading(true);

    try {
      const result: ChatbotAnswer = await askChatbotText(text);
      addMsg({
        role: "bot",
        text: result.answer,
        title: result.title,
        category: result.category,
        sources: result.sources,
      });
    } catch {
      addMsg({
        role: "bot",
        text: "خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔",
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, addMsg]);

  // -----------------------------------------------------------------------
  // Voice recording
  // -----------------------------------------------------------------------
  const startRecording = useCallback(async () => {
    try {
      setVoiceStatus(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });

        if (blob.size < 1000) {
          setVoiceStatus("آواز بہت مختصر ہے۔ دوبارہ کوشش کریں۔");
          return;
        }

        // Convert to base64 and send to server action
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);

        addMsg({ role: "user", text: "(آواز کا پیغام)" });
        setLoading(true);
        setVoiceStatus(null);

        try {
          const result = await askChatbotVoice(base64, mime);
          if (result.transcribedText) {
            addMsg({ role: "user", text: result.transcribedText });
          }
          addMsg({
            role: "bot",
            text: result.answer,
            title: result.title,
            category: result.category,
            sources: result.sources,
          });
        } catch {
          addMsg({
            role: "bot",
            text: "آواز پروسیس نہیں ہو سکی۔ براہ کرم دوبارہ کوشش کریں۔",
          });
        } finally {
          setLoading(false);
        }
      };

      recorder.start();
      mediaRef.current = recorder;
      setRecording(true);
    } catch {
      setVoiceStatus("مائیکروفون تک رسائی نہیں ملی۔");
    }
  }, [addMsg]);

  const stopRecording = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      mediaRef.current.stop();
    }
    mediaRef.current = null;
    setRecording(false);
  }, []);

  // -----------------------------------------------------------------------
  // Suggestion click
  // -----------------------------------------------------------------------
  const handleSuggestion = useCallback(async (text: string) => {
    if (loading) return;
    addMsg({ role: "user", text });
    setLoading(true);

    try {
      const result = await askChatbotText(text);
      addMsg({
        role: "bot",
        text: result.answer,
        title: result.title,
        category: result.category,
        sources: result.sources,
      });
    } catch {
      addMsg({
        role: "bot",
        text: "خرابی آ گئی۔ براہ کرم دوبارہ کوشش کریں۔",
      });
    } finally {
      setLoading(false);
    }
  }, [loading, addMsg]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (!isOpen) return null;

  const hasMessages = messages.length > 0;
  const canSend = input.trim().length > 0 && !loading && !recording;

  return (
    <>
      {/* Backdrop */}
      <div style={s.overlay} onClick={onClose} />

      {/* Drawer */}
      <div style={s.drawer}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.headerTitle}>
            <HelpCircle size={18} />
            مددگار بوٹ
          </div>
          <button onClick={onClose} style={s.closeBtn}>
            <X size={18} />
          </button>
        </div>

        {/* Chat area */}
        <div style={s.chat}>
          {!hasMessages && !loading && (
            <div style={s.welcome}>
              <BookOpen size={32} color={c.accent} />
              <div style={{ marginTop: "0.75rem", fontWeight: 600, color: c.text }}>
                مددگار بوٹ میں خوش آمدید
              </div>
              <div style={{ marginTop: "0.4rem" }}>
                ایپ استعمال کرنے کے بارے میں سوال پوچھیں
              </div>
              <div style={s.suggestions}>
                {SUGGESTIONS.map((chip) => (
                  <button
                    key={chip}
                    style={s.chip}
                    onClick={() => handleSuggestion(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              {msg.role === "user" ? (
                <div style={s.userBubble}>{msg.text}</div>
              ) : (
                <div style={s.botBubble}>
                  {(msg.title || msg.category) && (
                    <div style={s.botTitle}>
                      <BookOpen size={12} />
                      {msg.title && <span>{msg.title}</span>}
                      {msg.category && (
                        <span style={s.botCategory}>{msg.category}</span>
                      )}
                    </div>
                  )}
                  <div>{msg.text}</div>
                  {msg.sources && msg.sources.length > 0 && (
                    <div style={s.sourceList}>
                      مزید: {msg.sources.map(src => src.title).join(" | ")}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={s.loadingRow}>
              <Loader2 size={14} />
              جواب تلاش ہو رہا ہے...
            </div>
          )}

          {recording && (
            <div style={s.voiceStatus}>
              ریکارڈنگ جاری ہے... بولنے کے بعد رکنے کا بٹن دبائیں
            </div>
          )}
          {voiceStatus && <div style={s.voiceStatus}>{voiceStatus}</div>}

          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <form onSubmit={handleTextSubmit} style={s.form}>
          {/* Voice toggle */}
          {recording ? (
            <button
              type="button"
              onClick={stopRecording}
              style={s.micBtnRecording}
              title="ریکارڈنگ بند کریں"
            >
              <MicOff size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              style={s.micBtn}
              disabled={loading}
              title="آواز سے پوچھیں"
            >
              <Mic size={18} />
            </button>
          )}

          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="سوال پوچھیں..."
            style={s.input}
            disabled={loading || recording}
            autoComplete="off"
          />

          <button
            type="submit"
            disabled={!canSend}
            style={canSend ? s.sendBtn : s.sendBtnDisabled}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </>
  );
}
