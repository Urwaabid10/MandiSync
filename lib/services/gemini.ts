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

/**
 * Wraps a Gemini generateContent call with retry logic for transient errors (503, 429).
 * Retries up to 2 times with exponential backoff (1s, 2s).
 */
async function callGeminiWithRetry(
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0]
): Promise<Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>> {
  const MAX_RETRIES = 2;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      const ai = getClient();
      return await ai.models.generateContent(params);
    } catch (err: unknown) {
      const isTransient =
        err instanceof Error &&
        (err.message.includes("503") ||
          err.message.includes("UNAVAILABLE") ||
          err.message.includes("429") ||
          err.message.includes("RESOURCE_EXHAUSTED"));
      if (!isTransient || attempt > MAX_RETRIES) throw err;
      const delayMs = attempt * 1000; // 1s, 2s
      console.warn(`[Gemini] Transient error (attempt ${attempt}/${MAX_RETRIES + 1}), retrying in ${delayMs}ms...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // Unreachable, but TS needs a return
  throw new Error("Gemini retry exhausted");
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
  /** Single/current price when user mentions just one price */
  currentPrice: number | null;
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
    const response = await callGeminiWithRetry({
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

CRITICAL: Prices are often spoken as Urdu/Hindi number words. You MUST convert them to Arabic numeral integers.
Examples:
- "آٹھ سو" = 800
- "بارہ سو" = 1200
- "ایک ہزار" = 1000
- "پانچ سو پچاس" = 550
- "دو ہزار" = 2000
- "تین ہزار پانچ سو" = 3500
- "چار سو" = 400
- "نو سو" = 900
- "دس ہزار" = 10000
- "پچاس ہزار" = 50000

If only one price is mentioned, put it in currentPrice.
If a range is mentioned (X سے Y), put the lower in minPrice and higher in maxPrice.
If اوسط (average) is mentioned, put it in avgPrice.

Return ONLY valid JSON. Use null for any field not found.`;

const MANDI_RATE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    cropName: { type: Type.STRING, description: "Crop name (Urdu or English)", nullable: true },
    mandiName: { type: Type.STRING, description: "Mandi/market name (Urdu or English)", nullable: true },
    minPrice: { type: Type.NUMBER, description: "Minimum price as integer in PKR (e.g. 800 not آٹھ سو)", nullable: true },
    maxPrice: { type: Type.NUMBER, description: "Maximum price as integer in PKR (e.g. 1200 not بارہ سو)", nullable: true },
    avgPrice: { type: Type.NUMBER, description: "Average price as integer in PKR (e.g. 1000 not ایک ہزار)", nullable: true },
    currentPrice: { type: Type.NUMBER, description: "Single/current price as integer in PKR when only one price is mentioned", nullable: true },
  },
};

// ---------------------------------------------------------------------------
// Urdu number word → digit converter (fallback for when Gemini fails)
// ---------------------------------------------------------------------------

const URDU_DIGIT_MAP: Record<string, number> = {
  "صفر": 0, "ایک": 1, "دو": 2, "تین": 3, "چار": 4, "پانچ": 5,
  "چھ": 6, "سات": 7, "آٹھ": 8, "نو": 9, "دس": 10,
  "گیارہ": 11, "بارہ": 12, "تیرہ": 13, "چودہ": 14, "پندرہ": 15,
  "سولہ": 16, "سترہ": 17, "اٹھارہ": 18, "انیس": 19, "بیس": 20,
  "پچیس": 25, "تیس": 30, "پینتیس": 35, "چالیس": 40, "پینتالیس": 45,
  "پچاس": 50, "ساٹھ": 60, "ستر": 70, "اسی": 80, "نوی": 90, "سو": 100,
};

const URDU_MULTIPLIER_MAP: Record<string, number> = {
  "سو": 100, "ہزار": 1000, "لاکھ": 100000, "کروڑ": 10000000,
};

