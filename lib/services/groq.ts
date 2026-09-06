/**
 * Groq Whisper Large v3 Turbo Audio Transcription Service
 *
 * Wraps the Groq-compatible OpenAI audio transcription REST API.
 * Used by all three Arthi voice note types (mandi_rate, auction_arrival,
 * settlement_audio) and the chatbot voice input to convert recorded
 * audio into plain text.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-large-v3-turbo";

/** Maximum audio file size accepted by Groq (25 MB) */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Friendly Urdu message when transcription is unintelligible */
export const GIBBERISH_MESSAGE =
  "آواز صحیح نہیں سنائی دی۔ براہ کرم دوبارہ صاف آواز میں ریکارڈ کریں۔";

/** Known Whisper hallucination outputs that should be rejected */
const HALLUCINATION_TOKENS = new Set([
  "موسیقی",       // "music" — Whisper's #1 Urdu hallucination
  "شکریہ",        // "thank you"
  "براہ مہربانی", // "please"
  "you",          // English hallucination
  "thanks for watching",
  "please subscribe",
  "here we go",
]);

// Agricultural domain prompt — natural sentences to guide Whisper
// Whisper works much better with sentence examples than keyword lists
const URDU_WHISPER_PROMPT =
  "آج منڈی میں گندم کی قیمت بارہ سو روپے فی من ہے۔ " +
  "کسان محمد صاحب پانچ گٹے کپاس لائے ہیں۔ " +
  "سرگودھا منڈی میں کینو کا ریٹ آٹھ سو سے ایک ہزار روپے ہے۔ " +
  "فیصل آباد منڈی میں چاول کی آمد ہوئی۔ " +
  "منڈی نرخ، فصل، کسان، گٹو، پیٹی، بولی، نرخ، آرتھی، مزارع، سیٹلمنٹ، پرچی، کمیشن۔";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TranscriptionResult {
  /** The transcribed text */
  text: string;
  /** Language detected by Whisper (e.g. "ur", "en") */
  language?: string;
  /** Duration of the audio in seconds */
  duration?: number;
}

export interface TranscriptionError {
  message: string;
  code?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error(
      "GROQ_API_KEY environment variable is not set. " +
        "Add it to .env.local to enable audio transcription."
    );
  }
  return key;
}

// ---------------------------------------------------------------------------
// Core transcription function
// ---------------------------------------------------------------------------

/**
 * Transcribes an audio file using Groq's Whisper Large v3 Turbo model.
 *
 * @param audio - The audio as a Blob (from browser MediaRecorder),
 *                ArrayBuffer, or base64-encoded string.
 * @param mimeType - MIME type of the audio (e.g. "audio/webm", "audio/mp4").
 *                   Defaults to "audio/webm".
 * @param fileName - Optional filename hint for the upload.
 * @returns TranscriptionResult with the recognized text.
 * @throws Error on network or API failures.
 */
