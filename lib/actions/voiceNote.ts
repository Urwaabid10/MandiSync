"use server";

/**
 * Server action for Arthi voice note pipeline:
 *   Audio blob → Groq Whisper transcription → Gemini entity parsing
 *
 * Returns structured data that the client can preview before saving.
 */

import { createClient } from "@/lib/supabase/server";
import { transcribeToText, GIBBERISH_MESSAGE } from "@/lib/services/groq";
import { resolveEntities } from "@/lib/utils/resolver";
import {
  parseMandiRateTranscription,
  parseArrivalTranscription,
  parseSettlementAudioTranscription,
} from "@/lib/services/gemini";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VoiceType = "mandi_rate" | "auction_arrival" | "settlement_audio";

export interface VoiceNoteResult {
  success: boolean;
  transcribedText: string | null;
  /** Structured fields extracted from the transcription */
  entities: Record<string, unknown>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ---------------------------------------------------------------------------
// Public server action
// ---------------------------------------------------------------------------

/**
 * Transcribes an audio voice note and parses entities based on voice type.
 *
 * @param audioBase64 - Base64-encoded audio (from browser MediaRecorder).
 * @param mimeType    - MIME type (default "audio/webm").
 * @param voiceType   - Which Gemini parser to use.
 */
export async function processVoiceNote(
  audioBase64: string,
  mimeType: string = "audio/webm",
  voiceType: VoiceType = "mandi_rate"
): Promise<VoiceNoteResult> {
  const user = await requireAuth();
  if (!user) {
    return { success: false, transcribedText: null, entities: {}, error: "Not authenticated" };
  }

  // Step 1: Groq Whisper transcription
  const text = await transcribeToText(audioBase64, mimeType);
  if (!text) {
    return {
      success: false,
      transcribedText: null,
      entities: {},
      error: "آواز کی شناخت نہیں ہو سکی",
    };
  }

  // Detect gibberish fallback — do NOT send corrupted text to Gemini
  if (text === GIBBERISH_MESSAGE) {
    return {
      success: false,
      transcribedText: null,
      entities: {},
      error: GIBBERISH_MESSAGE,
    };
  }

  // Step 2: Gemini entity parsing based on voice type
  let entities: Record<string, unknown> = {};

  try {
    switch (voiceType) {
      case "mandi_rate": {
        const result = await parseMandiRateTranscription(text);
        console.log("[processVN] mandi_rate parse result:", result);
        entities = result
          ? {
              cropName: result.cropName,
              mandiName: result.mandiName,
              minPrice: result.minPrice,
              maxPrice: result.maxPrice,
              avgPrice: result.avgPrice,
            }
          : {};
        console.log("[processVN] mandi_rate entities:", entities);
        break;
      }
      case "auction_arrival": {
        const result = await parseArrivalTranscription(text);
        entities = result
          ? {
              cropName: result.cropName,
              farmerName: result.farmerName,
              gattuCount: result.gattuCount,
              petiCount: result.petiCount,
            }
          : {};
        break;
      }
      case "settlement_audio": {
        const result = await parseSettlementAudioTranscription(text);
        entities = result
          ? {
              kacchiBikri: result.kacchiBikri,
              gaadiRent: result.gaadiRent,
              farmerName: result.farmerName,
              cropName: result.cropName,
              gattuCount: result.gattuCount,
              petiCount: result.petiCount,
            }
          : {};
        break;
      }
    }
  } catch (err) {
    console.error("[voiceNote] Gemini parse error:", err);
    // Still return the transcription even if parsing fails
  }

  return { success: true, transcribedText: text, entities };
}

// ---------------------------------------------------------------------------
// Confirm & Save — write structured records after preview
// ---------------------------------------------------------------------------

export interface ConfirmResult {
  success: boolean;
  message: string;
  table?: string;
}

/**
 * Called by the "تصدیق اور محفوظ کریں" button. Resolves entity names
 * to database IDs and inserts structured records so the Farmer Dashboard
 * picks them up immediately.
 */
export async function confirmVoiceNote(
  arthiId: number,
  voiceType: VoiceType,
  entities: Record<string, unknown>,
  voiceUpdateId: number | null
): Promise<ConfirmResult> {
  console.log("[confirmVN] called with:", { arthiId, voiceType, entities, voiceUpdateId });
  const user = await requireAuth();
  if (!user) {
    console.error("[confirmVN] Not authenticated");
    return { success: false, message: "Not authenticated" };
  }
  console.log("[confirmVN] authenticated user:", user.id);

  const supabase = await createClient();
  const e = entities;

  try {
    switch (voiceType) {
      case "mandi_rate": {
        console.log("[confirmVN] mandi_rate: resolving entities...", e.cropName, e.mandiName);
        const resolved = await resolveEntities({
          cropName: (e.cropName as string) ?? undefined,
          mandiName: (e.mandiName as string) ?? undefined,
        });
        console.log("[confirmVN] mandi_rate resolved:", resolved);
        const price =
          (e.avgPrice as number) ?? (e.maxPrice as number) ?? (e.minPrice as number);
        console.log("[confirmVN] mandi_rate price:", price, "cropId:", resolved.cropId, "mandiId:", resolved.mandiId);
        if (!resolved.cropId || !price) {
          console.error("[confirmVN] mandi_rate: missing cropId or price", { cropId: resolved.cropId, price, entities: e });
          return { success: false, message: "فصل یا قیمت نہیں ملی — واضح بولیں" };
        }
        const { error: priceErr } = await supabase.from("mandi_prices").insert({
          arthi_id: arthiId,
          crop_id: resolved.cropId,
          mandi_id: resolved.mandiId ?? null,
          price,
          recorded_at: new Date().toISOString(),
          source_voice_update_id: voiceUpdateId,
        });
        if (priceErr) {
          console.error("[confirmVN] mandi_prices insert error:", priceErr.message);
          return { success: false, message: `نرخ محفوظ نہیں ہوا: ${priceErr.message}` };
        }
        console.log("[confirmVN] mandi_prices inserted successfully (price=%d, crop=%d, mandi=%d)", price, resolved.cropId, resolved.mandiId);
        return { success: true, message: `نرخ محفوظ ہو گئے (₨${price.toLocaleString()})`, table: "mandi_prices" };
      }
      case "auction_arrival": {
        console.log("[confirmVN] auction_arrival: resolving entities...", e.cropName, e.farmerName);
        const resolved = await resolveEntities({
          cropName: (e.cropName as string) ?? undefined,
          farmerName: (e.farmerName as string) ?? undefined,
          arthiId,
        });
        console.log("[confirmVN] auction_arrival resolved:", resolved);
        const { error: arrivalErr } = await supabase.from("crop_arrivals").insert({
          arthi_id: arthiId,
          crop_id: resolved.cropId,
          farmer_landlord_id: resolved.farmerId,
          gattu_count: (e.gattuCount as number) ?? null,
          peti_count: (e.petiCount as number) ?? null,
          arrival_date: new Date().toISOString().split("T")[0],
          status: "pending",
        });
        if (arrivalErr) {
          console.error("[confirmVN] crop_arrivals insert error:", arrivalErr.message);
          return { success: false, message: `آمد محفوظ نہیں ہوئی: ${arrivalErr.message}` };
        }
        console.log("[confirmVN] crop_arrivals inserted successfully");
        return { success: true, message: "آمد محفوظ ہو گئی", table: "crop_arrivals" };
      }
      case "settlement_audio": {
        // Settlements are now created from the receipts tab (bidder list flow).
        // Voice note is kept as a transcription-only record.
        console.log("[confirmVN] settlement_audio: skipping — use receipts tab for settlements");
        return { success: true, message: "وائس نوٹ محفوظ — سیٹلمنٹ بنانے کے لیے پرچی ٹیب استعمال کریں", table: "voice_updates" };
      }
    }
  } catch (err) {
    console.error("[confirmVoiceNote]", err);
    return { success: false, message: "محفوظ کرنے میں خرابی" };
  }

  return { success: false, message: "نامعلوم وائس قسم" };
}
