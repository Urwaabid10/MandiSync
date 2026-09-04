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

// Agricultural domain prompt — guides Whisper toward Pakistani mandi vocabulary
const URDU_WHISPER_PROMPT =
  "گندم, کپاس, چاول, مکئی, گنا, منڈی, فیصل آباد, سدھو منڈی, نیو سدھار منڈی, " +
  "فی من, روپیہ, نرخ, ریٹ, آرتھی, بوڑا, مزارع, کسان, گٹو, پیٹی, بولی, نقد, " +
  "سیٹلمنٹ, بکری, آمد, پرچی, wheat, cotton, rice, maund, 40 kg, mandi, rate";

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
      if (gibberish) {
        console.warn(
          `[Groq] Gibberish detected (attempt ${attempt}/${MAX_ATTEMPTS}, ` +
          `lang=${result.language}): "${cleaned.slice(0, 80)}"`
        );
        if (attempt < MAX_ATTEMPTS) continue; // retry once
        // Both attempts failed → return friendly Urdu message
        return GIBBERISH_MESSAGE;
      }

      return cleaned;
    } catch (err) {
      console.error(`[Groq] Transcription error (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
      if (attempt >= MAX_ATTEMPTS) return null;
    }
  }

  return null;
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
function isGibberish(text: string, detectedLang?: string): boolean {
  // 1. Language check — flag clearly wrong languages
  const KNOWN_LANGS = new Set(["ur", "en", "hi", "pa", "ps", "sd", "ar", "fa"]);
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
