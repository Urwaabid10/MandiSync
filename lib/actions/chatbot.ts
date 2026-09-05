"use server";

/**
 * Server action for the AssistanceBot component.
 *
 * Handles two flows:
 * 1. askChatbotText(question)    -- ILIKE search on chatbot_knowledge table
 * 2. askChatbotVoice(base64)     -- Groq transcription + ILIKE search
 *
 * Returns the best matching knowledge entry or a fallback Urdu message.
 */

import { createClient } from "@/lib/supabase/server";
import { transcribeToText, GIBBERISH_MESSAGE } from "@/lib/services/groq";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatbotAnswer {
  answer: string;
  title: string | null;
  category: string | null;
  sources: Array<{ title: string; category: string | null }>;
}

// ---------------------------------------------------------------------------
// Off-topic guardrail — scope check
// ---------------------------------------------------------------------------

/**
 * Keywords that signal the question is about MandiSync app usage.
 * If NONE of these appear in the query, the bot politely declines.
 */
const APP_KEYWORDS = new Set([
  // English
  "mandisync", "mandi", "login", "logout", "sign", "dashboard", "tab",
  "voice", "record", "receipt", "perchi", "photo", "image", "upload",
  "chat", "message", "price", "rate", "trend", "commission", "settlement",
  "auction", "notice", "arrival", "profile", "password", "account",
  "help", "how", "use", "bot", "ocr", "scan", "chart", "graph",
  "farmer", "arthi", "bidder", "buyer", "shop", "expense", "print",
  "crop", "mango", "gatta", "peti", "birki", "bikri", "labour", "labor",
  "kisan", "kissan", "notification", "phone", "call", "number",
  // Urdu
  "منڈی", "سنک", "لاگ", "اکاؤنٹ", "ڈیش", "بورڈ", "ٹیب",
  "آواز", "وائس", "ریکارڈ", "نوٹ", "پرچی", "تصویر",
  "اپلوڈ", "پیغام", "چیٹ", "نرخ", "قیمت", "کمیشن",
  "سیٹلمنٹ", "نیلامی", "آمد", "پروفائل", "پاس", "ورڈ",
  "مدد", "کیسے", "استعمال", "بوٹ", "باہر", "بند",
  "کسان", "آرتھی", "بولی", "دکان", "اخراجات", "ماہانہ",
  "گٹا", "پیٹی", "برکی", "بکری", "لیبر", "مہمان",
  "چارٹ", "رجحان", "اوسط", "کم", "زیادہ", "فیصد",
  "تصدیق", "شائع", "نوٹس", "رابطہ", "فون", "کال",
  "پرنٹ", "سلپ", "حساب", "کیا", "ہے", "کیوں",
]);

const OUT_OF_SCOPE: ChatbotAnswer = {
  answer:
    "میں صرف منڈی سنک (MandiSync) ایپ استعمال کرنے میں آپ کی مدد کر سکتا ہوں۔ براہ کرم ایپ کے بارے میں سوال پوچھیں۔",
  title: null,
  category: null,
  sources: [],
};

/**
 * Returns true when the query mentions at least one MandiSync app concept.
 * Keeps the bot strictly scoped to app-navigation and usage questions.
 */