export async function transcribeAudio(
  audio: Blob | ArrayBuffer | string,
  mimeType: string = "audio/webm",
  fileName?: string
): Promise<TranscriptionResult> {
  const apiKey = getApiKey();

  // Normalize input to a Blob
  let audioBlob: Blob;
  if (typeof audio === "string") {
    // Assume base64-encoded — decode to raw bytes
    const binary = atob(audio);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    audioBlob = new Blob([bytes], { type: mimeType });
  } else if (audio instanceof ArrayBuffer) {
    audioBlob = new Blob([audio], { type: mimeType });
  } else {
    audioBlob = audio;
  }

  // Zero-byte guard
  if (audioBlob.size === 0) {
    throw new Error("Audio blob is empty (0 bytes). Recording may have failed.");
  }

  // Size guard
  if (audioBlob.size > MAX_AUDIO_BYTES) {
    throw new Error(
      `Audio file too large (${Math.round(audioBlob.size / 1024 / 1024)} MB). ` +
        `Maximum allowed size is 25 MB.`
    );
  }

  // Build multipart form data
  const form = new FormData();

  // ── Proper File construction with explicit filename & MIME type ──
  const ext = (mimeType.split("/")[1] ?? "webm").replace("x-", "");
  const resolvedFileName = fileName ?? `voice_note.${ext}`;
  const audioFile = new File([audioBlob], resolvedFileName, { type: mimeType });
  form.append("file", audioFile);

  form.append("model", WHISPER_MODEL);
  form.append("response_format", "verbose_json");

  // ── Strict Urdu language enforcement ──
  form.append("language", "ur");

  // ── Agricultural domain prompt ──
  form.append("prompt", URDU_WHISPER_PROMPT);

  // ── Low temperature for deterministic output (reduces hallucinations) ──
  form.append("temperature", "0");

  // Call Groq API
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = await response.json();
      detail = errorBody?.error?.message ?? JSON.stringify(errorBody);
    } catch {
      detail = await response.text().catch(() => "Unknown error");
    }
    // Explicit diagnostic logging for API key, rate limit, and network errors
    console.error(
      "Groq Transcription Error:",
      `status=${response.status}`,
      `file=${resolvedFileName} (${audioBlob.size} bytes, ${mimeType})`,
      `detail=${detail}`
    );
    throw new Error(
      `Groq transcription failed (${response.status}): ${detail}`
    );
  }

  const data = await response.json();
  const rawText: string = data.text ?? "";

  // Log successful transcription metadata for debugging
  console.log(
    `[Groq] OK: lang=${data.language}, duration=${data.duration}s, ` +
    `size=${audioBlob.size} bytes, ` +
    `text="${rawText.slice(0, 80)}${rawText.length > 80 ? "..." : ""}"`
  );

  return {
    text: rawText,
    language: data.language,
    duration: data.duration,
  };
}

// ---------------------------------------------------------------------------
// Convenience: quick transcription returning just the text string
// ---------------------------------------------------------------------------

/**
 * Shorthand that returns only the transcribed text, or null on failure.
 *
 * Performs gibberish / language-isolation checks and retries once if the
 * first result looks corrupted (Icelandic hallucination, etc.).
 * Returns the friendly GIBBERISH_MESSAGE when audio is unintelligible.
 */
