"use client";

import { useState, useEffect, useRef, useCallback, type FormEvent, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Tables, Json } from "@/types/supabase";
import { computeSettlement, computeMonthlyExpense } from "@/lib/utils/calculator";
import {
  Mic, Calendar, FileText, Building, LogOut, User, Phone, Store,
  CheckCircle, Upload, TrendingUp, X, Save, Trash2, Loader2,
  MessageSquare, Volume2, ToggleLeft, ToggleRight, MapPin, Settings,
  Receipt as ReceiptIcon,
} from "lucide-react";
import ChatDrawer from "@/components/chat/ChatDrawer";
import { processVoiceNote, confirmVoiceNote } from "@/lib/actions/voiceNote";
import type { VoiceNoteResult } from "@/lib/actions/voiceNote";
import { analyzeReceiptImage } from "@/lib/actions/receipt";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type VoiceType = "mandi_rate" | "auction_arrival";
type ArrivalRow = Tables<"crop_arrivals">;

interface FarmerContact {
  id: number;
  name: string | null;
  phone: string | null;
}

interface ArrivalView extends ArrivalRow {
  cropName?: string | null;
  farmerName?: string | null;
}

interface CropOption {
  id: number;
  name: string;
  urdu_name: string | null;
}

interface SettlementSummary {
  id: number;
  farmer_landlord_id: number | null;
  crop_id: number | null;
  kacchi_bikri: number | null;
  pakhta_bikri: number | null;
  labor_fee: number | null;
  gross_commission: number | null;
  market_fee: number | null;
  net_arthi_commission: number | null;
  gaadi_rent: number | null;
  hospitality_cost: number | null;
  gattu_count: number | null;
  peti_count: number | null;
  settlement_date: string | null;
  farmerName: string | null;
  cropName: string | null;
  bidders: BidderItem[];
}

interface BidderItem {
  bidderName: string;
  gattuCount: number;
  cost: number;
}

// ---------------------------------------------------------------------------
// Shared Styles
// ---------------------------------------------------------------------------

const c = {
  primary: "#006633", primaryDark: "#004d26", accent: "#D4AF37",
  bg: "#f4f7f5", white: "#fff", text: "#1a1a1a", muted: "#555",
  border: "#dde3df", error: "#cc0000",
};