function isAppRelated(query: string): boolean {
  const lower = query.toLowerCase();
  for (const kw of APP_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Knowledge search (ILIKE on title + content)
// ---------------------------------------------------------------------------

const FALLBACK: ChatbotAnswer = {
  answer:
    "معذرت، مجھے اس سوال کا جواب نہیں ملا۔ آپ ان موضوعات پر سوال پوچھ سکتے ہیں:\n\n• لاگ ان / اکاؤنٹ\n• کسان ڈیش بورڈ — نرخ، چارٹ، سیٹلمنٹ سلپس\n• آرتھی ڈیش بورڈ — وائس ریکارڈر، پرچی / سیٹلمنٹ، آمد\n• بولی لگانے والا — نیلامیاں، آرتھی رابطہ\n• چیٹ / پیغامات\n• سیٹلمنٹ حساب (کچی/پختہ بکری)\n\nنیچے بائیں سبز بٹن سے دوبارہ پوچھیں۔",
  title: null,
  category: null,
  sources: [],
};

/**
 * Rank knowledge entries by token relevance and return the best match.
 */
function rankAndReturn(
  data: Array<{ id: number; title: string; content: string; category: string | null }>,
  tokens: string[],
): ChatbotAnswer {
  const scored = data.map((entry) => {
    let score = 0;
    const lowerTitle = entry.title.toLowerCase();
    const lowerContent = entry.content.toLowerCase();
    for (const token of tokens) {
      const lt = token.toLowerCase();
      if (lowerTitle.includes(lt)) score += 3;
      if (lowerContent.includes(lt)) score += 1;
    }
    return { ...entry, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // If best score is 0, no real match — return fallback
  if (scored[0].score === 0) return FALLBACK;

  const best = scored[0];

  // Truncate long answers to ~400 chars for readability
  let answer = best.content;
  if (answer.length > 400) {
    answer = answer.slice(0, 397) + "...";
  }

  return {
    answer,
    title: best.title,
    category: best.category,
    sources: scored.slice(0, 3).map((s) => ({
      title: s.title,
      category: s.category,
    })),
  };
}

/**
 * Search the chatbot_knowledge table for entries matching the query.
 * Uses ILIKE on title and content columns for fuzzy Urdu text matching.
 * Falls back to broad search if no ILIKE matches found.
 */
async function searchKnowledge(query: string): Promise<ChatbotAnswer> {
  const supabase = await createClient();

  // Extract key words from the query (split on spaces, filter short tokens)
  const tokens = query
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2);

  if (tokens.length === 0) return FALLBACK;

  // Build OR conditions for ILIKE matching on title AND content
  const conditions = tokens
    .map(t => `title.ilike.%${t}%,content.ilike.%${t}%`)
    .join(",");

  const { data, error } = await supabase
    .from("chatbot_knowledge")
    .select("id, title, content, category")
    .or(conditions)
    .limit(10);

  // If ILIKE returns nothing, try a broader search (fetch all, rank client-side)
  if (error || !data || data.length === 0) {
    const broadRes = await supabase
      .from("chatbot_knowledge")
      .select("id, title, content, category")
      .limit(50);
    if (!broadRes.error && broadRes.data && broadRes.data.length > 0) {
      return rankAndReturn(broadRes.data, tokens);
    }
    return FALLBACK;
  }

  return rankAndReturn(data, tokens);
}

// ---------------------------------------------------------------------------
// Public server actions
// ---------------------------------------------------------------------------

/**
 * Ask the chatbot a text question.
 * Called directly from the AssistanceBot component's text input.
 */
export async function askChatbotText(question: string): Promise<ChatbotAnswer> {
  const trimmed = question.trim();
  if (!trimmed) return FALLBACK;

  // Off-topic guard: only answer MandiSync app-usage questions
  if (!isAppRelated(trimmed)) return OUT_OF_SCOPE;

  // Auth check -- only authenticated users can query
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      answer: "براہ کرم پہلے لاگ ان کریں۔",
      title: null,
      category: null,
      sources: [],
    };
  }

  return searchKnowledge(trimmed);
}

/**
 * Ask the chatbot via voice. The audio is transcribed server-side via Groq,
 * then the transcribed text is used to query chatbot_knowledge.
 *
 * @param audioBase64 - Base64-encoded audio data (from browser MediaRecorder).
 * @param mimeType    - MIME type of the audio (default: "audio/webm").
 */
export async function askChatbotVoice(
  audioBase64: string,
  mimeType: string = "audio/webm"
): Promise<ChatbotAnswer & { transcribedText: string | null }> {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      ...FALLBACK,
      answer: "براہ کرم پہلے لاگ ان کریں۔",
      transcribedText: null,
    };
  }

  // Transcribe via Groq Whisper
  const transcribedText = await transcribeToText(audioBase64, mimeType);
  if (!transcribedText) {
    return {
      ...FALLBACK,
      answer: "آواز کی شناخت نہیں ہو سکی۔ براہ کرم دوبارہ کوشش کریں۔",
      transcribedText: null,
    };
  }

  // Gibberish / corrupted audio guard
  if (transcribedText === GIBBERISH_MESSAGE) {
    return {
      ...FALLBACK,
      answer: GIBBERISH_MESSAGE,
      transcribedText: null,
    };
  }

  // Off-topic guard: only answer MandiSync app-usage questions
  if (!isAppRelated(transcribedText)) {
    return { ...OUT_OF_SCOPE, transcribedText };
  }

  const result = await searchKnowledge(transcribedText);
  return { ...result, transcribedText };
}
