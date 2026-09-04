"use client";

import { useState, useEffect, useCallback, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Calendar, Building, Phone, LogOut, User, FileText, Clock,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuctionItem {
  id: number;
  cropName: string;
  cropUrdu: string;
  mandiName: string;
  mandiCity: string;
  auctionDate: string;
  auctionTime: string;
  message: string | null;
  arthiId: number | null;
  arthiName: string | null;
  arthiPhone: string | null;
  arthiShopName: string | null;
  arthiShopNumber: string | null;
  arrivalGattu: number | null;
  arrivalPeti: number | null;
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
  content: { maxWidth: 900, margin: "0 auto", padding: "1.5rem 1rem" },
  sectionTitle: {
    fontSize: "1.1rem", fontWeight: 700, color: "#006633",
    marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: 8,
  },
  feed: { display: "flex", flexDirection: "column", gap: "1rem" },
  card: {
    background: "#fff", borderRadius: 12, padding: "1.25rem 1.5rem",
    border: "1.5px solid #D4AF37", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  },
  cropRow: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: "0.5rem",
  },
  cropName: { fontSize: "1.1rem", fontWeight: 700, color: "#006633" },
  badge: {
    background: "#D4AF37", color: "#1a1a1a", fontSize: "0.7rem",
    fontWeight: 600, padding: "2px 10px", borderRadius: 4,
  },
  detailRow: {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: "0.85rem", color: "#555", marginTop: 4,
  },
  arthiSection: {
    marginTop: "0.75rem", paddingTop: "0.75rem",
    borderTop: "1px solid #eee",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  phoneBtn: {
    display: "flex", alignItems: "center", gap: 6,
    background: "#006633", color: "#fff", border: "none",
    padding: "0.5rem 1rem", borderRadius: 8, fontWeight: 600,
    fontSize: "0.85rem", textDecoration: "none",
  },
  qtyBox: {
    display: "flex", gap: "1rem", marginTop: "0.5rem",
    fontSize: "0.85rem",
  },
  qtyItem: {
    background: "#f4f7f5", padding: "0.3rem 0.75rem",
    borderRadius: 6, fontWeight: 600, color: "#006633",
  },
  emptyState: {
    textAlign: "center", color: "#999", padding: "3rem", fontSize: "0.95rem",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null): string {
  if (!iso) return "--";
  try {
    return new Date(iso).toLocaleDateString("ur-PK", {
      weekday: "short", day: "numeric", month: "long", year: "numeric",
    });
  } catch { return iso; }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BidderDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/auth/login"); return; }

      const { data: profile } = await supabase
        .from("users").select("id, name").eq("auth_id", user.id).maybeSingle();
      if (profile) setUserName(profile.name ?? "");

      // Fetch auction notices with related data
      const { data: notices } = await supabase
        .from("auction_notices")
        .select(`
          *,
          crops(name, urdu_name),
          mandis(name, city),
          crop_arrivals(gattu_count, peti_count)
        `)
        .gte("auction_date", new Date().toISOString().split("T")[0])
        .order("auction_date", { ascending: true });

      // Resolve arthi names/phones for all unique arthi_ids
      const arthiIds = [...new Set((notices ?? []).map(n => n.arthi_id).filter(Boolean))] as number[];
      const arthiMap = new Map<number, { name: string | null; phone: string | null; shop_name: string | null; shop_number: string | null }>();

      if (arthiIds.length > 0) {
        const { data: arthiUsers } = await supabase
          .from("users").select("id, name, phone, shop_name, shop_number").in("id", arthiIds);
        for (const u of arthiUsers ?? []) {
          arthiMap.set(u.id, { name: u.name, phone: u.phone, shop_name: u.shop_name, shop_number: u.shop_number });
        }
      }

      setAuctions((notices ?? []).map(n => {
        const crop = n.crops as unknown as { name?: string; urdu_name?: string } | null;
        const mandi = n.mandis as unknown as { name?: string; city?: string } | null;
        const arrival = n.crop_arrivals as unknown as { gattu_count?: number | null; peti_count?: number | null } | null;
        const arthi = n.arthi_id ? arthiMap.get(n.arthi_id) ?? null : null;

        return {
          id: n.id,
          cropName: crop?.name ?? "--",
          cropUrdu: crop?.urdu_name ?? crop?.name ?? "--",
          mandiName: mandi?.name ?? "--",
          mandiCity: mandi?.city ?? "",
          auctionDate: n.auction_date,
          auctionTime: n.auction_time,
          message: n.message,
          arthiId: n.arthi_id,
          arthiName: arthi?.name ?? null,
          arthiPhone: arthi?.phone ?? null,
          arthiShopName: arthi?.shop_name ?? null,
          arthiShopNumber: arthi?.shop_number ?? null,
          arrivalGattu: arrival?.gattu_count ?? null,
          arrivalPeti: arrival?.peti_count ?? null,
        };
      }));
    } catch (err) {
      console.error("[Bidder] Data load error:", err);
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
          <div style={s.headerTitle}>MandiSync — بولی لگانے والا ڈیش بورڈ</div>
          <div style={s.headerSub}>
            <User size={14} style={{ display: "inline", verticalAlign: "middle" }} />{" "}
            {userName || "خریدار"}
          </div>
        </div>
        <button onClick={handleLogout} style={s.logoutBtn}>
          <LogOut size={16} /> لاگ آؤٹ
        </button>
      </header>

      <div style={s.content}>
        <div style={s.sectionTitle}>
          <FileText size={18} /> آنے والی نیلامیاں
        </div>

        {auctions.length === 0 ? (
          <div style={s.emptyState}>
            فی الحال کوئی نیلامی دستیاب نہیں۔ براہ کرم بعد میں دوبارہ چیک کریں۔
          </div>
        ) : (
          <div style={s.feed}>
            {auctions.map(a => (
              <div key={a.id} style={s.card}>
                {/* Crop & date row */}
                <div style={s.cropRow}>
                  <div style={s.cropName}>{a.cropUrdu}</div>
                  <span style={s.badge}>
                    <Clock size={11} style={{ display: "inline" }} /> {a.auctionTime}
                  </span>
                </div>

                {/* Mandi location */}
                <div style={s.detailRow}>
                  <Building size={14} />
                  {a.mandiName}{a.mandiCity ? `, ${a.mandiCity}` : ""}
                </div>

                {/* Auction date */}
                <div style={s.detailRow}>
                  <Calendar size={14} />
                  {fmtDate(a.auctionDate)}
                </div>

                {/* Arrival quantity */}
                {(a.arrivalGattu || a.arrivalPeti) && (
                  <div style={s.qtyBox}>
                    {a.arrivalGattu ? <span style={s.qtyItem}>گٹو: {a.arrivalGattu}</span> : null}
                    {a.arrivalPeti ? <span style={s.qtyItem}>پیٹی: {a.arrivalPeti}</span> : null}
                  </div>
                )}

                {/* Message */}
                {a.message && (
                  <div style={{ fontSize: "0.85rem", color: "#555", marginTop: "0.5rem", lineHeight: 1.5 }}>
                    {a.message}
                  </div>
                )}

                {/* Arthi contact */}
                {a.arthiName && (
                  <div style={s.arthiSection}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                        {a.arthiShopName ?? a.arthiName}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#555" }}>
                        {a.arthiName}{a.arthiShopNumber ? ` — دکان نمبر ${a.arthiShopNumber}` : ""} — آرتھی
                      </div>
                    </div>
                    {a.arthiPhone ? (
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#006633" }}>
                        <Phone size={13} style={{ display: "inline", verticalAlign: "middle" }} /> {a.arthiPhone}
                      </div>
                    ) : (
                      <span style={{ fontSize: "0.8rem", color: "#999" }}>فون نمبر دستیاب نہیں</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