/**
 * Attempts to convert Urdu number words in a text segment to a numeric value.
 * Only processes contiguous number words — stops at the first non-number word.
 * E.g., "آٹھ سو" → 800, "بارہ سو" → 1200, "ایک ہزار" → 1000, "پانچ سو پچاس" → 550
 */
function urduWordsToNumber(text: string): number | null {
  const words = text.replace(/[،,.!?؟]/g, "").split(/\s+/).filter(Boolean);
  let total = 0;
  let current = 0;
  let matched = false;

  for (const word of words) {
    if (URDU_MULTIPLIER_MAP[word] !== undefined) {
      const multiplier = URDU_MULTIPLIER_MAP[word];
      total += (current > 0 ? current : 1) * multiplier;
      current = 0;
      matched = true;
    } else if (URDU_DIGIT_MAP[word] !== undefined) {
      current = current + URDU_DIGIT_MAP[word];
      matched = true;
    } else {
      // Also try Eastern Arabic numerals: ۰۱۲۳۴۵۶۷۸۹
      const easternDigits = word.replace(/[۰-۹]/g, d =>
        String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))
      );
      if (/^\d+$/.test(easternDigits) && easternDigits !== word) {
        current = parseInt(easternDigits, 10);
        matched = true;
      } else {
        // Non-number word — stop accumulating
        break;
      }
    }
  }

  total += current;
  return matched && total > 0 ? total : null;
}

/**
 * Extract number words from the END of a text segment (scanning right-to-left).
 * E.g., "...کی قیمت آٹھ سو" → extracts "آٹھ سو" → 800
 */
function extractNumberFromEnd(text: string): number | null {
  const words = text.replace(/[،,.!?؟]/g, "").split(/\s+/).filter(Boolean);
  // Walk backwards collecting number words
  const numWords: string[] = [];
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (URDU_DIGIT_MAP[w] !== undefined || URDU_MULTIPLIER_MAP[w] !== undefined) {
      numWords.unshift(w);
    } else {
      // Check Eastern Arabic numerals
      const easternDigits = w.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
      if (/^\d+$/.test(easternDigits) && easternDigits !== w) {
        numWords.unshift(w);
      } else {
        break; // non-number word, stop
      }
    }
  }
  return numWords.length > 0 ? urduWordsToNumber(numWords.join(" ")) : null;
}

/**
 * Extract number words from the START of a text segment.
 * E.g., "بارہ سو روپے فی گٹو..." → extracts "بارہ سو" → 1200
 */
function extractNumberFromStart(text: string): number | null {
  const words = text.replace(/[،,.!?؟]/g, "").split(/\s+/).filter(Boolean);
  const numWords: string[] = [];
  for (const w of words) {
    if (URDU_DIGIT_MAP[w] !== undefined || URDU_MULTIPLIER_MAP[w] !== undefined) {
      numWords.push(w);
    } else {
      const easternDigits = w.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
      if (/^\d+$/.test(easternDigits) && easternDigits !== w) {
        numWords.push(w);
      } else {
        break;
      }
    }
  }
  return numWords.length > 0 ? urduWordsToNumber(numWords.join(" ")) : null;
}

/**
 * Fallback: extract prices from Urdu transcription text using regex patterns.
 * Used when Gemini returns null prices.
 */