const s: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: c.bg },
  header: {
    background: `linear-gradient(135deg, ${c.primaryDark} 0%, ${c.primary} 100%)`,
    color: c.white, padding: "1rem 1.5rem",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  headerTitle: { fontSize: "1.25rem", fontWeight: 700 },
  headerSub: { fontSize: "0.8rem", opacity: 0.85, marginTop: 2 },
  logoutBtn: {
    background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
    color: c.white, padding: "0.4rem 0.85rem", borderRadius: 8,
    display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem",
  },
  tabs: {
    display: "flex", gap: 0, background: c.white, borderBottom: `2px solid ${c.accent}`,
    padding: "0 1rem", overflowX: "auto",
  },
  tab: {
    padding: "0.75rem 1.25rem", fontSize: "0.85rem", fontWeight: 600,
    border: "none", background: "none", color: c.muted, cursor: "pointer",
    borderBottom: "3px solid transparent", whiteSpace: "nowrap",
  },
  tabActive: {
    padding: "0.75rem 1.25rem", fontSize: "0.85rem", fontWeight: 700,
    border: "none", background: "none", color: c.primary, cursor: "pointer",
    borderBottom: `3px solid ${c.primary}`, whiteSpace: "nowrap",
  },
  content: { maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1rem" },
  card: {
    background: c.white, borderRadius: 12, padding: "1.25rem 1.5rem",
    border: `1.5px solid ${c.accent}`, boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
    marginBottom: "1rem",
  },
  sectionTitle: {
    fontSize: "1rem", fontWeight: 700, color: c.primary,
    marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 8,
  },
  grid: { display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" },
  label: { display: "block", fontSize: "0.8rem", fontWeight: 600, color: "#333", marginBottom: "0.3rem" },
  input: {
    width: "100%", padding: "0.55rem 0.75rem", border: `1.5px solid ${c.border}`,
    borderRadius: 8, fontSize: "0.9rem", outline: "none",
  },
  btnPrimary: {
    padding: "0.55rem 1.25rem", background: c.primary, color: c.white,
    border: "none", borderRadius: 8, fontWeight: 600, fontSize: "0.85rem",
    display: "inline-flex", alignItems: "center", gap: 6,
  },
  btnOutline: {
    padding: "0.45rem 1rem", background: c.white, color: c.primary,
    border: `1.5px solid ${c.primary}`, borderRadius: 8, fontWeight: 600,
    fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: 4,
  },
  btnDanger: {
    padding: "0.45rem 1rem", background: "#fff0f0", color: c.error,
    border: `1.5px solid ${c.error}`, borderRadius: 8, fontWeight: 600,
    fontSize: "0.8rem",
  },
  badge: {
    display: "inline-block", fontSize: "0.7rem", fontWeight: 600,
    padding: "2px 8px", borderRadius: 12,
  },
  modal: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, padding: "1rem",
  },
  modalCard: {
    background: c.white, borderRadius: 16, padding: "1.5rem",
    maxWidth: 520, width: "100%", maxHeight: "85vh", overflowY: "auto",
    border: `2px solid ${c.accent}`,
  },
  row: { display: "flex", justifyContent: "space-between", padding: "0.45rem 0", borderBottom: "1px solid #eee", fontSize: "0.85rem" },
  empty: { textAlign: "center", color: "#999", padding: "2rem", fontSize: "0.9rem" },
  recordBtn: {
    width: 64, height: 64, borderRadius: "50%", border: "none",
    display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", transition: "all 0.2s",
  },
  voiceTypeBtn: {
    padding: "0.5rem 1rem", borderRadius: 8, fontSize: "0.8rem",
    fontWeight: 600, cursor: "pointer", border: `1.5px solid ${c.border}`,
    background: c.white, color: c.muted,
  },
  voiceTypeActive: {
    padding: "0.5rem 1rem", borderRadius: 8, fontSize: "0.8rem",
    fontWeight: 600, cursor: "pointer", border: `1.5px solid ${c.primary}`,
    background: c.primary, color: c.white,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  try { return new Date(iso).toLocaleDateString("ur-PK", { day: "numeric", month: "short" }); }
  catch { return iso; }
}

function fmtCurrency(n: number | null): string {
  return `Rs. ${(n ?? 0).toLocaleString("en-PK")}`;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ArthiDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<"voice" | "vn_history" | "arrivals" | "receipts" | "ledger" | "chat" | "profile">("voice");
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [arthiId, setArthiId] = useState<number | null>(null);

  // Profile state
  const [shopName, setShopName] = useState("");
  const [shopNumber, setShopNumber] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopCity, setShopCity] = useState("");
  const [profileStatus, setProfileStatus] = useState("");

  // Voice state
  const [voiceType, setVoiceType] = useState<VoiceType>("mandi_rate");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [vnResult, setVnResult] = useState<VoiceNoteResult | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Arrivals state
  const [arrivals, setArrivals] = useState<ArrivalView[]>([]);
  const [farmers, setFarmers] = useState<FarmerContact[]>([]);

  // Auction notice modal
  const [auctionArrival, setAuctionArrival] = useState<ArrivalView | null>(null);
  const [auctionDate, setAuctionDate] = useState("");
  const [auctionTime, setAuctionTime] = useState("");
  const [auctionMsg, setAuctionMsg] = useState("");

  // Receipt state
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState("");
  const [receiptId, setReceiptId] = useState<number | null>(null);

  // Extracted bidders from Gemini analysis (read-only)
  const [bidders, setBidders] = useState<BidderItem[]>([]);
  const [extractedKacchiBikri, setExtractedKacchiBikri] = useState<number>(0);
  const [extractedGattu, setExtractedGattu] = useState<number>(0);
  const [analysisDone, setAnalysisDone] = useState(false);

  // Settlement form fields
  const [setlFarmerId, setSetlFarmerId] = useState<number | null>(null);
  const [setlCropId, setSetlCropId] = useState<number | null>(null);
  const [setlGaadiRent, setSetlGaadiRent] = useState<number>(0);
  const [setlHospitality, setSetlHospitality] = useState<number>(0);

  // Crops & Settlements for receipts tab
  const [crops, setCrops] = useState<CropOption[]>([]);
  const [settlements, setSettlements] = useState<SettlementSummary[]>([]);
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementSummary | null>(null);
  const [settlementStatus, setSettlementStatus] = useState("");

  // Computed totals from extracted bidders
  const kacchiBikri = extractedKacchiBikri || bidders.reduce((sum, b) => sum + b.cost, 0);
  const totalGattu = extractedGattu || bidders.reduce((sum, b) => sum + b.gattuCount, 0);

  // Ledger state
  const [ledgerMonth, setLedgerMonth] = useState(new Date().toISOString().slice(0, 7));
  const [shopRent, setShopRent] = useState<number | null>(null);
  const [elecBill, setElecBill] = useState<number | null>(null);
  const [munshiSalary, setMunshiSalary] = useState<number | null>(null);
  const [otherAllow, setOtherAllow] = useState<number | null>(null);
  const [ledgerStatus, setLedgerStatus] = useState("");

  // Voice note history state
  interface VNHistoryItem {
    id: number;
    voice_type: string | null;
    transcribed_text: string | null;
    audio_url: string | null;
    entities: Record<string, unknown> | null;
    status: string | null;
    created_at: string | null;
  }
  const [vnHistory, setVnHistory] = useState<VNHistoryItem[]>([]);
  const [confirmingVN, setConfirmingVN] = useState<number | null>(null);

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatRecipientId, setChatRecipientId] = useState<number | null>(null);
  const [chatRecipientName, setChatRecipientName] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Data Loading
  // -----------------------------------------------------------------------
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      console.log("[LoadData] auth user:", user?.id, user?.email);
      if (!user) { router.push("/auth/login"); return; }

      const { data: profile, error: profileErr } = await supabase
        .from("users").select("id, name, shop_name, shop_number, shop_address, shop_city").eq("auth_id", user.id).maybeSingle();
      console.log("[LoadData] profile query result:", { profile, profileErr });
      if (!profile) {
        console.error("[LoadData] No profile found for auth_id:", user.id, "Error:", profileErr?.message);
        setLoading(false);
        return;
      }
      console.log("[LoadData] setting arthiId to:", profile.id);
      setUserName(profile.name ?? "");
      setShopName(profile.shop_name ?? "");
      setShopNumber(profile.shop_number ?? "");
      setShopAddress(profile.shop_address ?? "");
      setShopCity(profile.shop_city ?? "");
      setArthiId(profile.id);

      // Load arrivals, all farmers, voice note history, current month expenses, crops, and settlements
      const currentMonth = new Date().toISOString().slice(0, 7);
      const [arrRes, farmerRes, vnRes, expRes, cropsRes, settlRes] = await Promise.all([
        supabase.from("crop_arrivals")
          .select("*, crops(name, urdu_name), users:farmer_landlord_id(name)")
          .eq("arthi_id", profile.id)
          .order("arrival_date", { ascending: false }).limit(50),
        supabase.from("users")
          .select("id, name, phone")
          .in("role", ["farmer", "farmer_landlord"])
          .order("name"),
        supabase.from("arthi_voice_updates")
          .select("id, voice_type, transcribed_text, audio_url, entities, status, created_at")
          .eq("arthi_id", profile.id)
          .order("created_at", { ascending: false }).limit(30),
        supabase.from("shop_monthly_expenses")
          .select("*")
          .eq("arthi_id", profile.id)
          .eq("month_year", currentMonth)
          .maybeSingle(),
        supabase.from("crops")
          .select("id, name, urdu_name")
          .order("name"),
        supabase.from("settlements")
          .select("*, users:farmer_landlord_id(name), crops(name, urdu_name), settlement_bidders(bidder_name, gattu_count, cost)")
          .eq("arthi_id", profile.id)
          .order("settlement_date", { ascending: false }).limit(30),
      ]);

      // Set all farmers directly from the users query
      const allFarmers = (farmerRes.data ?? []) as { id: number; name: string | null; phone: string | null }[];
      setFarmers(allFarmers);

      // Set crops for dropdown
      setCrops((cropsRes.data ?? []) as CropOption[]);

      // Set settlements list
      const rawSettlements = (settlRes.data ?? []) as Array<{
        id: number; farmer_landlord_id: number | null; crop_id: number | null;
        kacchi_bikri: number | null; pakhta_bikri: number | null; labor_fee: number | null;
        gross_commission: number | null; market_fee: number | null; net_arthi_commission: number | null;
        gaadi_rent: number | null; hospitality_cost: number | null; gattu_count: number | null; peti_count: number | null;
        settlement_date: string | null;
        users?: { name?: string } | null; crops?: { name?: string; urdu_name?: string } | null;
        settlement_bidders?: Array<{ bidder_name?: string | null; gattu_count?: number | null; cost?: number | null }>;
      }>;
      setSettlements(rawSettlements.map(st => ({
        id: st.id,
        farmer_landlord_id: st.farmer_landlord_id,
        crop_id: st.crop_id,
        kacchi_bikri: st.kacchi_bikri,
        pakhta_bikri: st.pakhta_bikri,
        labor_fee: st.labor_fee,
        gross_commission: st.gross_commission,
        market_fee: st.market_fee,
        net_arthi_commission: st.net_arthi_commission,
        gaadi_rent: st.gaadi_rent,
        hospitality_cost: st.hospitality_cost,
        gattu_count: st.gattu_count,
        peti_count: st.peti_count,
        settlement_date: st.settlement_date,
        farmerName: st.users?.name ?? null,
        cropName: st.crops?.urdu_name ?? st.crops?.name ?? null,
        bidders: (st.settlement_bidders ?? []).map(b => ({
          bidderName: b.bidder_name ?? "نامعلوم",
          gattuCount: b.gattu_count ?? 0,
          cost: b.cost ?? 0,
        })),
      })));

      setArrivals((arrRes.data ?? []).map(a => {
        const crop = a.crops as unknown as { name?: string; urdu_name?: string } | null;
        const farmer = a.users as unknown as { name?: string } | null;
        return { ...a, cropName: crop?.urdu_name ?? crop?.name, farmerName: farmer?.name };
      }));

      // Voice note history
      setVnHistory((vnRes.data ?? []).map(v => ({
        id: v.id,
        voice_type: v.voice_type,
        transcribed_text: v.transcribed_text,
        audio_url: v.audio_url,
        entities: v.entities as Record<string, unknown> | null,
        status: v.status,
        created_at: v.created_at,
      })));

      // Pre-fill monthly expenses form from saved data
      if (expRes.data) {
        const exp = expRes.data;
        setLedgerMonth(exp.month_year ?? currentMonth);
        setShopRent(exp.shop_rent != null ? Number(exp.shop_rent) : null);
        setElecBill(exp.electricity_bill != null ? Number(exp.electricity_bill) : null);
        setMunshiSalary(exp.munshi_salary != null ? Number(exp.munshi_salary) : null);
        setOtherAllow(exp.munshi_daily_allowance != null ? Number(exp.munshi_daily_allowance) : null);
      }
    } catch (err) {
      console.error("[Arthi] Load error:", err);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleLogout() {
    const supabase = createClient();
    try {
      await supabase.auth.signOut();
    } catch {
      // If server-side signOut fails, manually clear auth cookies
      document.cookie.split(";").forEach(c => {
        if (c.trim().startsWith("sb-") || c.trim().startsWith("sb_")) {
          document.cookie = c.replace(/^ *([^=]+)/, "$1=expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/");
        }
      });
    }
    window.location.href = "/auth/login";
  }

  // -----------------------------------------------------------------------
  // Profile Save
  // -----------------------------------------------------------------------
  async function saveProfile() {
    if (!arthiId) return;
    setProfileStatus("محفوظ ہو رہا ہے...");
    const supabase = createClient();
    const { error } = await supabase.from("users").update({
      shop_name: shopName || null,
      shop_number: shopNumber || null,
      shop_address: shopAddress || null,
      shop_city: shopCity || null,
    }).eq("id", arthiId);
    setProfileStatus(error ? `خرابی: ${error.message}` : "✓ کامیابی سے محفوظ ہو گیا");
  }

  // -----------------------------------------------------------------------
  // Voice Recorder — Save / Transcribe / Discard flow
  // -----------------------------------------------------------------------
  async function startRecording() {
    setVoiceBlob(null);
    setVnResult(null);
    setVoiceStatus("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(t => t.stop());
        console.log(`[Arthi] Recording stopped: ${blob.size} bytes, ${chunksRef.current.length} chunks`);
        if (blob.size < 1000) {
          setVoiceStatus("آواز بہت مختصر ہے۔ دوبارہ ریکارڈ کریں");
          return;
        }
        setVoiceBlob(blob);
      };
      // Timeslice of 100ms ensures chunks flush at regular intervals
      mr.start(100);
      mediaRef.current = mr;
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch (err) {
      console.error("[Arthi] Microphone access error:", err);
      setVoiceStatus("مائیکروفون تک رسائی نہیں ملی");
    }
  }

  function stopRecording() {
    mediaRef.current?.stop();
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function handleTranscribeVN() {
    if (!voiceBlob) return;

    // Pre-flight: ensure blob has actual audio data
    if (voiceBlob.size === 0) {
      setVoiceStatus("ریکارڈنگ خالی ہے۔ براہ کرم دوبارہ ریکارڈ کریں");
      return;
    }

    console.log(
      `[Arthi] Transcribing: ${voiceBlob.size} bytes, type=${voiceBlob.type}`
    );

    setTranscribing(true);
    setVoiceStatus("");
    try {
      const ab = await voiceBlob.arrayBuffer();
      const bytes = new Uint8Array(ab);
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      const result = await processVoiceNote(base64, voiceBlob.type || "audio/webm", voiceType);
      setVnResult(result);
      if (!result.success) {
        console.error("[Arthi] Transcription failed:", result.error);
        setVoiceStatus(result.error ?? "خرابی");
      }
    } catch (err) {
      console.error("Groq Transcription Error:", err);
      setVoiceStatus("ٹرانسکرپشن ناکام — براہ کرم دوبارہ کوشش کریں");
    } finally {
      setTranscribing(false);
    }
  }

  function handleDiscardVN() {
    setVoiceBlob(null);
    setVnResult(null);
    setVoiceStatus("");
    setTranscribing(false);
  }

  async function saveTranscribedVN() {
    console.log("[SaveBTN] clicked — arthiId:", arthiId, "vnResult:", vnResult);
    if (!arthiId) {
      console.error("[SaveBTN] arthiId is null — cannot save");
      setToast({ msg: "آرتھی آئی ڈی نہیں ملی — صفحہ ریفریش کریں", ok: false });
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setVoiceStatus("محفوظ ہو رہا ہے...");
    try {
      const supabase = createClient();
      let audioUrl: string | null = null;

      // ── Step 1: Upload audio to storage (optional — don't block on failure) ──
      if (voiceBlob) {
        const fileName = `voice_${Date.now()}.webm`;
        const { error: uploadErr } = await supabase.storage
          .from("voice-notes").upload(fileName, voiceBlob, {
            contentType: "audio/webm",
            upsert: false,
          });
        if (uploadErr) {
          console.warn("[Arthi] Storage upload failed (non-fatal):", uploadErr.message);
          // Continue saving data even without audio file
        } else {
          const { data: urlData } = supabase.storage
            .from("voice-notes").getPublicUrl(fileName);
          audioUrl = urlData.publicUrl;
        }
      }

      // ── Step 2: Insert voice update record ──
      console.log("[SaveBTN] Step 2: Inserting arthi_voice_updates, arthiId=", arthiId);
      const { data: voiceUpdate, error: insertErr } = await supabase
        .from("arthi_voice_updates").insert({
          arthi_id: arthiId,
          audio_url: audioUrl,
          status: "completed",
          transcribed_text: vnResult?.transcribedText ?? null,
          voice_type: voiceType,
          entities: (vnResult?.entities ?? null) as Json | null,
        }).select("id").maybeSingle();
      console.log("[SaveBTN] voiceUpdate insert result:", { voiceUpdate, insertErr });

      if (insertErr) {
        console.error("[Arthi] Voice update insert failed:", insertErr.message);
        setVoiceStatus(`وائس نوٹ محفوظ نہیں ہوا: ${insertErr.message}`);
        setVnResult(null); // reset preview so user can retry
        return;
      }

      // ── Step 3: Write structured records (mandi_prices / arrivals / settlements) ──
      // Filter out null-valued entities — only proceed if at least one non-null value exists
      const rawEntities = vnResult?.entities ?? {};
      const nonNullEntities = Object.fromEntries(
        Object.entries(rawEntities).filter(([, v]) => v != null)
      );
      console.log("[SaveBTN] Step 3: rawEntities=", rawEntities, "nonNullEntities=", nonNullEntities);
      if (Object.keys(nonNullEntities).length > 0) {
        console.log("[SaveBTN] Calling confirmVoiceNote with:", { arthiId, voiceType, entities: nonNullEntities, voiceUpdateId: voiceUpdate?.id });
        const confirmResult = await confirmVoiceNote(
          arthiId,
          voiceType,
          nonNullEntities,
          voiceUpdate?.id ?? null
        );
        console.log("[SaveBTN] confirmVoiceNote result:", confirmResult);

        if (!confirmResult.success) {
          setVoiceStatus(`⚠ ${confirmResult.message}`);
          setToast({ msg: confirmResult.message, ok: false });
          setTimeout(() => setToast(null), 5000);
        } else {
          setToast({
            msg: `✓ ${confirmResult.message} — ${confirmResult.table ?? ""} میں محفوظ`,
            ok: true,
          });
          setTimeout(() => setToast(null), 5000);
        }
      } else {
        // No meaningful entities extracted — just save the voice record
        console.warn("[SaveBTN] No non-null entities — skipping mandi_prices/arrivals/settlements insert");
        setToast({
          msg: "وائس نوٹ محفوظ ہو گیا (نرخ / آمد نکال نہیں سکی — واضح بولیں)",
          ok: false,
        });
        setTimeout(() => setToast(null), 5000);
      }

      // ── Always reset preview state so user can record again ──
      setVoiceBlob(null);
      setVnResult(null);
      setVoiceStatus("");
    } catch (err) {
      console.error("[Arthi] saveTranscribedVN error:", err);
      setVoiceStatus("محفوظ کرنے میں خرابی — براہ کرم دوبارہ کوشش کریں");
      // Reset preview so user is NOT stuck
      setVoiceBlob(null);
      setVnResult(null);
    }
  }

  // -----------------------------------------------------------------------
  // Arrivals — Confirm toggle
  // -----------------------------------------------------------------------
  async function confirmArrival(arrivalId: number) {
    const supabase = createClient();
    await supabase.from("crop_arrivals")
      .update({ status: "confirmed" }).eq("id", arrivalId);
    setArrivals(prev => prev.map(a =>
      a.id === arrivalId ? { ...a, status: "confirmed" } : a
    ));
  }

  // Auction notice creation
  async function submitAuctionNotice(e: FormEvent) {
    e.preventDefault();
    if (!auctionArrival || !arthiId || !auctionDate || !auctionTime) return;
    const supabase = createClient();
    await supabase.from("auction_notices").insert({
      arrival_id: auctionArrival.id,
      arthi_id: arthiId,
      crop_id: auctionArrival.crop_id,
      mandi_id: null,
      auction_date: auctionDate,
      auction_time: auctionTime,
      message: auctionMsg || null,
    });
    setAuctionArrival(null);
    setAuctionDate(""); setAuctionTime(""); setAuctionMsg("");
  }

  // -----------------------------------------------------------------------
  // Receipt Image Upload + Gemini Analysis + Settlement Creation
  // -----------------------------------------------------------------------

  async function handleReceiptAnalyze() {
    if (!receiptFile || !arthiId) {
      setReceiptError("براہ کرم پہلے پرچی کی تصویر منتخب کریں");
      return;
    }
    setReceiptLoading(true);
    setReceiptError("");
    setAnalysisDone(false);
    setBidders([]);
    setExtractedKacchiBikri(0);
    setExtractedGattu(0);

    try {
      // 1. Convert file to base64
      const buffer = await receiptFile.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      // 2. Analyze with Gemini
      const result = await analyzeReceiptImage(base64, receiptFile.type || "image/jpeg");
      if (!result.success || !result.extraction) {
        setReceiptError(result.error ?? "تجزیہ ناکام");
        setReceiptLoading(false);
        return;
      }

      const ext = result.extraction;

      // 3. Populate extracted bidders
      if (ext.bidders.length > 0) {
        setBidders(ext.bidders.map(b => ({
          bidderName: b.bidderName ?? "نامعلوم",
          gattuCount: b.gattuCount ?? 0,
          cost: b.cost ?? 0,
        })));
      }
      setExtractedKacchiBikri(ext.kacchiBikri ?? 0);
      setExtractedGattu(ext.gattuCount ?? 0);

      // 4. Auto-fill gaadi rent if extracted
      if (ext.gaadiRent && ext.gaadiRent > 0) {
        setSetlGaadiRent(ext.gaadiRent);
      }

      // 5. Upload to storage + insert receipt record
      const fileName = `receipt_${Date.now()}.${receiptFile.name.split(".").pop()}`;
      const supabase = createClient();
      const { error: uploadErr } = await supabase.storage
        .from("receipts").upload(fileName, receiptFile, { contentType: receiptFile.type });
      if (uploadErr) { console.warn("[Receipt] storage upload failed:", uploadErr.message); }
      const { data: { publicUrl } } = supabase.storage.from("receipts").getPublicUrl(fileName);
      const { data: receipt, error: insertErr } = await supabase.from("receipts").insert({
        arthi_id: arthiId, image_url: publicUrl,
      }).select().single();
      if (insertErr) { console.warn("[Receipt] DB insert failed:", insertErr.message); }
      if (receipt) setReceiptId(receipt.id);

      setAnalysisDone(true);
    } catch (err) {
      setReceiptError(`تجزیے میں خرابی: ${err instanceof Error ? err.message : "نامعلوم"}`);
    } finally {
      setReceiptLoading(false);
    }
  }

  async function uploadReceiptOnly(): Promise<number | null> {
    if (!receiptFile || !arthiId) return receiptId;
    try {
      const supabase = createClient();
      const fileName = `receipt_${Date.now()}.${receiptFile.name.split(".").pop()}`;
      const { error } = await supabase.storage
        .from("receipts").upload(fileName, receiptFile, { contentType: receiptFile.type });
      if (error) return null;
      const { data: { publicUrl } } = supabase.storage.from("receipts").getPublicUrl(fileName);
      const { data: receipt, error: insertErr } = await supabase.from("receipts").insert({
        arthi_id: arthiId, image_url: publicUrl,
      }).select().single();
      if (insertErr || !receipt) return null;
      setReceiptId(receipt.id);
      return receipt.id;
    } catch { return null; }
  }

  async function confirmSettlement() {
    if (!arthiId) return;
    if (!setlFarmerId) { setSettlementStatus("⚠ براہ کرم کسان منتخب کریں"); return; }
    if (!analysisDone || kacchiBikri <= 0) { setSettlementStatus("⚠ پہلے پرچی کی تصویر اپ لوڈ اور تجزیہ کریں"); return; }
    setSettlementStatus("محفوظ ہو رہا ہے...");

    const totalG = totalGattu;
    const result = computeSettlement({
      kacchi_bikri: kacchiBikri,
      gattu_count: totalG,
      peti_count: 0,
      gaadi_rent: setlGaadiRent,
      hospitality_cost: setlHospitality,
    });

    const supabase = createClient();
    const { data: settlement, error } = await supabase.from("settlements").insert({
      arthi_id: arthiId,
      farmer_landlord_id: setlFarmerId,
      receipt_id: receiptId,
      crop_id: setlCropId,
      kacchi_bikri: result.kacchi_bikri,
      pakhta_bikri: result.pakhta_bikri,
      labor_fee: result.labor_fee,
      gross_commission: result.gross_commission,
      market_fee: result.market_fee,
      net_arthi_commission: result.net_commission,
      hospitality_cost: result.hospitality_cost,
      gattu_count: totalG,
      peti_count: 0,
      gaadi_rent: setlGaadiRent,
      settlement_date: new Date().toISOString().split("T")[0],
    }).select().single();

    if (error || !settlement) {
      setSettlementStatus(`خرابی: ${error?.message ?? "سیٹلمنٹ محفوظ نہیں ہوا"}`);
      return;
    }

    // Save extracted bidder items
    if (bidders.length > 0) {
      await supabase.from("settlement_bidders").insert(
        bidders.map(b => ({
          settlement_id: settlement.id,
          bidder_name: b.bidderName,
          gattu_count: b.gattuCount,
          cost: b.cost,
        }))
      );
    }

    // Create invoice
    await supabase.from("invoices").insert({
      invoice_number: `INV-${settlement.id}-${Date.now()}`,
      invoice_type: "farmer_settlement",
      settlement_id: settlement.id,
      arthi_id: arthiId,
      farmer_landlord_id: setlFarmerId,
    });

    setSettlementStatus(`✓ سیٹلمنٹ #${settlement.id} محفوظ — کچّی: Rs. ${kacchiBikri.toLocaleString()} | پختہ: Rs. ${result.pakhta_bikri.toLocaleString()}`);
    // Reset form
    setBidders([]); setExtractedKacchiBikri(0); setExtractedGattu(0); setAnalysisDone(false);
    setSetlFarmerId(null); setSetlCropId(null);
    setSetlGaadiRent(0); setSetlHospitality(0);
    setReceiptFile(null); setReceiptId(null); setReceiptError("");

    // Reload settlements list
    const { data: freshSettl } = await supabase.from("settlements")
      .select("*, users:farmer_landlord_id(name), crops(name, urdu_name), settlement_bidders(bidder_name, gattu_count, cost)")
      .eq("arthi_id", arthiId)
      .order("settlement_date", { ascending: false }).limit(30);
    if (freshSettl) {
      const raw = freshSettl as Array<{
        id: number; farmer_landlord_id: number | null; crop_id: number | null;
        kacchi_bikri: number | null; pakhta_bikri: number | null; labor_fee: number | null;
        gross_commission: number | null; market_fee: number | null; net_arthi_commission: number | null;
        gaadi_rent: number | null; hospitality_cost: number | null; gattu_count: number | null; peti_count: number | null;
        settlement_date: string | null;
        users?: { name?: string } | null; crops?: { name?: string; urdu_name?: string } | null;
        settlement_bidders?: Array<{ bidder_name?: string | null; gattu_count?: number | null; cost?: number | null }>;
      }>;
      setSettlements(raw.map(st => ({
        id: st.id, farmer_landlord_id: st.farmer_landlord_id, crop_id: st.crop_id,
        kacchi_bikri: st.kacchi_bikri, pakhta_bikri: st.pakhta_bikri,
        labor_fee: st.labor_fee, gross_commission: st.gross_commission,
        market_fee: st.market_fee, net_arthi_commission: st.net_arthi_commission,
        gaadi_rent: st.gaadi_rent, hospitality_cost: st.hospitality_cost,
        gattu_count: st.gattu_count, peti_count: st.peti_count,
        settlement_date: st.settlement_date,
        farmerName: st.users?.name ?? null, cropName: st.crops?.urdu_name ?? st.crops?.name ?? null,
        bidders: (st.settlement_bidders ?? []).map(b => ({
          bidderName: b.bidder_name ?? "نامعلوم", gattuCount: b.gattu_count ?? 0, cost: b.cost ?? 0,
        })),
      })));
    }
  }

  // -----------------------------------------------------------------------
  // Monthly Expense
  // -----------------------------------------------------------------------
  async function submitExpense(e: FormEvent) {
    e.preventDefault();
    if (!arthiId) return;
    setLedgerStatus("محفوظ ہو رہا ہے...");
    const rent = shopRent ?? 0;
    const elec = elecBill ?? 0;
    const munshi = munshiSalary ?? 0;
    const other = otherAllow ?? 0;
    const total = computeMonthlyExpense({
      rent_amount: rent, electricity_bill: elec,
      munshi_salary: munshi, other_allowances: other,
    });

    const supabase = createClient();
    const { error } = await supabase.from("shop_monthly_expenses").upsert(
      {
        arthi_id: arthiId, month_year: ledgerMonth,
        shop_rent: rent, electricity_bill: elec,
        munshi_salary: munshi, munshi_daily_allowance: other,
        total_monthly_expense: total,
      },
      { onConflict: "arthi_id,month_year" }
    );
    setLedgerStatus(error ? `خرابی: ${error.message}` : `✓ کل Rs. ${total.toLocaleString()} کامیابی سے محفوظ ہو گیا`);
  }

  // -----------------------------------------------------------------------
  // Voice Note Confirm Toggle
  // -----------------------------------------------------------------------
  async function handleConfirmVN(vnId: number) {
    if (!arthiId) return;
    const vn = vnHistory.find(v => v.id === vnId);
    if (!vn) return;

    // If it's an auction_arrival type, open the auction notice modal
    if (vn.voice_type === "auction_arrival") {
      // Find the linked crop_arrival if any
      const entities = vn.entities ?? {};
      const arrivalId = entities.cropArrivalId as number | null;
      if (arrivalId) {
        const arrival = arrivals.find(a => a.id === arrivalId);
        if (arrival) {
          setAuctionArrival(arrival);
          return;
        }
      }
      // If no linked arrival, open a generic auction modal
      setToast({ msg: "آمد کا ریکارڈ نہیں ملا — دستی طور پر نیلامی بنائیں", ok: false });
      return;
    }

    // For mandi_rate and settlement_audio: call confirmVoiceNote
    setConfirmingVN(vnId);
    try {
      const entities = vn.entities ?? {};
      // Filter out null entities
      const filtered: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(entities)) {
        if (val != null) filtered[k] = val;
      }

      const result = await confirmVoiceNote(
        arthiId,
        (vn.voice_type ?? "mandi_rate") as VoiceType,
        filtered,
        vnId,
      );
      if (result.success) {
        setToast({ msg: `✓ ${result.message}`, ok: true });
        // Update local status
        setVnHistory(prev => prev.map(v => v.id === vnId ? { ...v, status: "confirmed" } : v));
      } else {
        setToast({ msg: result.message ?? "تصدیق ناکام ہوئی", ok: false });
      }
    } catch (err) {
      setToast({ msg: "تصدیق میں خرابی پیش آئی", ok: false });
    } finally {
      setConfirmingVN(null);
    }
  }

  // -----------------------------------------------------------------------
  // Chat: open conversation with a farmer
  // -----------------------------------------------------------------------
  function openChatWithFarmer(farmerId: number, farmerName: string | null) {
    setChatRecipientId(farmerId);
    setChatRecipientName(farmerName);
    setChatOpen(true);
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: c.muted }}>لوڈ ہو رہا ہے...</p>
      </div>
    );
  }

  const tabs: { key: typeof tab; label: string; icon: React.ReactNode }[] = [
    { key: "voice", label: "وائس ریکارڈر", icon: <Mic size={15} /> },
    { key: "vn_history", label: "وائس نوٹس", icon: <Volume2 size={15} /> },
    { key: "arrivals", label: "آمد اور نیلامی", icon: <Calendar size={15} /> },
    { key: "receipts", label: "پرچی / سیٹلمنٹ", icon: <FileText size={15} /> },
    { key: "ledger", label: "ماہانہ اخراجات", icon: <Building size={15} /> },
    { key: "chat", label: "پیغام", icon: <MessageSquare size={15} /> },
    { key: "profile", label: "پروفائل", icon: <Settings size={15} /> },
  ];

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <div>
          <div style={s.headerTitle}>MandiSync — آرتھی ڈیش بورڈ</div>
          <div style={s.headerSub}>
            <User size={14} style={{ display: "inline", verticalAlign: "middle" }} /> {userName || "آرتھی"}
          </div>
        </div>
        <button onClick={handleLogout} style={s.logoutBtn}>
          <LogOut size={16} /> لاگ آؤٹ
        </button>
      </header>

      {/* Tabs */}
      <div style={s.tabs}>
        {tabs.map(t => (
          <button key={t.key} style={tab === t.key ? s.tabActive : s.tab}
            onClick={() => setTab(t.key)}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={s.content}>
        {/* ============================================================ */}
        {/* VOICE RECORDER TAB                                           */}
        {/* ============================================================ */}
        {tab === "voice" && (
          <div style={s.card}>
            <div style={s.sectionTitle}><Mic size={18} /> وائس نوٹ ریکارڈر</div>

            {/* Voice type selector */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
              {([
                ["mandi_rate", "منڈی کے نرخ"],
                ["auction_arrival", "آمد کا نوٹ"],
              ] as [VoiceType, string][]).map(([key, label]) => (
                <button key={key}
                  style={voiceType === key ? s.voiceTypeActive : s.voiceTypeBtn}
                  onClick={() => setVoiceType(key)}>
                  {label}
                </button>
              ))}
            </div>

            {/* Sample format hints for each voice type */}
            <div style={{
              background: "#f0f7f4", border: "1px solid #c8e6c9", borderRadius: 10,
              padding: "0.85rem 1rem", marginBottom: "1.25rem", fontSize: "0.83rem", lineHeight: 1.7,
            }}>
              {voiceType === "mandi_rate" && (
                <div>
                  <div style={{ fontWeight: 700, color: c.primary, marginBottom: "0.4rem", fontSize: "0.88rem" }}>
                    💡 منڈی نرخ — بولنے کا نمونہ:
                  </div>
                  <div style={{ color: c.text, fontStyle: "italic", borderInlineStart: `3px solid ${c.accent}`, paddingInlineStart: "0.75rem" }}>
                    "آج سرگودہا منڈی میں کینو کی قیمت آٹھ سو سے بارہ سو روپے فی گٹو ہے۔ اوسط قیمت ایک ہزار روپے ہے۔"
                  </div>
                  <div style={{ color: c.muted, marginTop: "0.5rem" }}>
                    واضح بولیں: فصل کا نام، منڈی کا نام، قیمت فی گٹو یا من۔ اردو یا انگریزی دونوں چلتے ہیں۔
                  </div>
                </div>
              )}
              {voiceType === "auction_arrival" && (
                <div>
                  <div style={{ fontWeight: 700, color: c.primary, marginBottom: "0.4rem", fontSize: "0.88rem" }}>
                    💡 آمد کا نوٹ — بولنے کا نمونہ:
                  </div>
                  <div style={{ color: c.text, fontStyle: "italic", borderInlineStart: `3px solid ${c.accent}`, paddingInlineStart: "0.75rem" }}>
                    "حاجی بشیر پچاس گٹو کینو لے کر آیا ہے۔"
                  </div>
                  <div style={{ color: c.muted, marginTop: "0.5rem" }}>
                    واضح بولیں: کسان کا نام، فصل کا نام، گٹوں یا پیٹیوں کی تعداد۔
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              {/* Recording state: show record/stop button */}
              {!voiceBlob && !vnResult && (
                <>
                  <button
                    style={{
                      ...s.recordBtn,
                      background: isRecording ? "#cc0000" : c.primary,
                      color: c.white,
                      boxShadow: isRecording ? "0 0 0 8px rgba(204,0,0,0.15)" : "0 0 0 8px rgba(0,102,51,0.1)",
                    }}
                    onClick={isRecording ? stopRecording : startRecording}
                  >
                    {isRecording ? <X size={28} /> : <Mic size={28} />}
                  </button>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: isRecording ? c.error : c.primary, fontVariantNumeric: "tabular-nums" }}>
                    {isRecording
                      ? `${Math.floor(recordingTime / 60).toString().padStart(2, "0")}:${(recordingTime % 60).toString().padStart(2, "0")}`
                      : "ریکارڈنگ شروع کریں"}
                  </div>
                </>
              )}

              {/* Recorded: show playback + save/discard controls */}
              {voiceBlob && !vnResult && !transcribing && (
                <>
                  <audio
                    controls
                    src={URL.createObjectURL(voiceBlob)}
                    style={{ width: "100%", maxWidth: 340, marginTop: 8 }}
                  />
                  <div style={{ display: "flex", gap: "0.75rem", marginTop: 8 }}>
                    <button style={s.btnPrimary} onClick={handleTranscribeVN}>
                      <Save size={14} /> محفوظ / ٹرانسکرائب کریں
                    </button>
                    <button style={s.btnDanger} onClick={handleDiscardVN}>
                      <Trash2 size={14} /> خارج کریں
                    </button>
                  </div>
                </>
              )}

              {/* Transcribing state: loading spinner */}
              {transcribing && (
                <div style={{ textAlign: "center", padding: "1rem" }}>
                  <Loader2 size={28} color={c.primary} style={{ animation: "spin 1s linear infinite" }} />
                  <div style={{ marginTop: 8, color: c.muted, fontSize: "0.85rem" }}>
                    آواز پروسیس ہو رہی ہے...
                  </div>
                </div>
              )}

              {/* Preview state: show structured result + confirm */}
              {vnResult && vnResult.success && (
                <div style={{ width: "100%", background: "#f4f7f5", borderRadius: 12, padding: "1rem", marginTop: 8 }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 700, color: c.primary, marginBottom: "0.5rem" }}>
                    نتیجہ — جائزہ لیں
                  </div>
                  {vnResult.transcribedText && (
                    <div style={{ fontSize: "0.85rem", color: c.text, marginBottom: "0.75rem", padding: "0.5rem", background: c.white, borderRadius: 8, lineHeight: 1.6 }}>
                      <strong>ٹرانسکرپٹ:</strong> {vnResult.transcribedText}
                    </div>
                  )}
                  {Object.keys(vnResult.entities).length > 0 && (
                    <div style={{ fontSize: "0.85rem" }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>نکالی گئی معلومات:</div>
                      {Object.entries(vnResult.entities).map(([key, val]) => {
                        const urduLabels: Record<string, string> = {
                          cropName: "فصل", mandiName: "منڈی", minPrice: "کم ترین نرخ",
                          maxPrice: "زیادہ نرخ", avgPrice: "اوسط نرخ",
                          farmerName: "کسان", gattuCount: "گٹو", petiCount: "پیٹی",
                          kacchiBikri: "کچی بکری", gaadiRent: "گاڑی کرایہ",
                        };
                        const label = urduLabels[key] ?? key;
                        const isMissing = val == null;
                        return (
                          <div key={key} style={{ ...s.row, color: isMissing ? c.error : c.text }}>
                            <span style={{ color: isMissing ? c.error : c.muted }}>{label}</span>
                            <span style={{ fontWeight: 600 }}>{isMissing ? "نہیں ملا" : String(val)}</span>
                          </div>
                        );
                      })}
                      {Object.values(vnResult.entities).every(v => v == null) && (
                        <div style={{ color: c.error, fontSize: "0.8rem", marginTop: 6, fontWeight: 600 }}>
                          ⚠ آواز واضح نہیں — براہ کرم فصل، منڈی اور نرخ صاف بولیں
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                    <button style={s.btnPrimary} onClick={saveTranscribedVN}>
                      <CheckCircle size={14} /> تصدیق اور محفوظ کریں
                    </button>
                    <button style={s.btnOutline} onClick={handleDiscardVN}>
                      واپس
                    </button>
                  </div>
                </div>
              )}

              {/* Error from transcription */}
              {vnResult && !vnResult.success && (
                <div style={{ textAlign: "center" }}>
                  <div style={{ color: c.error, fontSize: "0.85rem", marginBottom: "0.5rem" }}>
                    {vnResult.error}
                  </div>
                  <button style={s.btnOutline} onClick={handleDiscardVN}>
                    واپس جائیں
                  </button>
                </div>
              )}

              {voiceStatus && (
                <div style={{ fontSize: "0.85rem", color: c.muted, textAlign: "center" }}>{voiceStatus}</div>
              )}

              {/* Toast notification */}
              {toast && (
                <div style={{
                  position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
                  background: toast.ok ? c.primary : c.error, color: c.white,
                  padding: "0.65rem 1.25rem", borderRadius: 10,
                  fontWeight: 600, fontSize: "0.9rem", zIndex: 1200,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  {toast.ok ? <CheckCircle size={18} /> : <X size={18} />}
                  {toast.msg}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* VOICE NOTE HISTORY TAB                                       */}
        {/* ============================================================ */}
        {tab === "vn_history" && (
          <div>
            <div style={s.sectionTitle}><Volume2 size={18} /> وائس نوٹس کی فہرست</div>
            {vnHistory.length === 0 ? (
              <div style={s.empty}>کوئی وائس نوٹ نہیں</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {vnHistory.map(vn => {
                  const typeLabels: Record<string, string> = {
                    mandi_rate: "منڈی نرخ", auction_arrival: "آمد", settlement_audio: "سیٹلمنٹ",
                  };
                  const inferredType = vn.voice_type ?? (() => {
                    const t = vn.transcribed_text ?? "";
                    if (/نیلامی|آمد|کھیپ|auction/i.test(t)) return "auction_arrival";
                    if (/سیٹلمنٹ|پرچی|حساب/i.test(t)) return "settlement_audio";
                    return "mandi_rate";
                  })();
                  const isConfirmed = vn.status === "confirmed" || vn.status === "completed";
                  const isConfirming = confirmingVN === vn.id;

                  return (
                    <div key={vn.id} style={{
                      ...s.card, borderLeft: `4px solid ${isConfirmed ? c.primary : c.accent}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span style={{
                              ...s.badge,
                              background: isConfirmed ? "#f0fff5" : "#fff8e1",
                              color: isConfirmed ? c.primary : "#b8860b",
                            }}>
                              {typeLabels[inferredType] ?? inferredType}
                            </span>
                            <span style={{
                              ...s.badge,
                              background: isConfirmed ? "#e8f5e9" : "#f5f5f5",
                              color: isConfirmed ? c.primary : "#666",
                            }}>
                              {isConfirmed ? "✓ تصدیق شدہ" : "زیر التوا"}
                            </span>
                            <span style={{ fontSize: "0.75rem", color: c.muted }}>
                              {vn.created_at ? new Date(vn.created_at).toLocaleDateString("ur-PK", { day: "numeric", month: "short" }) : ""}
                            </span>
                          </div>

                          {vn.transcribed_text && (
                            <div style={{
                              fontSize: "0.85rem", color: c.text,
                              background: "#f4f7f5", borderRadius: 8,
                              padding: "0.45rem 0.65rem", marginTop: 6, lineHeight: 1.6,
                            }}>
                              {vn.transcribed_text}
                            </div>
                          )}

                          {vn.audio_url && (
                            <audio controls preload="none" src={vn.audio_url}
                              style={{ width: "100%", maxWidth: 340, height: 34, marginTop: 6 }}
                            />
                          )}

                          {/* Show extracted entities */}
                          {vn.entities && Object.keys(vn.entities).length > 0 && (
                            <div style={{ fontSize: "0.75rem", color: c.muted, marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {Object.entries(vn.entities).filter(([, v]) => v != null).map(([k, v]) => (
                                <span key={k} style={{ background: "#e8f5e9", borderRadius: 4, padding: "2px 6px" }}>
                                  {k}: {String(v)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Confirm toggle button */}
                        {!isConfirmed && (
                          <button
                            style={{
                              ...s.btnPrimary,
                              opacity: isConfirming ? 0.6 : 1,
                              minWidth: 100,
                              display: "flex", alignItems: "center", gap: 6,
                            }}
                            disabled={isConfirming}
                            onClick={() => handleConfirmVN(vn.id)}
                          >
                            {isConfirming ? (
                              <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> تصدیق...</>
                            ) : (
                              <><ToggleRight size={14} /> تصدیق کریں</>
                            )}
                          </button>
                        )}
                        {isConfirmed && (
                          <CheckCircle size={20} color={c.primary} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* CHAT TAB                                                      */}
        {/* ============================================================ */}
        {tab === "chat" && (
          <div>
            <div style={s.sectionTitle}><MessageSquare size={18} /> کسانوں کی فہرست</div>
            {farmers.length === 0 ? (
              <div style={s.empty}>کوئی کسان رجسٹرڈ نہیں</div>
            ) : (
              <div style={{ display: "grid", gap: "0.65rem", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                {farmers.map(f => (
                  <div key={f.id} style={{
                    ...s.card, display: "flex", alignItems: "center", gap: "0.75rem",
                    cursor: "pointer",
                  }} onClick={() => openChatWithFarmer(f.id, f.name)}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: c.primary, color: c.white,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 700, fontSize: "0.9rem",
                    }}>
                      {(f.name ?? "?").charAt(0)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{f.name ?? `کسان #${f.id}`}</div>
                      <div style={{ fontSize: "0.78rem", color: c.muted, direction: "ltr", textAlign: "start", marginTop: 1 }}>
                        <Phone size={11} style={{ display: "inline", verticalAlign: "middle", marginInlineEnd: 3 }} />
                        {f.phone && !f.phone.startsWith("Not Provided") ? f.phone : "نمبر دستیاب نہیں"}
                      </div>
                    </div>
                    <MessageSquare size={18} color={c.primary} />
                  </div>
                ))}
              </div>
            )}

            {/* Inline chat drawer */}
            {chatOpen && arthiId && chatRecipientId && (
              <div style={{ marginTop: "1rem" }}>
                <ChatDrawer
                  isOpen={chatOpen}
                  onClose={() => setChatOpen(false)}
                  currentUserId={arthiId}
                  recipientId={chatRecipientId}
                  recipientName={chatRecipientName}
                />
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* ARRIVALS TAB                                                 */}
        {/* ============================================================ */}
        {tab === "arrivals" && (
          <>
            <div style={s.sectionTitle}><Calendar size={18} /> آمد کی فہرست</div>
            {arrivals.length === 0 ? (
              <div style={s.empty}>کوئی آمد ریکارڈ نہیں</div>
            ) : (
              <div style={s.grid}>
                {arrivals.map(a => (
                  <div key={a.id} style={s.card}>
                    <div style={{ fontWeight: 700, color: c.primary, fontSize: "1rem" }}>
                      {a.cropName ?? "--"}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: c.muted, marginTop: 4 }}>
                      کسان: {a.farmerName ?? "--"} | گٹو: {a.gattu_count ?? 0} | پیٹی: {a.peti_count ?? 0}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                      <span style={{
                        ...s.badge,
                        background: a.status === "confirmed" ? "#f0fff5" : "#fff8e1",
                        color: a.status === "confirmed" ? c.primary : "#b8860b",
                      }}>
                        {a.status === "confirmed" ? "تصدیق شدہ" : "زیر التوا"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
                      {a.status !== "confirmed" && (
                        <button style={s.btnPrimary} onClick={() => confirmArrival(a.id)}>
                          <CheckCircle size={14} /> آمد کی تصدیق کریں
                        </button>
                      )}
                      {a.status === "confirmed" && (
                        <button style={s.btnOutline} onClick={() => setAuctionArrival(a)}>
                          <TrendingUp size={14} /> نیلامی کا نوٹس بنائیں
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* RECEIPTS TAB                                                 */}
        {/* ============================================================ */}
        {tab === "receipts" && (
          <div>
            {/* Create Settlement Form */}
            <div style={s.card}>
              <div style={s.sectionTitle}><FileText size={18} /> سیٹلمنٹ بنائیں</div>

              {/* Step 1: Upload purchase list image */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "0.9rem", fontWeight: 700, color: c.primary, marginBottom: "0.5rem" }}>
                  قدم ۱: پرچی کی تصویر اپ لوڈ کریں <span style={{ color: c.error }}>*</span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                  <input type="file" accept="image/*" style={{ fontSize: "0.8rem" }}
                    onChange={e => { setReceiptFile(e.target.files?.[0] ?? null); setReceiptError(""); setReceiptId(null); setAnalysisDone(false); setBidders([]); setExtractedKacchiBikri(0); setExtractedGattu(0); }} />
                  <button style={{ ...s.btnPrimary, padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                    onClick={handleReceiptAnalyze} disabled={receiptLoading || !receiptFile}>
                    {receiptLoading ? <><Loader2 size={14} className="animate-spin" /> تجزیہ ہو رہا ہے...</> : <><Upload size={14} /> تصویر کا تجزیہ کریں</>}
                  </button>
                </div>
                {receiptError && <div style={{ color: c.error, fontSize: "0.8rem", marginTop: 4 }}>{receiptError}</div>}
                {analysisDone && <div style={{ color: c.primary, fontSize: "0.8rem", marginTop: 4, fontWeight: 600 }}>✓ تصویر کا تجزیہ مکمل</div>}
              </div>

              {/* Step 2: Show extracted bidders (read-only) */}
              {analysisDone && bidders.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 700, color: c.primary, marginBottom: "0.5rem" }}>
                    قدم ۲: خریداروں کی فہرست (تصویر سے نکالی گئی)
                  </div>
                  {bidders.map((b, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      background: "#f9faf9", border: `1px solid ${c.border}`,
                      borderRadius: 8, padding: "0.5rem 0.75rem", marginBottom: "0.4rem",
                    }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{b.bidderName}</span>
                        {b.gattuCount > 0 && (
                          <span style={{ color: c.muted, fontSize: "0.8rem", marginInlineStart: "0.5rem" }}>
                            {b.gattuCount} گٹے
                          </span>
                        )}
                      </div>
                      <span style={{ fontWeight: 700, color: c.primary }}>{fmtCurrency(b.cost)}</span>
                    </div>
                  ))}
                  <div style={{
                    display: "flex", justifyContent: "space-between", padding: "0.5rem 0.75rem",
                    background: c.primary, borderRadius: 8, color: c.white, fontWeight: 700, fontSize: "0.9rem",
                  }}>
                    <span>کل کچّی بکری ({totalGattu} گٹے)</span>
                    <span>{fmtCurrency(kacchiBikri)}</span>
                  </div>
                </div>
              )}

              {/* Step 3: Farmer, Crop, Expenses (visible after analysis) */}
              {analysisDone && (
                <>
                  {/* Farmer & Crop */}
                  <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
                    <div>
                      <label style={s.label}>قدم ۳: کسان منتخب کریں <span style={{ color: c.error }}>*</span></label>
                      <select style={{ ...s.input, borderColor: !setlFarmerId ? c.error : c.border }}
                        value={setlFarmerId ?? ""}
                        onChange={e => setSetlFarmerId(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">-- کسان چنیں --</option>
                        {farmers.map(f => (
                          <option key={f.id} value={f.id}>{f.name ?? f.id}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={s.label}>فصل منتخب کریں</label>
                      <select style={s.input}
                        value={setlCropId ?? ""}
                        onChange={e => setSetlCropId(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">-- فصل چنیں --</option>
                        {crops.map(cr => (
                          <option key={cr.id} value={cr.id}>{cr.urdu_name ?? cr.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Expenses */}
                  <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "1fr 1fr", marginBottom: "1rem" }}>
                    <div>
                      <label style={s.label}>گاڑی کرایہ (Rs.)</label>
                      <input type="number" min="0" style={s.input}
                        value={setlGaadiRent || ""} onChange={e => setSetlGaadiRent(Number(e.target.value))} />
                    </div>
                    <div>
                      <label style={s.label}>مہمان نوازی (Rs.)</label>
                      <input type="number" min="0" style={s.input}
                        value={setlHospitality || ""} onChange={e => setSetlHospitality(Number(e.target.value))} />
                    </div>
                  </div>

                  {/* Computed values preview */}
                  {(() => {
                    const calc = computeSettlement({
                      kacchi_bikri: kacchiBikri,
                      gattu_count: totalGattu,
                      peti_count: 0,
                      gaadi_rent: setlGaadiRent,
                      hospitality_cost: setlHospitality,
                    });
                    return (
                      <div style={{ background: "#f4f7f5", borderRadius: 8, padding: "0.75rem", marginBottom: "1rem" }}>
                        <div style={s.row}><span>کچّی بکری (تصویر سے)</span><span>{fmtCurrency(calc.kacchi_bikri)}</span></div>
                        <div style={s.row}><span>لیبر فیس ({totalGattu} گٹے × Rs. 20)</span><span>{fmtCurrency(calc.labor_fee)}</span></div>
                        <div style={s.row}><span>گروس کمیشن (6%)</span><span>{fmtCurrency(calc.gross_commission)}</span></div>
                        <div style={s.row}><span>منڈی فیس ({totalGattu} × Rs. 2)</span><span>{fmtCurrency(calc.market_fee)}</span></div>
                        <div style={s.row}><span>نیٹ کمیشن</span><span>{fmtCurrency(calc.net_commission)}</span></div>
                        <div style={{ ...s.row, fontWeight: 700, color: c.primary, borderBottom: "none", fontSize: "0.95rem" }}>
                          <span>پختہ بکری (کسان کو)</span><span>{fmtCurrency(calc.pakhta_bikri)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {settlementStatus && (
                    <div style={{
                      marginBottom: "0.75rem", padding: "0.5rem 0.75rem", borderRadius: 8,
                      background: settlementStatus.startsWith("✓") ? "#e8f5e9" : settlementStatus.startsWith("⚠") || settlementStatus.startsWith("خرابی") ? "#fff0f0" : "#f5f5f5",
                      color: settlementStatus.startsWith("✓") ? c.primary : settlementStatus.startsWith("⚠") || settlementStatus.startsWith("خرابی") ? c.error : c.muted,
                      fontSize: "0.85rem", fontWeight: 600,
                    }}>
                      {settlementStatus}
                    </div>
                  )}

                  <button style={{ ...s.btnPrimary, width: "100%", justifyContent: "center", padding: "0.7rem" }}
                    onClick={confirmSettlement} disabled={receiptLoading}>
                    <CheckCircle size={16} /> سیٹلمنٹ محفوظ کریں
                  </button>
                </>
              )}
            </div>

            {/* Settlement List */}
            <div style={s.card}>
              <div style={s.sectionTitle}><Store size={18} /> سیٹلمنٹ کی فہرست</div>
              {settlements.length === 0 ? (
                <div style={s.empty}>کوئی سیٹلمنٹ نہیں</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {settlements.map(st => (
                    <div key={st.id} style={{
                      background: "#f9faf9", border: `1px solid ${c.border}`,
                      borderRadius: 10, padding: "0.75rem 1rem", cursor: "pointer",
                    }} onClick={() => setSelectedSettlement(st)}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.9rem", color: c.primary }}>
                            #{st.id} {st.cropName && <span style={{ color: c.accent, marginInlineStart: "0.4rem" }}>{st.cropName}</span>}
                          </div>
                          <div style={{ fontSize: "0.8rem", color: c.muted, marginTop: 2 }}>
                            {st.farmerName ? <span><User size={11} style={{ display: "inline" }} /> {st.farmerName}</span> : <span style={{ color: c.error }}>کسان نامعلوم</span>}
                            <span style={{ marginInlineStart: "0.75rem" }}>{fmtDate(st.settlement_date)}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "end" }}>
                          <div style={{ fontWeight: 700, color: c.primary }}>{fmtCurrency(st.pakhta_bikri)}</div>
                          <div style={{ fontSize: "0.75rem", color: c.muted }}>کچّی: {fmtCurrency(st.kacchi_bikri)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* LEDGER TAB                                                   */}
        {/* ============================================================ */}
        {tab === "ledger" && (
          <div style={s.card}>
            <div style={s.sectionTitle}><Building size={18} /> ماہانہ دکان اخراجات</div>
            <form onSubmit={submitExpense}>
              <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <label style={s.label}>مہینہ (YYYY-MM)</label>
                  <input type="month" style={s.input} value={ledgerMonth}
                    onChange={e => setLedgerMonth(e.target.value)} required />
                </div>
                <div>
                  <label style={s.label}>دکان کا کرایہ (Rs.)</label>
                  <input type="number" min="0" style={s.input} value={shopRent ?? ""}
                    onChange={e => setShopRent(e.target.value === "" ? null : Number(e.target.value))} />
                </div>
                <div>
                  <label style={s.label}>بجلی کا بل (Rs.)</label>
                  <input type="number" min="0" style={s.input} value={elecBill ?? ""}
                    onChange={e => setElecBill(e.target.value === "" ? null : Number(e.target.value))} />
                </div>
                <div>
                  <label style={s.label}>منشی تنخواہ (Rs.)</label>
                  <input type="number" min="0" style={s.input} value={munshiSalary ?? ""}
                    onChange={e => setMunshiSalary(e.target.value === "" ? null : Number(e.target.value))} />
                </div>
                <div>
                  <label style={s.label}>دیگر اخراجات (Rs.)</label>
                  <input type="number" min="0" style={s.input} value={otherAllow ?? ""}
                    onChange={e => setOtherAllow(e.target.value === "" ? null : Number(e.target.value))} />
                </div>
                <div>
                  <label style={s.label}>کل ماہانہ</label>
                  <div style={{ padding: "0.55rem 0.75rem", fontWeight: 700, color: c.primary, fontSize: "1.1rem" }}>
                    {fmtCurrency(computeMonthlyExpense({
                      rent_amount: shopRent, electricity_bill: elecBill,
                      munshi_salary: munshiSalary, other_allowances: otherAllow,
                    }))}
                  </div>
                </div>
              </div>
              <button type="submit" style={{ ...s.btnPrimary, marginTop: "1rem" }}>
                محفوظ کریں
              </button>
              {ledgerStatus && (
                <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: ledgerStatus.startsWith("✓") ? c.primary : "#c62828", fontWeight: 600 }}>{ledgerStatus}</div>
              )}
            </form>
          </div>
        )}

        {/* ============================================================ */}
        {/* PROFILE TAB                                                  */}
        {/* ============================================================ */}
        {tab === "profile" && (
          <div style={s.card}>
            <div style={s.sectionTitle}><Settings size={18} /> دکان کی تفصیلات</div>
            <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <label style={s.label}>دکان کا نام</label>
                <input type="text" style={s.input} value={shopName}
                  onChange={e => setShopName(e.target.value)} placeholder="مثال: الحاجی اوروہ ٹریڈرز" />
              </div>
              <div>
                <label style={s.label}>دکان کا نمبر</label>
                <input type="text" style={s.input} value={shopNumber}
                  onChange={e => setShopNumber(e.target.value)} placeholder="مثال: دکان نمبر 12" />
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={s.label}><MapPin size={14} style={{ display: "inline", verticalAlign: "middle" }} /> مکمل پتہ</label>
                <input type="text" style={s.input} value={shopAddress}
                  onChange={e => setShopAddress(e.target.value)} placeholder="مثال: مین بازار، نزد جامعہ مسجد" />
              </div>
              <div>
                <label style={s.label}>شہر</label>
                <input type="text" style={s.input} value={shopCity}
                  onChange={e => setShopCity(e.target.value)} placeholder="مثال: سرگودہا" />
              </div>
              <div>
                <label style={s.label}>فون نمبر</label>
                <input type="text" style={s.input} value={userName ? "" : ""} disabled placeholder="پروفائل میں تبدیل نہیں ہو سکتا" />
              </div>
            </div>
            <div style={{ marginTop: "0.5rem", padding: "0.75rem", background: "#f0f7f4", borderRadius: 8, fontSize: "0.85rem", color: "#555" }}>
              یہ تفصیلات کسانوں کے ڈیش بورڈ پر نظر آئیں گی تاکہ وہ آپ کی دکان تلاش کر سکیں۔
            </div>
            <button style={{ ...s.btnPrimary, marginTop: "1rem" }} onClick={saveProfile}>
              <Save size={15} /> محفوظ کریں
            </button>
            {profileStatus && (
              <div style={{ marginTop: "0.5rem", fontSize: "0.85rem", color: profileStatus.startsWith("✓") ? c.primary : "#c62828", fontWeight: 600 }}>{profileStatus}</div>
            )}
          </div>
        )}
      </div>

      {/* ---- Auction Notice Modal ---- */}
      {auctionArrival && (
        <div style={s.modal} onClick={() => setAuctionArrival(null)}>
          <form onSubmit={submitAuctionNotice} style={s.modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: c.primary, marginBottom: "1rem" }}>
              نیلامی کا نوٹس بنائیں — {auctionArrival.cropName}
            </div>
            <div style={{ display: "grid", gap: "0.6rem" }}>
              <div>
                <label style={s.label}>نیلامی کی تاریخ</label>
                <input type="date" style={s.input} value={auctionDate}
                  onChange={e => setAuctionDate(e.target.value)} required />
              </div>
              <div>
                <label style={s.label}>نیلامی کا وقت</label>
                <input type="time" style={s.input} value={auctionTime}
                  onChange={e => setAuctionTime(e.target.value)} required />
              </div>
              <div>
                <label style={s.label}>پیغام (اختیاری)</label>
                <textarea style={{ ...s.input, minHeight: 60, resize: "vertical" }}
                  value={auctionMsg} onChange={e => setAuctionMsg(e.target.value)}
                  placeholder="تمام کسانوں اور خریداروں کو اطلاع..." />
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="submit" style={s.btnPrimary}>
                <CheckCircle size={14} /> نوٹس شائع کریں
              </button>
              <button type="button" style={s.btnOutline} onClick={() => setAuctionArrival(null)}>
                منسوخ
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Settlement Detail Modal (Arthi) ── */}
      {selectedSettlement && (
        <div style={s.modal} onClick={() => setSelectedSettlement(null)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: "1.1rem", fontWeight: 700, color: c.primary, marginBottom: "1rem" }}>
              <FileText size={18} style={{ display: "inline" }} /> سیٹلمنٹ #{selectedSettlement.id} کی تفصیل
            </div>

            {/* Crop info */}
            {selectedSettlement.cropName && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1.5px solid #006633", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600 }}>فصل</span>
                <span style={{ fontWeight: 700, color: "#006633" }}>{selectedSettlement.cropName}</span>
              </div>
            )}

            {/* Farmer */}
            {selectedSettlement.farmerName && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderBottom: "1px solid #eee", fontSize: "0.85rem" }}>
                <span>کسان</span>
                <span style={{ fontWeight: 600 }}>{selectedSettlement.farmerName}</span>
              </div>
            )}

            {/* Bidder list */}
            {selectedSettlement.bidders.length > 0 && (
              <div style={{ marginBottom: "1rem", marginTop: "0.75rem" }}>
                <div style={{ fontWeight: 700, color: "#006633", fontSize: "0.9rem", marginBottom: "0.5rem" }}>خریداروں کی فہرست</div>
                {selectedSettlement.bidders.map((b, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between", padding: "0.35rem 0.5rem",
                    background: i % 2 === 0 ? "#f9faf9" : "#fff", borderRadius: 6, fontSize: "0.85rem",
                  }}>
                    <span>{b.bidderName}</span>
                    {b.gattuCount > 0 && <span style={{ color: c.muted }}>{b.gattuCount} گٹے</span>}
                    <span style={{ fontWeight: 600 }}>{fmtCurrency(b.cost)}</span>
                  </div>
                ))}
                <div style={{
                  display: "flex", justifyContent: "space-between", padding: "0.4rem 0.5rem",
                  background: "#006633", borderRadius: 6, color: "#fff", fontWeight: 700, fontSize: "0.85rem", marginTop: "0.3rem",
                }}>
                  <span>کل کچّی بکری</span>
                  <span>{fmtCurrency(selectedSettlement.kacchi_bikri)}</span>
                </div>
              </div>
            )}

            {/* Financial breakdown */}
            {[
              ["کچّی بکری", fmtCurrency(selectedSettlement.kacchi_bikri)],
              ["لیبر فیس", fmtCurrency(selectedSettlement.labor_fee)],
              ["گروس کمیشن (6%)", fmtCurrency(selectedSettlement.gross_commission)],
              ["منڈی فیس", fmtCurrency(selectedSettlement.market_fee)],
              ["آرتھی نیٹ کمیشن", fmtCurrency(selectedSettlement.net_arthi_commission)],
              ["گاڑی کرایہ", fmtCurrency(selectedSettlement.gaadi_rent)],
              ["مہمان نوازی", fmtCurrency(selectedSettlement.hospitality_cost)],
              ["گٹو", `${selectedSettlement.gattu_count ?? 0}`],
              ["پیٹی", `${selectedSettlement.peti_count ?? 0}`],
            ].map(([label, val], i) => (
              <div key={i} style={s.row}><span>{label}</span><span style={{ fontWeight: 600 }}>{val}</span></div>
            ))}

            <div style={{ ...s.row, fontWeight: 700, color: c.primary, borderBottom: "none", fontSize: "1rem", marginTop: "0.5rem", paddingTop: "0.75rem", borderTop: "2px solid #006633" }}>
              <span>پختہ بکری (کسان کو)</span>
              <span>{fmtCurrency(selectedSettlement.pakhta_bikri)}</span>
            </div>

            <div style={{ fontSize: "0.8rem", color: c.muted, marginTop: "0.5rem", textAlign: "center" }}>
              {fmtDate(selectedSettlement.settlement_date)}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button style={{ ...s.btnPrimary, flex: 1, justifyContent: "center" }} onClick={() => window.print()}>
                پرنٹ کریں
              </button>
              <button style={{ ...s.btnOutline, flex: 1, justifyContent: "center" }} onClick={() => setSelectedSettlement(null)}>
                بند کریں
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
