"use client";

import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/types/supabase";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, MessageSquare, FileText,
  Calendar, LogOut, Building, User, Volume2, MapPin, Store,
} from "lucide-react";
import ChatDrawer from "@/components/chat/ChatDrawer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettlementRow = Tables<"settlements">;

interface MandiPriceEntry {
  id: number;
  price: number;
  created_at: string | null;
  mandiName: string;
  mandiCity: string;
  arthiId: number;
  cropName: string;
}

interface VoiceUpdate {
  id: number;
  audio_url: string | null;
  transcribed_text: string | null;
  created_at: string | null;
}

interface ShopProfile {
  id: number; // users.id
  shopName: string | null;
  shopNumber: string | null;
  userName: string | null;
  phone: string | null;
  shopAddress: string | null;
  shopCity: string | null;
  voiceNotes: VoiceUpdate[];
}

interface AuctionCard {
  id: number;
  cropName: string;
  mandiName: string;
  mandiCity: string;
  auctionDate: string;
  auctionTime: string;
  message: string | null;
}

interface BidderInfo {
  bidder_name: string | null;
  gattu_count: number | null;
  cost: number | null;
}

interface SettlementView extends SettlementRow {
  arthiName: string | null;
  arthiShopName: string | null;
  arthiAddress: string | null;
  arthiCity: string | null;
  cropName: string | null;
  bidders: BidderInfo[];
}