function extractPricesFromText(text: string): {
  minPrice: number | null;
  maxPrice: number | null;
  avgPrice: number | null;
  currentPrice: number | null;
} {
  const result = { minPrice: null as number | null, maxPrice: null as number | null, avgPrice: null as number | null, currentPrice: null as number | null };

  // Pattern: "X سے Y" (range: X to Y)
  // Split on "سے" and extract number from end of left part and start of right part
  const rangeIdx = text.indexOf(" سے ");
  if (rangeIdx > 0) {
    const leftPart = text.slice(0, rangeIdx);
    const rightPart = text.slice(rangeIdx + 4); // skip " سے "
    const low = extractNumberFromEnd(leftPart);
    const high = extractNumberFromStart(rightPart);
    console.log("[Fallback] Range: leftPart ends with =>", low, ", rightPart starts with =>", high);
    if (low && high) {
      result.minPrice = Math.min(low, high);
      result.maxPrice = Math.max(low, high);
    }
  }

  // Pattern: "اوسط ... NUMBER روپے" (average)
  const avgIdx = text.indexOf("اوسط");
  if (avgIdx >= 0) {
    const afterAvg = text.slice(avgIdx);
    // Find the sentence end or "روپے"
    const sentenceEnd = afterAvg.indexOf("۔");
    const avgText = sentenceEnd > 0 ? afterAvg.slice(0, sentenceEnd) : afterAvg;
    // Skip "اوسط" and "قیمت" words, then extract number
    const cleaned = avgText.replace(/^اوسط\s*/, "").replace(/^قیمت\s*/, "");
    result.avgPrice = extractNumberFromStart(cleaned);
    console.log("[Fallback] Avg segment:", JSON.stringify(cleaned), "=>", result.avgPrice);
  }

  // Pattern: single price "قیمت NUMBER روپے"
  if (!result.minPrice && !result.maxPrice) {
    const priceIdx = text.indexOf("قیمت");
    if (priceIdx >= 0) {
      const afterPrice = text.slice(priceIdx + 5); // skip "قیمت "
      result.currentPrice = extractNumberFromStart(afterPrice);
      console.log("[Fallback] Single price:", result.currentPrice);
    }
  }

  return result;
}

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
    const response = await callGeminiWithRetry({
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

    // If Gemini returned null prices, try the Urdu fallback extractor
    const hasGeminiPrice = parsed.minPrice || parsed.maxPrice || parsed.avgPrice || parsed.currentPrice;
    let fallback: { minPrice: number | null; maxPrice: number | null; avgPrice: number | null; currentPrice: number | null } = { minPrice: null, maxPrice: null, avgPrice: null, currentPrice: null };
    if (!hasGeminiPrice) {
      console.log("[Gemini] No prices from Gemini — running Urdu fallback extractor on:", transcriptionText.slice(0, 300));
      fallback = extractPricesFromText(transcriptionText);
      console.log("[Gemini] Fallback extracted:", fallback);
    }

    return {
      cropName: parsed.cropName ?? null,
      mandiName: parsed.mandiName ?? null,
      minPrice: parsed.minPrice ?? fallback.minPrice,
      maxPrice: parsed.maxPrice ?? fallback.maxPrice,
      avgPrice: parsed.avgPrice ?? fallback.avgPrice,
      currentPrice: parsed.currentPrice ?? fallback.currentPrice,
    };
  } catch (err) {
    console.error("[Gemini] Mandi rate parsing error:", err);
    // Last resort: try fallback even on Gemini error
    const fallback = extractPricesFromText(transcriptionText);
    if (fallback.minPrice || fallback.maxPrice || fallback.avgPrice || fallback.currentPrice) {
      console.log("[Gemini] Fallback rescued after error:", fallback);
      return {
        cropName: null, mandiName: null,
        minPrice: fallback.minPrice, maxPrice: fallback.maxPrice,
        avgPrice: fallback.avgPrice, currentPrice: fallback.currentPrice,
      };
    }
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
    const response = await callGeminiWithRetry({
      model: MODEL,
      contents: transcriptionText,
      config: {
        systemInstruction: ARRIVAL_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: ARRIVAL_SCHEMA,
      },
    });

    console.log("[Gemini] parseArrivalTranscription raw response:", response.text?.slice(0, 300));
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
    const response = await callGeminiWithRetry({
      model: MODEL,
      contents: transcriptionText,
      config: {
        systemInstruction: SETTLEMENT_AUDIO_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: SETTLEMENT_AUDIO_SCHEMA,
      },
    });

    console.log("[Gemini] parseSettlementAudioTranscription raw response:", response.text?.slice(0, 300));
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
