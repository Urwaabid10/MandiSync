"use server";

/**
 * Server action to analyze a receipt/purchase-list image using Gemini Vision.
 * Extracts bidder line items, kacchi bikri, and other fields from handwritten mandi parchis.
 */

import { createClient } from "@/lib/supabase/server";
import { extractReceiptFields } from "@/lib/services/gemini";
import type { ReceiptExtraction } from "@/lib/services/gemini";

export interface ReceiptAnalysisResult {
  success: boolean;
  extraction: ReceiptExtraction | null;
  error?: string;
}

/**
 * Analyzes a receipt image and returns structured extraction.
 * Called from the receipts tab when arthi uploads a handwritten purchase list.
 *
 * @param imageBase64 - Base64-encoded image bytes (no data URI prefix)
 * @param mimeType    - Image MIME type (e.g. "image/jpeg")
 */
export async function analyzeReceiptImage(
  imageBase64: string,
  mimeType: string = "image/jpeg"
): Promise<ReceiptAnalysisResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, extraction: null, error: "Not authenticated" };
  }

  try {
    const extraction = await extractReceiptFields(imageBase64, mimeType);
    if (!extraction) {
      return { success: false, extraction: null, error: "تصویر سے ڈیٹا نہیں نکلا — دوبارہ کوشش کریں" };
    }
    return { success: true, extraction };
  } catch (err) {
    console.error("[analyzeReceiptImage] error:", err);
    return {
      success: false,
      extraction: null,
      error: err instanceof Error ? err.message : "تجزیے میں خرابی",
    };
  }
}