interface ChartPoint {
  date: string;
  avg: number;
  min: number;
  max: number;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s: Record<string, CSSProperties> = {
  page: { minHeight: "100vh", background: "#f4f7f5" },
  header: {
    background: "linear-gradient(135deg, #004d26 0%, #006633 100%)",
    color: "#fff", padding: "1rem 1.5rem",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  headerTitle: { fontSize: "1.25rem", fontWeight: 700 },
  headerSub: { fontSize: "0.8rem", opacity: 0.85, marginTop: 2 },
  logoutBtn: {
    background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
    color: "#fff", padding: "0.4rem 0.85rem", borderRadius: 8,
    display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem",
  },
  content: { maxWidth: 1100, margin: "0 auto", padding: "1.5rem 1rem" },
  section: { marginBottom: "2rem" },
  sectionTitle: {
    fontSize: "1.1rem", fontWeight: 700, color: "#006633",
    marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 8,
  },
  card: {
    background: "#fff", borderRadius: 12, padding: "1rem 1.25rem",
    border: "1.5px solid #D4AF37", boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
  },
  grid: { display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" },
  mandiCard: {
    background: "#fff", borderRadius: 12, padding: "0.85rem 1.1rem",
    border: "1.5px solid #D4AF37", boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
  },
  chartWrap: {
    background: "#fff", borderRadius: 12, padding: "1rem 1.25rem",
    border: "1.5px solid #D4AF37", boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
    height: 320,
  },
  auctionCard: {
    background: "#fff", borderRadius: 12, padding: "0.85rem 1.1rem",
    border: "1.5px solid #D4AF37", boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
  },
  settlementRow: {
    background: "#fff", borderRadius: 12, padding: "0.85rem 1.1rem",
    border: "1.5px solid #dde3df", boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    cursor: "pointer", display: "flex", justifyContent: "space-between",
    alignItems: "center",
  },
  modal: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, padding: "1rem",
  },
  modalCard: {
    background: "#fff", borderRadius: 16, padding: "2rem",
    maxWidth: 500, width: "100%", maxHeight: "90vh", overflowY: "auto",
    border: "2px solid #D4AF37",
  },
  modalTitle: { fontSize: "1.15rem", fontWeight: 700, color: "#006633", marginBottom: "1rem" },
  modalRow: {
    display: "flex", justifyContent: "space-between", padding: "0.5rem 0",
    borderBottom: "1px solid #eee", fontSize: "0.9rem",
  },
  modalBtn: {
    marginTop: "1.25rem", width: "100%", padding: "0.7rem",
    background: "#006633", color: "#fff", border: "none",
    borderRadius: 8, fontWeight: 600, fontSize: "0.95rem",
  },
  emptyState: {
    textAlign: "center", color: "#999", padding: "2rem", fontSize: "0.9rem",
  },
  shopCard: {
    background: "#fff", borderRadius: 12, padding: "0.85rem 1.1rem",
    border: "1.5px solid #dde3df",
  },
  iconBtn: {
    padding: "0.4rem 0.75rem", borderRadius: 8, border: "1.5px solid #006633",
    background: "#fff", color: "#006633", display: "flex",
    alignItems: "center", gap: 4, fontSize: "0.8rem", fontWeight: 600,
    textDecoration: "none", cursor: "pointer",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString("ur-PK", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

function fmtCurrency(n: number | null): string {
  if (n == null) return "Rs. 0";
  return `Rs. ${n.toLocaleString("en-PK")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FarmerDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [farmerId, setFarmerId] = useState<number | null>(null);

  // Data
  const [mandiPrices, setMandiPrices] = useState<MandiPriceEntry[]>([]);
  const [chartData, setChartData] = useState<Record<string, ChartPoint[]>>({});
  const [shops, setShops] = useState<ShopProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Other sections
  const [auctions, setAuctions] = useState<AuctionCard[]>([]);
  const [settlements, setSettlements] = useState<SettlementView[]>([]);
  const [selectedSettlement, setSelectedSettlement] = useState<SettlementView | null>(null);

  // Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatRecipient, setChatRecipient] = useState<ShopProfile | null>(null);

  // -----------------------------------------------------------------------
  // Data loading
  // -----------------------------------------------------------------------
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }

      const { data: profile } = await supabase
        .from("users").select("id, name").eq("auth_id", user.id).maybeSingle();
      if (!profile) { setLoading(false); return; }
      setUserName(profile.name ?? "");
      setFarmerId(profile.id);

      // Parallel loads
      const pastDate = new Date(); pastDate.setDate(pastDate.getDate() - 2);
      const pastDateStr = pastDate.toISOString().split("T")[0];
      const futureDate = new Date(); futureDate.setDate(futureDate.getDate() + 7);
      const futureDateStr = futureDate.toISOString().split("T")[0];
      const [pricesRes, auctionsRes, settlementsRes] = await Promise.all([
        supabase.from("mandi_prices")
          .select("id, price, created_at, mandi_id, arthi_id, crops(name, urdu_name)")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("auction_notices")
          .select("id, auction_date, auction_time, message, crops(name, urdu_name), mandis(name, city)")
          .gte("auction_date", pastDateStr)
          .lte("auction_date", futureDateStr)
          .order("auction_date", { ascending: true }),
        supabase.from("settlements")
          .select("*, arthi:users!arthi_id(name, shop_name, shop_address, shop_city), crops(name, urdu_name), settlement_bidders(bidder_name, gattu_count, cost)")
          .eq("farmer_landlord_id", profile.id)
          .order("settlement_date", { ascending: false }).limit(20),
      ]);

      console.log("[Farmer] mandi_prices:", pricesRes.error?.message ?? `${(pricesRes.data ?? []).length} rows`);
      console.log("[Farmer] auctions:", auctionsRes.error?.message ?? `${(auctionsRes.data ?? []).length} rows`);
      console.log("[Farmer] settlements:", settlementsRes.error?.message ?? `${(settlementsRes.data ?? []).length} rows`);

      // ── Fetch ALL mandi details ──
      const priceRows = pricesRes.data ?? [];
      const { data: allMandis } = await supabase
        .from("mandis").select("id, name, city");
      const mandiMap = new Map<number, { name: string; city: string }>();
      for (const m of allMandis ?? []) mandiMap.set(m.id, { name: m.name, city: m.city });

      // ── Infer mandi for null mandi_id from the same arthi's other prices ──
      const arthiMandi = new Map<number, { name: string; city: string }>();
      for (const r of priceRows) {
        if (r.mandi_id && r.arthi_id && mandiMap.has(r.mandi_id) && !arthiMandi.has(r.arthi_id)) {
          arthiMandi.set(r.arthi_id, mandiMap.get(r.mandi_id)!);
        }
      }

      // ── For arthis with null-mandi prices, resolve mandi from their voice notes ──
      const unresolvedArthiIds = [...new Set(
        priceRows.filter(r => !r.mandi_id && r.arthi_id && !arthiMandi.has(r.arthi_id)).map(r => r.arthi_id!)
      )];
      if (unresolvedArthiIds.length > 0 && (allMandis ?? []).length > 0) {
        const urduCityMap: Record<string, string> = {
          "سرگودھا": "sargodha", "سرگودہ": "sargodha", "سرگودا": "sargodha",
          "فیصل آباد": "faisalabad", "فیصلآباد": "faisalabad",
          "ملتان": "multan", "لاہور": "lahore", "لاھور": "lahore",
          "گوجرانوالہ": "gujranwala", "ساہیوال": "sahiwal",
        };
        const { data: vnForResolve } = await supabase
          .from("arthi_voice_updates")
          .select("arthi_id, transcribed_text")
          .in("arthi_id", unresolvedArthiIds)
          .not("transcribed_text", "is", null)
          .order("created_at", { ascending: false })
          .limit(50);
        for (const vn of vnForResolve ?? []) {
          if (vn.arthi_id == null || arthiMandi.has(vn.arthi_id)) continue;
          const text = (vn.transcribed_text ?? "").toLowerCase();
          for (const m of allMandis ?? []) {
            const cityLower = m.city.toLowerCase();
            if (text.includes(cityLower) || text.includes(m.name.toLowerCase())) {
              arthiMandi.set(vn.arthi_id, { name: m.name, city: m.city });
              break;
            }
            // Match Urdu city names against English mandi cities
            for (const [urdu, english] of Object.entries(urduCityMap)) {
              if (text.includes(urdu) && cityLower === english) {
                arthiMandi.set(vn.arthi_id, { name: m.name, city: m.city });
                break;
              }
            }
            if (arthiMandi.has(vn.arthi_id)) break;
          }
        }
      }

      // ── Price entries with crop names ──
      if (pricesRes.error) {
        console.error("[Farmer] mandi_prices error:", pricesRes.error.message);
      }
      const entries: MandiPriceEntry[] = priceRows.map(row => {
        const mandi = mandiMap.get(row.mandi_id ?? 0) ?? null;
        const fallbackMandi = row.arthi_id ? arthiMandi.get(row.arthi_id) ?? null : null;
        const resolvedMandi = mandi ?? fallbackMandi;
        const crop = row.crops as unknown as { name?: string; urdu_name?: string } | null;
        return {
          id: row.id,
          price: row.price,
          created_at: row.created_at,
          mandiName: resolvedMandi?.name ?? "منڈی",
          mandiCity: resolvedMandi?.city ?? "",
          arthiId: row.arthi_id ?? 0,
          cropName: crop?.urdu_name ?? crop?.name ?? "--",
        };
      });
      setMandiPrices(entries);

      // ── Chart data (grouped by crop name) ──
      if (entries.length > 0) {
        const chronological = [...entries].sort((a, b) =>
          (a.created_at ?? "").localeCompare(b.created_at ?? "")
        );
        // Collect all prices per (crop, date)
        const byCropDate = new Map<string, Map<string, number[]>>();
        for (const e of chronological) {
          if (!e.created_at) continue;
          const dateLabel = new Date(e.created_at).toLocaleDateString("en-PK", {
            month: "short", day: "numeric",
          });
          if (!byCropDate.has(e.cropName)) byCropDate.set(e.cropName, new Map());
          const dateMap = byCropDate.get(e.cropName)!;
          if (!dateMap.has(dateLabel)) dateMap.set(dateLabel, []);
          dateMap.get(dateLabel)!.push(e.price);
        }
        const chartMap: Record<string, ChartPoint[]> = {};
        for (const [crop, dateMap] of byCropDate) {
          const points: ChartPoint[] = [];
          for (const [date, prices] of dateMap) {
            points.push({
              date,
              avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
              min: Math.min(...prices),
              max: Math.max(...prices),
            });
          }
          chartMap[crop] = points;
        }
        setChartData(chartMap);
      }

      // ── Arthi profiles with per-arthi voice updates ──
      const uniqueArthiIds = [...new Set(entries.map(e => e.arthiId).filter(Boolean))];
      if (uniqueArthiIds.length > 0) {
        const { data: arthiUsers } = await supabase
          .from("users")
          .select("id, name, phone, shop_name, shop_number, shop_address, shop_city")
          .in("id", uniqueArthiIds);

        const { data: allVoice } = await supabase
          .from("arthi_voice_updates")
          .select("id, arthi_id, audio_url, transcribed_text, created_at")
          .in("arthi_id", uniqueArthiIds)
          .order("created_at", { ascending: false });

        const voiceByArthi = new Map<number, VoiceUpdate[]>();
        for (const vu of (allVoice ?? [])) {
          if (vu.arthi_id == null) continue;
          if (!voiceByArthi.has(vu.arthi_id)) voiceByArthi.set(vu.arthi_id, []);
          voiceByArthi.get(vu.arthi_id)!.push({
            id: vu.id,
            audio_url: vu.audio_url,
            transcribed_text: vu.transcribed_text,
            created_at: vu.created_at,
          });
        }

        const shopList: ShopProfile[] = (arthiUsers ?? []).map(u => ({
          id: u.id,
          shopName: u.shop_name,
          shopNumber: u.shop_number,
          userName: u.name,
          phone: u.phone,
          shopAddress: u.shop_address,
          shopCity: u.shop_city,
          voiceNotes: voiceByArthi.get(u.id) ?? [],
        }));
        setShops(shopList);
      }

      // ── Auction notices ──
      const seenAuctionIds = new Set<number>();
      setAuctions((auctionsRes.data ?? []).filter(a => {
        if (seenAuctionIds.has(a.id)) return false;
        seenAuctionIds.add(a.id);
        return true;
      }).map(a => {
        const crop = a.crops as unknown as { name?: string; urdu_name?: string } | null;
        const mandi = a.mandis as unknown as { name?: string; city?: string } | null;
        return {
          id: a.id,
          cropName: crop?.urdu_name ?? crop?.name ?? "--",
          mandiName: mandi?.name ?? "--",
          mandiCity: mandi?.city ?? "",
          auctionDate: a.auction_date,
          auctionTime: a.auction_time,
          message: a.message,
        };
      }));

      console.log("[Farmer] total price entries:", entries.length, "shops:", uniqueArthiIds.length);

      // ── Settlements ──
      const rawSettlements = (settlementsRes.data ?? []) as Array<SettlementRow & {
        arthi?: { name?: string; shop_name?: string; shop_address?: string; shop_city?: string } | null;
        crops?: { name?: string; urdu_name?: string } | null;
        settlement_bidders?: Array<{ bidder_name?: string | null; gattu_count?: number | null; cost?: number | null }>;
      }>;
      setSettlements(rawSettlements.map(st => {
        const arthi = st.arthi ?? null;
        const crop = st.crops ?? null;
        const bidders = (st.settlement_bidders ?? []).map(b => ({
          bidder_name: b.bidder_name ?? null,
          gattu_count: b.gattu_count ?? null,
          cost: b.cost ?? null,
        }));
        return {
          id: st.id,
          arthi_id: st.arthi_id,
          crop_id: st.crop_id,
          farmer_landlord_id: st.farmer_landlord_id,
          kacchi_bikri: st.kacchi_bikri,
          pakhta_bikri: st.pakhta_bikri,
          labor_fee: st.labor_fee,
          gaadi_rent: st.gaadi_rent,
          gross_commission: st.gross_commission,
          hospitality_cost: st.hospitality_cost,
          market_fee: st.market_fee,
          net_arthi_commission: st.net_arthi_commission,
          num_labors: st.num_labors,
          gattu_count: st.gattu_count,
          peti_count: st.peti_count,
          receipt_id: st.receipt_id,
          settlement_date: st.settlement_date,
          arthiName: arthi?.name ?? null,
          arthiShopName: arthi?.shop_name ?? null,
          arthiAddress: arthi?.shop_address ?? null,
          arthiCity: arthi?.shop_city ?? null,
          cropName: crop?.urdu_name ?? crop?.name ?? null,
          bidders,
        };
      }));

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Farmer] Data load error:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { loadData(); }, [loadData]);

  // -----------------------------------------------------------------------
  // Logout
  // -----------------------------------------------------------------------
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
  // Chat
  // -----------------------------------------------------------------------
  function openChatWith(shop: ShopProfile) {
    if (!farmerId) return;
    setChatRecipient(shop);
    setChatOpen(true);
  }

  // Group mandi prices by mandi
  const mandiGroups = new Map<string, { mandiName: string; mandiCity: string; prices: MandiPriceEntry[] }>();
  for (const entry of mandiPrices) {
    const key = `${entry.mandiName}|${entry.mandiCity}`;
    if (!mandiGroups.has(key)) {
      mandiGroups.set(key, { mandiName: entry.mandiName, mandiCity: entry.mandiCity, prices: [] });
    }
    mandiGroups.get(key)!.prices.push(entry);
  }

  // Group auctions into today / tomorrow / upcoming
  const todayStr = new Date().toISOString().split("T")[0];
  const tmrDate = new Date(); tmrDate.setDate(tmrDate.getDate() + 1);
  const tomorrowStr = tmrDate.toISOString().split("T")[0];
  const todayAuctions = auctions.filter(a => a.auctionDate === todayStr);
  const tomorrowAuctions = auctions.filter(a => a.auctionDate === tomorrowStr);
  const upcomingAuctions = auctions
    .filter(a => a.auctionDate > tomorrowStr)
    .sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  if (loading) {
    return (
      <div style={{ ...s.page, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#555", fontSize: "1rem" }}>لوڈ ہو رہا ہے...</p>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <header style={s.header}>
        <div>
          <div style={s.headerTitle}>MandiSync — کسان ڈیش بورڈ</div>
          <div style={s.headerSub}>
            <User size={14} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
            {userName || "کسان"}
          </div>
        </div>
        <button onClick={handleLogout} style={s.logoutBtn}>
          <LogOut size={16} /> لاگ آؤٹ
        </button>
      </header>

      <div style={s.content}>
        {/* ── Error Banner ── */}
        {error && (
          <div style={{
            background: "#fff3f3", border: "1.5px solid #cc0000", borderRadius: 12,
            padding: "0.85rem 1.1rem", marginBottom: "1.5rem", color: "#cc0000",
          }}>
            <strong>خرابی:</strong> {error}
          </div>
        )}

        {/* ── Section 1: Mandi Prices by City ── */}
        <div style={s.section}>
          <div style={s.sectionTitle}><Building size={18} /> منڈی نرخ بلحاظ شہر</div>
          {mandiGroups.size === 0 ? (
            <div style={s.emptyState}>کوئی منڈی نرخ دستیاب نہیں</div>
          ) : (
            <div style={s.grid}>
              {[...mandiGroups.entries()].map(([key, group]) => (
                <div key={key} style={s.mandiCard}>
                  <div style={{ fontWeight: 700, color: "#006633", fontSize: "1rem" }}>
                    {group.mandiName}
                  </div>
                  {group.mandiCity && (
                    <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 2, marginBottom: 8 }}>
                      {group.mandiCity}
                    </div>
                  )}
                  {group.prices.map(p => (
                    <div key={p.id} style={{
                      display: "flex", justifyContent: "space-between",
                      padding: "4px 0", borderBottom: "1px solid #f0f0f0",
                      fontSize: "0.85rem",
                    }}>
                      <span style={{ color: "#333" }}>{p.cropName}</span>
                      <span style={{ fontWeight: 600, color: "#006633" }}>{fmtCurrency(p.price)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Section 2: Arthi Cards with Voice Notes ── */}
        {shops.length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}><Building size={18} /> منڈی آرتھی فہرست</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {shops.map(shop => (
                <div key={shop.id} style={s.shopCard}>
                  {/* Shop info row */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                        {shop.shopName ?? shop.userName ?? "آرتھی"}
                      </div>
                      {shop.userName && shop.shopName && (
                        <div style={{ fontSize: "0.8rem", color: "#666", marginTop: 2 }}>
                          {shop.userName}
                        </div>
                      )}
                      {shop.shopNumber && (
                        <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 2 }}>
                          دکان نمبر {shop.shopNumber}
                        </div>
                      )}
                      {shop.shopAddress && (
                        <div style={{ fontSize: "0.78rem", color: "#666", marginTop: 2 }}>
                          <MapPin size={11} style={{ display: "inline" }} /> {shop.shopAddress}{shop.shopCity ? `، ${shop.shopCity}` : ""}
                        </div>
                      )}
                      {shop.phone && (
                        <div style={{ fontSize: "0.75rem", color: "#888", marginTop: 2, direction: "ltr", textAlign: "right" }}>
                          {shop.phone}
                        </div>
                      )}
                    </div>
                    <button style={s.iconBtn} onClick={() => openChatWith(shop)}>
                      <MessageSquare size={14} /> پیغام
                    </button>
                  </div>

                  {/* Embedded voice notes for this arthi */}
                  {shop.voiceNotes.length > 0 && (
                    <div style={{ marginTop: "0.75rem", borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
                      <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#006633", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 4 }}>
                        <Volume2 size={14} /> آواز اپ ڈیٹس
                      </div>
                      {shop.voiceNotes.map(vu => (
                        <div key={vu.id} style={{
                          background: "#f4f7f5", borderRadius: 8,
                          padding: "0.5rem 0.75rem", marginBottom: "0.5rem",
                        }}>
                          <div style={{ fontSize: "0.75rem", color: "#555", marginBottom: 4 }}>
                            {fmtDate(vu.created_at)}
                          </div>
                          {vu.audio_url && (
                            <audio controls preload="none" src={vu.audio_url}
                              style={{ width: "100%", maxWidth: 380, height: 36, marginBottom: 4 }}
                            />
                          )}
                          {vu.transcribed_text && (
                            <div style={{ fontSize: "0.85rem", color: "#1a1a1a", lineHeight: 1.6 }}>
                              {vu.transcribed_text}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Section 3: Price Trend Charts (per crop) ── */}
        {Object.keys(chartData).length > 0 && (
          <div style={s.section}>
            <div style={s.sectionTitle}><TrendingUp size={18} /> روزانہ نرخ رجحان</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {Object.entries(chartData).map(([cropName, points], idx) => {
                const colors = ["#006633", "#D4AF37", "#b8860b", "#cc0000", "#2563eb", "#7c3aed"];
                const lineColor = colors[idx % colors.length];
                return (
                  <div key={cropName}>
                    <div style={{ fontWeight: 700, color: "#006633", fontSize: "0.95rem", marginBottom: "0.5rem" }}>
                      {cropName}
                    </div>
                    <div style={s.chartWrap}>
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={points}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                          <XAxis dataKey="date" fontSize={11} tick={{ fill: "#555" }} />
                          <YAxis fontSize={11} tick={{ fill: "#555" }} />
                          <Tooltip
                            formatter={(value, name) => {
                              const labels: Record<string, string> = { avg: "اوسط", min: "کم", max: "زیادہ" };
                              return [`Rs. ${value}`, labels[String(name)] ?? String(name)];
                            }}
                            contentStyle={{ borderRadius: 8, border: "1px solid #D4AF37" }}
                          />
                          <Legend
                            formatter={(value) => {
                              const labels: Record<string, string> = { avg: "اوسط", min: "کم", max: "زیادہ" };
                              return labels[String(value)] ?? String(value);
                            }}
                          />
                          <Line
                            type="monotone" dataKey="avg" stroke={lineColor}
                            strokeWidth={2} dot={{ fill: "#D4AF37", r: 4 }}
                            activeDot={{ r: 6, fill: lineColor }}
                          />
                          <Line type="monotone" dataKey="min" stroke="#b8860b" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                          <Line type="monotone" dataKey="max" stroke="#cc0000" strokeWidth={1} strokeDasharray="4 4" dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Section 4: Auction Notices (Today & Tomorrow) ── */}
        <div style={s.section}>
          <div style={s.sectionTitle}><Calendar size={18} /> نیلامی کی اطلاعات</div>
          {todayAuctions.length === 0 && tomorrowAuctions.length === 0 && upcomingAuctions.length === 0 ? (
            <div style={s.emptyState}>کوئی آنے والی نیلامی نہیں</div>
          ) : (
            <>
              {todayAuctions.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#D4AF37", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <Calendar size={15} /> آج
                  </div>
                  <div style={s.grid}>
                    {todayAuctions.map(a => (
                      <div key={a.id} style={s.auctionCard}>
                        <div style={{ fontWeight: 700, color: "#006633", fontSize: "1rem" }}>{a.cropName}</div>
                        <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 4 }}>
                          <Building size={12} style={{ display: "inline" }} /> {a.mandiName}{a.mandiCity ? `, ${a.mandiCity}` : ""}
                        </div>
                        <div style={{ fontSize: "0.85rem", marginTop: 6 }}>
                          <Calendar size={13} style={{ display: "inline" }} /> {fmtDate(a.auctionDate)} — {a.auctionTime}
                        </div>
                        {a.message && (
                          <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 6, borderTop: "1px solid #eee", paddingTop: 6 }}>
                            {a.message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tomorrowAuctions.length > 0 && (
                <div style={{ marginBottom: "1.25rem" }}>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#006633", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <Calendar size={15} /> کل
                  </div>
                  <div style={s.grid}>
                    {tomorrowAuctions.map(a => (
                      <div key={a.id} style={s.auctionCard}>
                        <div style={{ fontWeight: 700, color: "#006633", fontSize: "1rem" }}>{a.cropName}</div>
                        <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 4 }}>
                          <Building size={12} style={{ display: "inline" }} /> {a.mandiName}{a.mandiCity ? `, ${a.mandiCity}` : ""}
                        </div>
                        <div style={{ fontSize: "0.85rem", marginTop: 6 }}>
                          <Calendar size={13} style={{ display: "inline" }} /> {fmtDate(a.auctionDate)} — {a.auctionTime}
                        </div>
                        {a.message && (
                          <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 6, borderTop: "1px solid #eee", paddingTop: 6 }}>
                            {a.message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {upcomingAuctions.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#555", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <Calendar size={15} /> آنے والی نیلامیاں
                  </div>
                  <div style={s.grid}>
                    {upcomingAuctions.map(a => (
                      <div key={a.id} style={s.auctionCard}>
                        <div style={{ fontWeight: 700, color: "#006633", fontSize: "1rem" }}>{a.cropName}</div>
                        <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 4 }}>
                          <Building size={12} style={{ display: "inline" }} /> {a.mandiName}{a.mandiCity ? `, ${a.mandiCity}` : ""}
                        </div>
                        <div style={{ fontSize: "0.85rem", marginTop: 6 }}>
                          <Calendar size={13} style={{ display: "inline" }} /> {fmtDate(a.auctionDate)} — {a.auctionTime}
                        </div>
                        {a.message && (
                          <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 6, borderTop: "1px solid #eee", paddingTop: 6 }}>
                            {a.message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Section 5: Settlements ── */}
        <div style={s.section}>
          <div style={s.sectionTitle}><FileText size={18} /> سیٹلمنٹ سلپس</div>
          {settlements.length === 0 ? (
            <div style={s.emptyState}>ابھی تک کوئی سیٹلمنٹ نہیں</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {settlements.map(st => (
                <div key={st.id} style={s.settlementRow} onClick={() => setSelectedSettlement(st)}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{fmtCurrency(st.pakhta_bikri)}</div>
                    <div style={{ fontSize: "0.8rem", color: "#555" }}>
                      {fmtDate(st.settlement_date)}
                      {st.cropName && <span style={{ marginInlineStart: "0.5rem", color: "#006633", fontWeight: 600 }}>{st.cropName}</span>}
                    </div>
                    {st.arthiShopName && (
                      <div style={{ fontSize: "0.78rem", color: "#777", marginTop: 2 }}>
                        <Store size={11} style={{ display: "inline" }} /> {st.arthiShopName}
                        {st.arthiCity && <span style={{ marginInlineStart: "0.3rem" }}>({st.arthiCity})</span>}
                      </div>
                    )}
                  </div>
                  <FileText size={18} color="#006633" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Settlement Detail Modal ── */}
      {selectedSettlement && (
        <div style={s.modal} onClick={() => setSelectedSettlement(null)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>سیٹلمنٹ کی تفصیل</div>

            {/* Arthi / Shop Info */}
            {(selectedSettlement.arthiName || selectedSettlement.arthiShopName) && (
              <div style={{ background: "#f0f7f4", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1rem", border: "1px solid #c8e6c9" }}>
                <div style={{ fontWeight: 700, color: "#006633", fontSize: "0.95rem" }}>
                  <Store size={14} style={{ display: "inline" }} /> {selectedSettlement.arthiShopName || selectedSettlement.arthiName}
                </div>
                {selectedSettlement.arthiName && selectedSettlement.arthiShopName && (
                  <div style={{ fontSize: "0.8rem", color: "#555" }}>{selectedSettlement.arthiName}</div>
                )}
                {selectedSettlement.arthiAddress && (
                  <div style={{ fontSize: "0.8rem", color: "#555", marginTop: 2 }}>
                    <MapPin size={12} style={{ display: "inline" }} /> {selectedSettlement.arthiAddress}
                    {selectedSettlement.arthiCity && <span>, {selectedSettlement.arthiCity}</span>}
                  </div>
                )}
              </div>
            )}

            {/* Crop info */}
            {selectedSettlement.cropName && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1.5px solid #006633", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 600 }}>فصل</span>
                <span style={{ fontWeight: 700, color: "#006633" }}>{selectedSettlement.cropName}</span>
              </div>
            )}

            {/* Bidder list */}
            {selectedSettlement.bidders.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontWeight: 700, color: "#006633", fontSize: "0.9rem", marginBottom: "0.5rem" }}>خریداروں کی فہرست</div>
                {selectedSettlement.bidders.map((b, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.35rem 0.5rem", background: i % 2 === 0 ? "#f9faf9" : "#fff", borderRadius: 6, fontSize: "0.85rem" }}>
                    <span>{b.bidder_name ?? "نامعلوم"}</span>
                    <span style={{ color: "#555" }}>{b.gattu_count ?? 0} گٹے</span>
                    <span style={{ fontWeight: 600 }}>{fmtCurrency(b.cost)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0.5rem", background: "#006633", borderRadius: 6, color: "#fff", fontWeight: 700, fontSize: "0.85rem", marginTop: "0.3rem" }}>
                  <span>کل کچّی بکری</span>
                  <span>{fmtCurrency(selectedSettlement.kacchi_bikri)}</span>
                </div>
              </div>
            )}

            {[
              ["کچّی برکی", fmtCurrency(selectedSettlement.kacchi_bikri)],
              ["پختہ برکی (کسان کی ادائیگی)", fmtCurrency(selectedSettlement.pakhta_bikri)],
              ["لیبر فیس", fmtCurrency(selectedSettlement.labor_fee)],
              ["گروس کمیشن (6%)", fmtCurrency(selectedSettlement.gross_commission)],
              ["منڈی فیس", fmtCurrency(selectedSettlement.market_fee)],
              ["آرتھی نیٹ کمیشن", fmtCurrency(selectedSettlement.net_arthi_commission)],
              ["گاڑی کرایہ", fmtCurrency(selectedSettlement.gaadi_rent)],
              ["مہمان نوازی", fmtCurrency(selectedSettlement.hospitality_cost)],
              ["گٹو", `${selectedSettlement.gattu_count ?? 0}`],
              ["پیٹی", `${selectedSettlement.peti_count ?? 0}`],
              ["تاریخ", fmtDate(selectedSettlement.settlement_date)],
            ].map(([label, val], i) => (
              <div key={i} style={s.modalRow}>
                <span>{label}</span>
                <span style={{ fontWeight: 600 }}>{val}</span>
              </div>
            ))}
            <button style={s.modalBtn} onClick={() => window.print()}>پرنٹ کریں</button>
            <button
              style={{ ...s.modalBtn, background: "#fff", color: "#006633", border: "1.5px solid #006633", marginTop: "0.5rem" }}
              onClick={() => setSelectedSettlement(null)}
            >
              بند کریں
            </button>
          </div>
        </div>
      )}

      {/* ── Chat Drawer ── */}
      {chatOpen && chatRecipient && farmerId && (
        <ChatDrawer
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
          currentUserId={farmerId}
          recipientId={chatRecipient.id}
          recipientName={chatRecipient.userName ?? chatRecipient.shopName}
        />
      )}
    </div>
  );
}
