/**
 * Gemini 2.5 Flash Multimodal Vision & JSON Extraction Service
 *
 * Uses the @google/genai SDK with gemini-2.5-flash for:
 *   1. Receipt image OCR -- extracting financial fields from handwritten market slips
 *   2. Voice transcription structuring -- parsing Groq transcription text into
 *      typed entities for mandi rates, arrivals, and settlement pre-fill
 *
 * All extraction functions return typed interfaces that feed directly into
 * the entity resolver (lib/utils/resolver.ts) and the Munshi calculator
 * (lib/utils/calculator.ts).
 */

import { GoogleGenAI, Type } from "@google/genai";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = "gemini-3.6-flash";

// ---------------------------------------------------------------------------
// Client singleton (lazy init)
// ---------------------------------------------------------------------------

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY environment variable is not set. " +
          "Add it to .env.local to enable Gemini AI services."
      );
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Shared extraction types
// ---------------------------------------------------------------------------

/** A single bidder line item extracted from the purchase list */
export interface ExtractedBidder {
  bidderName: string | null;
  gattuCount: number | null;
  cost: number | null;
}

/** Structured fields extracted from a receipt/purchase-list image by Gemini Vision */
export interface ReceiptExtraction {
  /** Raw OCR text from the receipt */
  ocrRawText: string;
  /** Kacchi bikri (raw sale amount) — sum of all bidder costs */
  kacchiBikri: number | null;
  /** Number of gattu (large containers) */
  gattuCount: number | null;
  /** Number of peti (small containers) */
  petiCount: number | null;
  /** Gaadi rent (transport cost) */
  gaadiRent: number | null;
  /** Crop name mentioned on the receipt (for resolver) */
  cropName: string | null;
  /** Mandi name mentioned on the receipt (for resolver) */
  mandiName: string | null;
  /** Farmer name mentioned on the receipt (for resolver) */
  farmerName: string | null;
  /** Individual bidder line items from the purchase list */
  bidders: ExtractedBidder[];
}

/** Structured fields from a mandi-rate voice transcription */
export interface MandiRateExtraction {
  cropName: string | null;
  mandiName: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
}

/** Structured fields from an auction-arrival voice transcription */
export interface ArrivalExtraction {
  cropName: string | null;
  farmerName: string | null;
  gattuCount: number | null;
  petiCount: number | null;
}

/** Structured fields from a settlement-audio voice transcription */
export interface SettlementAudioExtraction {
  kacchiBikri: number | null;
  gaadiRent: number | null;
  farmerName: string | null;
  cropName: string | null;
  gattuCount: number | null;
  petiCount: number | null;
}

// ---------------------------------------------------------------------------
// Internal: safe JSON parse helper
// ---------------------------------------------------------------------------