export async function transcribeToText(
  audio: Blob | ArrayBuffer | string,
  mimeType?: string
): Promise<string | null> {
  const MAX_ATTEMPTS = 2;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await transcribeAudio(audio, mimeType);
      const cleaned = result.text ? cleanTranscription(result.text) : "";

      // ── Diagnostic logging ──
      console.log(
        `[transcribeToText] attempt=${attempt}/${MAX_ATTEMPTS}`,
        `raw="${(result.text ?? "").slice(0, 120)}"`,
        `cleaned="${cleaned.slice(0, 120)}"`,
        `lang=${result.language ?? "(none)"}`,
        `duration=${result.duration ?? "?"}s`
      );

      // Empty after cleaning → treat as silence
      if (!cleaned || cleaned.length < 2) {
        if (attempt < MAX_ATTEMPTS) continue;
        console.warn("[Groq] Empty transcription after", MAX_ATTEMPTS, "attempts");
        return null;
      }

      // ── Gibberish / language isolation guard ──
      const gibberish = isGibberish(cleaned, result.language);
      const hallucination = isHallucination(cleaned);
      if (gibberish || hallucination) {
        console.warn(
          `[Groq] ${hallucination ? "Hallucination" : "Gibberish"} detected (attempt ${attempt}/${MAX_ATTEMPTS}, ` +
          `lang=${result.language}): "${cleaned.slice(0, 80)}"`
        );
        if (attempt < MAX_ATTEMPTS) continue; // retry once
        // Both attempts failed — try Gemini as fallback transcriber
        console.log("[transcribeToText] Groq failed — falling back to Gemini audio transcription");
        const geminiResult = await geminiAudioTranscribe(audio, mimeType);
        if (geminiResult) return geminiResult;
        return GIBBERISH_MESSAGE;
      }

      return cleaned;
    } catch (err) {
      console.error(`[Groq] Transcription error (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
      if (attempt >= MAX_ATTEMPTS) {
        // Groq completely failed — try Gemini as fallback
        console.log("[transcribeToText] Groq errored out — falling back to Gemini audio transcription");
        const geminiResult = await geminiAudioTranscribe(audio, mimeType);
        if (geminiResult) return geminiResult;
        return null;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Gemini audio transcription fallback
// ---------------------------------------------------------------------------

/**
 * Uses Gemini 2.5 Flash to transcribe audio when Groq Whisper fails.
 * Gemini has native audio understanding and often handles Urdu better
 * than Whisper for noisy/short recordings.
 */
async function geminiAudioTranscribe(
  audio: Blob | ArrayBuffer | string,
  mimeType?: string
): Promise<string | null> {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("[Gemini-audio] No GEMINI_API_KEY — cannot use fallback");
      return null;
    }

    // Normalize to base64
    let base64: string;
    let mime = mimeType ?? "audio/webm";
    if (typeof audio === "string") {
      base64 = audio;
    } else if (audio instanceof ArrayBuffer) {
      const bytes = new Uint8Array(audio);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      base64 = btoa(bin);
    } else {
      const ab = await audio.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      base64 = btoa(bin);
      mime = audio.type || mime;
    }

    const ai = new GoogleGenAI({ apiKey });
    console.log("[Gemini-audio] Transcribing audio via Gemini 2.5 Flash...", `mime=${mime}`, `b64len=${base64.length}`);

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: {
        role: "user",
        parts: [
          {
            inlineData: {
              data: base64,
              mimeType: mime,
            },
          },
          {
            text:
              "Transcribe the audio exactly as spoken. " +
              "The speaker is speaking in Urdu about agricultural market topics " +
              "(crop names, mandi names, prices, farmer names, gattu/peti counts). " +
              "Return ONLY the transcribed text in the original language (Urdu script). " +
              "Do not translate. Do not add commentary. Just the exact words spoken.",
          },
        ],
      },
    });

    const text = (response.text ?? "").trim();
    console.log("[Gemini-audio] Transcription result:", text.slice(0, 200));

    if (!text || text.length < 2) return null;

    // Basic cleanup
    const cleaned = text
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned || cleaned.length < 2) return null;
    return cleaned;
  } catch (err) {
    console.error("[Gemini-audio] Fallback transcription error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Transcription cleanup — normalize Whisper output
// ---------------------------------------------------------------------------

/**
 * Cleans raw Whisper transcription for downstream entity resolution.
 *
 * - Collapses repeated whitespace
 * - Strips Whisper hallucination tokens ([BLANK_AUDIO], [silence], etc.)
 * - Removes common Whisper English hallucination phrases
 * - Removes trailing punctuation noise
 * - Trims leading/trailing whitespace
 */
export function cleanTranscription(raw: string): string {
  let text = raw;

  // Remove Whisper hallucination markers (bracketed and parenthesised)
  text = text.replace(/\[.*?\]/g, "");
  text = text.replace(/\(.*?\)/g, "");

  // Strip common Whisper hallucination phrases (case-insensitive)
  text = text.replace(/Thank you\.?\s*$/i, "");
  text = text.replace(/^\s*you\s*/i, "");
  text = text.replace(/\s*thanks for watching\.?\s*$/i, "");
  text = text.replace(/\s*please subscribe\.?\s*$/i, "");
  text = text.replace(/^\s*here we go\.?\s*/i, "");
  text = text.replace(/^\s*so,?\s*/i, "");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Remove trailing punctuation noise (repeated periods, commas)
  text = text.replace(/[.,،]{2,}/g, "").replace(/\s+[.,،]\s*$/g, "").trim();

  return text;
}

// ---------------------------------------------------------------------------
// Gibberish / language-isolation detection
// ---------------------------------------------------------------------------

// Unicode ranges considered valid for MandiSync transcriptions
//   Urdu / Arabic script:   \u0600-\u06FF  \u0750-\u077F  \u08A0-\u08FF
//   Arabic Extended-B:      \u0870-\u089F
//   Arabic Presentation:    \uFB50-\uFDFF  \uFE70-\uFEFF
//   Basic Latin (A-Z a-z):  \u0041-\u005A  \u0061-\u007A
//   Digits:                 \u0030-\u0039  \u0660-\u0669  \u06F0-\u06F9
//   Common punctuation & spaces
const VALID_CHAR_RE = new RegExp(
  "[\u0600-\u06FF\u0750-\u077F\u0870-\u08FF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF" +
  "A-Za-z0-9\u0660-\u0669\u06F0-\u06F9\\s.,\u060C;:!?()\u2013\u2014\u2018\u2019\u201C\u201D\\-/]"
);

// Latin Extended characters that commonly appear in Whisper hallucinations
// (Icelandic: á é í ó ú ý þ æ ö ð | Polish: ą ć ę ł ń ó ś ź ż | etc.)
const LATIN_EXTENDED_RE = /[\u00C0-\u024F]/;

/**
 * Returns true if the transcription looks like gibberish or a
 * non-Urdu language hallucination.
 *
 * Heuristics (ALL must agree — single signals are not enough):
 *   1. Whisper reports a non-regional language AND
 *   2. Character distribution is abnormal
 *
 * If only ONE signal fires, we log a warning but still accept the text
 * to avoid blocking legitimate Urdu / Roman Urdu transcriptions.
 */
/**
 * Returns true if the transcription matches a known Whisper hallucination.
 * E.g., Whisper outputting "موسیقی" (music) for all Urdu audio.
 */
function isHallucination(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (HALLUCINATION_TOKENS.has(normalized)) return true;
  // Also check if the text is ONLY a hallucination token with punctuation
  const stripped = normalized.replace(/[.!?؟،۔]/g, "").trim();
  return HALLUCINATION_TOKENS.has(stripped);
}

function isGibberish(text: string, detectedLang?: string): boolean {
  // 1. Language check — flag clearly wrong languages
  const KNOWN_LANGS = new Set(["ur", "en", "hi", "pa", "ps", "sd", "ar", "fa", "Urdu", "English", "Hindi"]);
  const langBad = !!detectedLang && !KNOWN_LANGS.has(detectedLang);

  // 2. Character distribution check
  const chars = Array.from(text.replace(/\s/g, ""));
  if (chars.length === 0) return true;

  let invalidCount = 0;
  let latinExtCount = 0;

  for (const ch of chars) {
    if (!VALID_CHAR_RE.test(ch)) invalidCount++;
    if (LATIN_EXTENDED_RE.test(ch)) latinExtCount++;
  }

  const invalidRatio = invalidCount / chars.length;
  const latinExtRatio = latinExtCount / chars.length;

  const charsBad = invalidRatio > 0.3 || latinExtRatio > 0.1;

  // ── Diagnostic log for every check ──
  console.log(
    `[isGibberish] lang=${detectedLang ?? "(none)"} langBad=${langBad}`,
    `chars=${chars.length} invalidRatio=${invalidRatio.toFixed(2)}`,
    `latinExtRatio=${latinExtRatio.toFixed(2)} charsBad=${charsBad}`,
    `text="${text.slice(0, 60)}"`
  );

  // ONLY flag as gibberish when BOTH signals agree,
  // OR when character corruption is extreme (>50%) regardless of language
  if (langBad && charsBad) return true;
  if (invalidRatio > 0.5) return true;

  return false;
}
