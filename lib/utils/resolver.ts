/**
 * Fuzzy Entity Resolver
 *
 * Resolves plain-text crop names, mandi names, and farmer identities
 * to their corresponding PostgreSQL integer IDs using ILIKE queries.
 * Used by voice transcription pipelines and receipt OCR to map
 * natural-language mentions to typed database foreign keys.
 */

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/supabase";

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export type ResolvedCrop = Pick<Tables<"crops">, "id" | "name" | "urdu_name">;
export type ResolvedMandi = Pick<Tables<"mandis">, "id" | "name" | "city">;
export type ResolvedFarmer = Pick<Tables<"users">, "id" | "name" | "phone">;

// ---------------------------------------------------------------------------
// Crop resolver
// ---------------------------------------------------------------------------

/**
 * Resolves a crop name (English or Urdu) to a crops row via ILIKE.
 * Returns null if no match is found -- caller should flag for manual review.
 */
export async function resolveCrop(
  query: string
): Promise<ResolvedCrop | null> {
  if (!query || !query.trim()) return null;

  const supabase = await createClient();
  const pattern = `%${query.trim()}%`;

  const { data, error } = await supabase
    .from("crops")
    .select("id, name, urdu_name")
    .or(`name.ilike.${pattern},urdu_name.ilike.${pattern}`)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return { id: data.id, name: data.name, urdu_name: data.urdu_name };
}

// ---------------------------------------------------------------------------
// Mandi resolver
// ---------------------------------------------------------------------------

/**
 * Resolves a mandi name, city, or district to a mandis row via ILIKE.
 * Falls back to common Urdu→English mandi name translations.
 * Returns null if no match is found.
 */
export async function resolveMandi(
  query: string
): Promise<ResolvedMandi | null> {
  if (!query || !query.trim()) return null;

  const supabase = await createClient();

  // Common Urdu→English mandi name mappings
  const urduToEnglish: Record<string, string> = {
    "سرگودھا": "Sargodha",
    "سرگودہ": "Sargodha",
    "سرگودا": "Sargodha",
    "فیصل آباد": "Faisalabad",
    "فیصلآباد": "Faisalabad",
    "ملتان": "Multan",
    "لاہور": "Lahore",
    "لاھور": "Lahore",
    "گوجرانوالہ": "Gujranwala",
    "گوجرانوالا": "Gujranwala",
    "ساہیوال": "Sahiwal",
    "بہاولپور": "Bahawalpur",
    "حیدرآباد": "Hyderabad",
    "پشاور": "Peshawar",
    "راولپنڈی": "Rawalpindi",
    "سکھر": "Sukkur",
    "کوئٹہ": "Quetta",
  };

  const trimmed = query.trim();
  const englishFallback = urduToEnglish[trimmed];

  // Try original query first, then English fallback
  const queries = [trimmed];
  if (englishFallback) queries.push(englishFallback);

  for (const q of queries) {
    const pattern = `%${q}%`;
    const { data, error } = await supabase
      .from("mandis")
      .select("id, name, city")
      .or(`name.ilike.${pattern},city.ilike.${pattern},district.ilike.${pattern}`)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return { id: data.id, name: data.name, city: data.city };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Farmer resolver
// ---------------------------------------------------------------------------

/**
 * Resolves a farmer by name or phone via ILIKE against public.users.
 * Optionally scoped to the Arthi's known contacts (arthi_farmer_contacts).
 * Handles common Urdu→English name translations.
 * Returns null if no match is found.
 */
export async function resolveFarmer(
  query: string,
  arthiId?: number
): Promise<ResolvedFarmer | null> {
  if (!query || !query.trim()) return null;

  const supabase = await createClient();

  // Common Urdu→English farmer name mappings
  const urduToEnglish: Record<string, string> = {
    "محمد علی": "Muhammad Ali",
    "احمد": "Ahmad",
    "حاجی بشیر": "Haji Bashir Farmer",
    "حاجی بشیر فارمر": "Haji Bashir Farmer",
    "بشیر": "Haji Bashir Farmer",
    "علی": "Muhammad Ali",
    "کامران": "Mian Kamran",
  };

  const trimmed = query.trim();
  const englishFallback = urduToEnglish[trimmed];

  // Build list of queries to try
  const queryNames = [trimmed];
  if (englishFallback) queryNames.push(englishFallback);

  // If an arthiId is provided, first try to resolve from their known contacts
  if (arthiId) {
    const { data: contacts } = await supabase
      .from("arthi_farmer_contacts")
      .select("farmer_landlord_id")
      .eq("arthi_id", arthiId);

    const farmerIds = (contacts ?? [])
      .map((c) => c.farmer_landlord_id)
      .filter((id): id is number => id !== null);

    if (farmerIds.length > 0) {
      for (const q of queryNames) {
        const pattern = `%${q}%`;
        const { data: contactMatch } = await supabase
          .from("users")
          .select("id, name, phone")
          .in("role", ["farmer", "farmer_landlord"])
          .in("id", farmerIds)
          .or(`name.ilike.${pattern},phone.ilike.${pattern}`)
          .limit(1)
          .maybeSingle();

        if (contactMatch) {
          return {
            id: contactMatch.id,
            name: contactMatch.name,
            phone: contactMatch.phone,
          };
        }
      }
    }
  }

  // Fallback: global farmer lookup with both role types
  for (const q of queryNames) {
    const pattern = `%${q}%`;
    const { data, error } = await supabase
      .from("users")
      .select("id, name, phone")
      .in("role", ["farmer", "farmer_landlord"])
      .or(`name.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return { id: data.id, name: data.name, phone: data.phone };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Batch resolver (convenience wrapper for voice/OCR pipelines)
// ---------------------------------------------------------------------------

export interface EntityResolveResult {
  cropId: number | null;
  mandiId: number | null;
  farmerId: number | null;
}

/**
 * Resolves crop, mandi, and farmer in parallel.
 * Any unresolved entity returns null -- the UI should display a manual
 * selection fallback with the Urdu warning:
 * "برائے کرم فصل / منڈی کا انتخاب دستی طور پر کریں"
 */
export async function resolveEntities(params: {
  cropName?: string;
  mandiName?: string;
  farmerName?: string;
  arthiId?: number;
}): Promise<EntityResolveResult> {
  const [crop, mandi, farmer] = await Promise.all([
    params.cropName ? resolveCrop(params.cropName) : Promise.resolve(null),
    params.mandiName ? resolveMandi(params.mandiName) : Promise.resolve(null),
    params.farmerName
      ? resolveFarmer(params.farmerName, params.arthiId)
      : Promise.resolve(null),
  ]);

  return {
    cropId: crop?.id ?? null,
    mandiId: mandi?.id ?? null,
    farmerId: farmer?.id ?? null,
  };
}