function safeJsonParse<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    // Gemini may wrap JSON in markdown code fences
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/, "")
      .replace(/\s*```$/, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    console.error("[Gemini] JSON parse failed for:", raw.slice(0, 200));
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Receipt Image OCR (Vision)
// ---------------------------------------------------------------------------

const RECEIPT_SYSTEM_PROMPT = `You are an OCR specialist for handwritten Pakistani agricultural market receipts (mandi parchis).
This is a PURCHASE LIST showing multiple bidders (khareedar) who bought crop at auction.
Extract every bidder line item: their name, how many gattu they bought, and the total cost they paid.
Also extract the overall totals and any expenses mentioned (gaadi rent, etc.).
All monetary values are in Pakistani Rupees. Names may be in Urdu or English.
Return ONLY valid JSON, no explanation. If a field is not found, use null.

Fields:
- ocrRawText: the full text visible on the receipt
- bidders: array of { bidderName, gattuCount, cost } for each purchaser line item
- kacchiBikri: TOTAL raw sale amount (sum of all bidder costs). If not written explicitly, calculate it from bidder costs.
- gattuCount: TOTAL number of gattu/large containers (sum across all bidders)
- petiCount: number of peti/small containers (integer)
- gaadiRent: transport/vehicle cost (number)
- cropName: name of the crop mentioned (string)
- mandiName: name of the mandi/market (string)
- farmerName: name of the farmer (string, the one who brought the crop, NOT the bidders)`;

const RECEIPT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    ocrRawText: { type: Type.STRING, description: "Full visible text" },
    bidders: {
      type: Type.ARRAY,
      description: "Individual bidder/purchaser line items",
      items: {
        type: Type.OBJECT,
        properties: {
          bidderName: { type: Type.STRING, description: "Bidder/purchaser name", nullable: true },
          gattuCount: { type: Type.INTEGER, description: "Number of gattu bought by this bidder", nullable: true },
          cost: { type: Type.NUMBER, description: "Total cost this bidder paid in PKR", nullable: true },
        },
      },
    },
    kacchiBikri: { type: Type.NUMBER, description: "Total raw sale amount in PKR (sum of bidder costs)", nullable: true },
    gattuCount: { type: Type.INTEGER, description: "Total gattu containers", nullable: true },
    petiCount: { type: Type.INTEGER, description: "Number of peti containers", nullable: true },
    gaadiRent: { type: Type.NUMBER, description: "Transport cost in PKR", nullable: true },
    cropName: { type: Type.STRING, description: "Crop name in Urdu or English", nullable: true },
    mandiName: { type: Type.STRING, description: "Mandi/market name", nullable: true },
    farmerName: { type: Type.STRING, description: "Farmer name (who brought the crop)", nullable: true },
  },
  required: ["ocrRawText"],
};

/**
 * Processes a receipt image through Gemini Vision to extract structured
 * financial fields and raw OCR text.
 *
 * @param imageBase64 - Base64-encoded image bytes (no data URI prefix).
 * @param mimeType - Image MIME type, e.g. "image/jpeg", "image/png".
 * @returns ReceiptExtraction with typed fields, or null on failure.
 */
export async function extractReceiptFields(
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<ReceiptExtraction | null> {
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: {
        role: "user",
        parts: [
          {
            inlineData: {
              data: imageBase64,
              mimeType,
            },
          },
          {
            text: "Extract all fields from this mandi receipt image.",
          },
        ],
      },
      config: {
        systemInstruction: RECEIPT_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: RECEIPT_SCHEMA,
      },
    });

    const parsed = safeJsonParse<ReceiptExtraction>(response.text);
    if (!parsed) return null;

    return {
      ocrRawText: parsed.ocrRawText ?? "",
      kacchiBikri: parsed.kacchiBikri ?? null,
      gattuCount: parsed.gattuCount ?? null,
      petiCount: parsed.petiCount ?? null,
      gaadiRent: parsed.gaadiRent ?? null,
      cropName: parsed.cropName ?? null,
      mandiName: parsed.mandiName ?? null,
      farmerName: parsed.farmerName ?? null,
      bidders: (parsed.bidders ?? []).map(b => ({
        bidderName: b.bidderName ?? null,
        gattuCount: b.gattuCount ?? null,
        cost: b.cost ?? null,
      })),
    };
  } catch (err) {
    console.error("[Gemini] Receipt extraction error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. Voice Transcription Structuring -- Mandi Rates (Type 1)
// ---------------------------------------------------------------------------

const MANDI_RATE_SYSTEM_PROMPT = `You are a data extraction assistant for Pakistani mandi (agricultural market) voice notes.
The user provides a transcription of an Arthi speaking about current market rates.
Extract crop name, mandi name, and price data. All prices are in PKR per unit.
Return ONLY valid JSON. Use null for any field not found.`;

const MANDI_RATE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cropName: { type: Type.STRING, description: "Crop name (Urdu or English)", nullable: true },
    mandiName: { type: Type.STRING, description: "Mandi/market name", nullable: true },
    minPrice: { type: Type.NUMBER, description: "Minimum price in PKR", nullable: true },
    maxPrice: { type: Type.NUMBER, description: "Maximum price in PKR", nullable: true },
    avgPrice: { type: Type.NUMBER, description: "Average price in PKR", nullable: true },
  },
};

/**
 * Parses a voice transcription into structured mandi rate data.
 * The extracted cropName and mandiName can be fed into
 * resolveCrop() and resolveMandi() from the entity resolver.
 */
export async function parseMandiRateTranscription(
  transcriptionText: string
): Promise<MandiRateExtraction | null> {
  if (!transcriptionText?.trim()) return null;

  try {
    console.log("[Gemini] parseMandiRateTranscription input:", transcriptionText.slice(0, 200));
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: transcriptionText,
      config: {
        systemInstruction: MANDI_RATE_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: MANDI_RATE_SCHEMA,
      },
    });

    console.log("[Gemini] parseMandiRateTranscription raw response:", response.text?.slice(0, 300));
    const parsed = safeJsonParse<MandiRateExtraction>(response.text);
    console.log("[Gemini] parseMandiRateTranscription parsed:", parsed);
    if (!parsed) return null;

    return {
      cropName: parsed.cropName ?? null,
      mandiName: parsed.mandiName ?? null,
      minPrice: parsed.minPrice ?? null,
      maxPrice: parsed.maxPrice ?? null,
      avgPrice: parsed.avgPrice ?? null,
    };
  } catch (err) {
    console.error("[Gemini] Mandi rate parsing error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Voice Transcription Structuring -- Auction Arrivals (Type 2)
// ---------------------------------------------------------------------------

const ARRIVAL_SYSTEM_PROMPT = `You are a data extraction assistant for Pakistani mandi (agricultural market) voice notes.
The user provides a transcription of an Arthi recording an upcoming crop arrival.
Extract crop name, farmer name, and container counts.
Return ONLY valid JSON. Use null for any field not found.`;

const ARRIVAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cropName: { type: Type.STRING, description: "Crop name (Urdu or English)", nullable: true },
    farmerName: { type: Type.STRING, description: "Farmer name (Urdu or English)", nullable: true },
    gattuCount: { type: Type.INTEGER, description: "Number of gattu/large containers", nullable: true },
    petiCount: { type: Type.INTEGER, description: "Number of peti/small containers", nullable: true },
  },
};

/**
 * Parses a voice transcription into structured arrival data.
 * The extracted cropName and farmerName can be fed into
 * resolveCrop() and resolveFarmer() from the entity resolver.
 */
export async function parseArrivalTranscription(
  transcriptionText: string
): Promise<ArrivalExtraction | null> {
  if (!transcriptionText?.trim()) return null;

  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: transcriptionText,
      config: {
        systemInstruction: ARRIVAL_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: ARRIVAL_SCHEMA,
      },
    });

    const parsed = safeJsonParse<ArrivalExtraction>(response.text);
    if (!parsed) return null;

    return {
      cropName: parsed.cropName ?? null,
      farmerName: parsed.farmerName ?? null,
      gattuCount: parsed.gattuCount ?? null,
      petiCount: parsed.petiCount ?? null,
    };
  } catch (err) {
    console.error("[Gemini] Arrival parsing error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. Voice Transcription Structuring -- Settlement Audio (Type 3)
// ---------------------------------------------------------------------------

const SETTLEMENT_AUDIO_SYSTEM_PROMPT = `You are a data extraction assistant for Pakistani mandi (agricultural market) voice notes.
The user provides a transcription of an Arthi recording settlement/receipt information.
Extract financial amounts and entity names mentioned.
Return ONLY valid JSON. Use null for any field not found.`;

const SETTLEMENT_AUDIO_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    kacchiBikri: { type: Type.NUMBER, description: "Raw sale amount in PKR", nullable: true },
    gaadiRent: { type: Type.NUMBER, description: "Transport cost in PKR", nullable: true },
    farmerName: { type: Type.STRING, description: "Farmer name", nullable: true },
    cropName: { type: Type.STRING, description: "Crop name (Urdu or English)", nullable: true },
    gattuCount: { type: Type.INTEGER, description: "Number of gattu/large containers", nullable: true },
    petiCount: { type: Type.INTEGER, description: "Number of peti/small containers", nullable: true },
  },
};

/**
 * Parses a settlement voice note transcription into pre-fill fields
 * for the editable review card.
 */
export async function parseSettlementAudioTranscription(
  transcriptionText: string
): Promise<SettlementAudioExtraction | null> {
  if (!transcriptionText?.trim()) return null;

  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: transcriptionText,
      config: {
        systemInstruction: SETTLEMENT_AUDIO_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: SETTLEMENT_AUDIO_SCHEMA,
      },
    });

    const parsed = safeJsonParse<SettlementAudioExtraction>(response.text);
    if (!parsed) return null;

    return {
      kacchiBikri: parsed.kacchiBikri ?? null,
      gaadiRent: parsed.gaadiRent ?? null,
      farmerName: parsed.farmerName ?? null,
      cropName: parsed.cropName ?? null,
      gattuCount: parsed.gattuCount ?? null,
      petiCount: parsed.petiCount ?? null,
    };
  } catch (err) {
    console.error("[Gemini] Settlement audio parsing error:", err);
    return null;
  }
}
