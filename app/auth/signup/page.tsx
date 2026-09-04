"use client";

import { useState, type FormEvent, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { User } from "lucide-react";

// ---------------------------------------------------------------------------
// Role options — three clean roles matching dashboard routes
// ---------------------------------------------------------------------------

const ROLE_OPTIONS: { value: string; label: string; english: string }[] = [
  { value: "arthi", label: "آرتھی", english: "Commission Agent" },
  { value: "farmer", label: "کسان", english: "Farmer" },
  { value: "bidder", label: "بولی لگانے والا", english: "Bidder" },
];

const ROLE_ROUTES: Record<string, string> = {
  arthi: "/dashboard/arthi",
  farmer: "/dashboard/farmer",
  bidder: "/dashboard/bidder",
};

// ---------------------------------------------------------------------------
// Inline styles (Government Green theme)
// ---------------------------------------------------------------------------

const s: Record<string, CSSProperties> = {
  wrapper: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(145deg, #004d26 0%, #006633 50%, #008844 100%)",
    padding: "2rem 1rem",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    background: "#fff",
    borderRadius: 16,
    padding: "2.5rem 2rem",
    boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
    border: "2px solid #D4AF37",
  },
  header: {
    textAlign: "center",
    marginBottom: "1.75rem",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 700,
    color: "#006633",
    margin: 0,
    lineHeight: 1.4,
  },
  subtitle: {
    fontSize: "0.95rem",
    color: "#555",
    marginTop: "0.25rem",
  },
  badge: {
    display: "inline-block",
    background: "#D4AF37",
    color: "#1a1a1a",
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "2px 10px",
    borderRadius: 4,
    marginTop: "0.5rem",
    letterSpacing: 0.5,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "0.9rem",
  },
  label: {
    display: "block",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#333",
    marginBottom: "0.35rem",
  },
  input: {
    width: "100%",
    padding: "0.65rem 0.85rem",
    border: "1.5px solid #dde3df",
    borderRadius: 8,
    fontSize: "0.95rem",
    outline: "none",
    transition: "border-color 0.2s",
  },
  inputLtr: {
    width: "100%",
    padding: "0.65rem 0.85rem",
    border: "1.5px solid #dde3df",
    borderRadius: 8,
    fontSize: "0.95rem",
    outline: "none",
    transition: "border-color 0.2s",
    direction: "ltr" as const,
    textAlign: "left" as const,
  },
  select: {
    width: "100%",
    padding: "0.65rem 0.85rem",
    border: "1.5px solid #dde3df",
    borderRadius: 8,
    fontSize: "0.95rem",
    outline: "none",
    background: "#fff",
    transition: "border-color 0.2s",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
  },
  errorBox: {
    background: "#fff0f0",
    border: "1px solid #cc0000",
    borderRadius: 8,
    padding: "0.65rem 0.85rem",
    color: "#cc0000",
    fontSize: "0.85rem",
    lineHeight: 1.5,
  },
  successBox: {
    background: "#f0fff5",
    border: "1px solid #006633",
    borderRadius: 8,
    padding: "0.65rem 0.85rem",
    color: "#006633",
    fontSize: "0.85rem",
    lineHeight: 1.5,
  },
  button: {
    width: "100%",
    padding: "0.8rem",
    background: "#006633",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    transition: "background 0.2s",
    marginTop: "0.5rem",
  },
  buttonDisabled: {
    width: "100%",
    padding: "0.8rem",
    background: "#99b3a6",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: "1rem",
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    cursor: "not-allowed",
    marginTop: "0.5rem",
  },
  footer: {
    textAlign: "center",
    marginTop: "1.5rem",
    fontSize: "0.9rem",
    color: "#555",
  },
  link: {
    color: "#006633",
    fontWeight: 600,
    textDecoration: "underline",
  },
};

// ---------------------------------------------------------------------------
// Signup Page
// ---------------------------------------------------------------------------

export default function SignupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState("");
  const [shopName, setShopName] = useState("");
  const [shopNumber, setShopNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    // Validation
    if (!fullName.trim()) {
      setError("براہ کرم اپنا پورا نام درج کریں");
      return;
    }
    if (!phone.trim()) {
      setError("براہ کرم فون نمبر درج کریں");
      return;
    }
    if (!email.trim()) {
      setError("براہ کرم ای میل درج کریں");
      return;
    }
    if (password.length < 6) {
      setError("پاس ورڈ کم از کم 6 حروف کا ہونا چاہیے");
      return;
    }
    if (password !== confirmPassword) {
      setError("پاس ورڈ مطابقت نہیں رکھتے");
      return;
    }
    if (!role) {
      setError("براہ کرم اپنا کردار منتخب کریں");
      return;
    }
    if (role === "arthi" && !shopName.trim()) {
      setError("براہ کرم دکان کا نام درج کریں");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      const { data: authData, error: signUpError } = await supabase.auth.signUp(
        {
          email,
          password,
          options: {
            data: {
              full_name: fullName,
              phone,
              role,
            },
          },
        }
      );

      if (signUpError) {
        // Detect Supabase email rate-limit errors (HTTP 429 / message match)
        const msg = (signUpError.message ?? "").toLowerCase();
        if (
          msg.includes("rate limit") ||
          msg.includes("too many requests") ||
          msg.includes("too many signup")
        ) {
          setError(
            "ای میل بھیجنے کی حد ختم ہو گئی ہے۔ براہ کرم کچھ دیر بعد دوبارہ کوشش کریں یا لاگ ان کریں۔"
          );
        } else {
          setError(signUpError.message);
        }
        return;
      }

      // Ensure a profile row exists in public.users for this auth user.
      // The DB trigger should auto-create it, but we also insert here as a
      // safety net in case the trigger hasn't fired yet.
      if (authData.user) {
        const userRow: Record<string, unknown> = {
          auth_id: authData.user.id,
          name: fullName,
          email,
          role: role as "arthi" | "farmer" | "bidder" | "farmer_landlord" | "buyer" | null,
          phone: phone || null,
        };
        // Add arthi-specific shop fields
        if (role === "arthi") {
          userRow.shop_name = shopName.trim() || null;
          userRow.shop_number = shopNumber.trim() || null;
        }
        await supabase.from("users").upsert(userRow, { onConflict: "auth_id" });
      }

      // Check if email confirmation is required
      if (!authData.session) {
        setNeedsConfirmation(true);
        return;
      }

      // Session exists — redirect to role dashboard
      const destination = ROLE_ROUTES[role] ?? "/dashboard/farmer";
      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "رجسٹریشن ناکام ہوئی"
      );
    } finally {
      setLoading(false);
    }
  }

  // Show confirmation message if email verification is needed
  if (needsConfirmation) {
    return (
      <div style={s.wrapper}>
        <div style={s.card}>
          <div style={s.header}>
            <h1 style={s.title}>MandiSync</h1>
            <p style={s.subtitle}>اکاؤنٹ بنائیں</p>
          </div>
          <div style={s.successBox}>
            آپ کا اکاؤنٹ بن گیا ہے۔ براہ کرم اپنا ای میل چیک کریں اور اکاؤنٹ
            کی تصدیق کریں۔
          </div>
          <p style={s.footer}>
            <a href="/auth/login" style={s.link}>
              لاگ ان پر واپس جائیں
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.wrapper}>
      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          <h1 style={s.title}>MandiSync</h1>
          <p style={s.subtitle}>نیا اکاؤنٹ بنائیں</p>
          <span style={s.badge}>REGISTER</span>
        </div>

        {/* Error banner */}
        {error && <div style={s.errorBox}>{error}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit} style={s.form}>
          {/* Full Name */}
          <div>
            <label htmlFor="fullName" style={s.label}>
              پورا نام
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="محمد علی"
              style={s.input}
              autoComplete="name"
              required
            />
          </div>

          {/* Phone + Email row */}
          <div style={s.row}>
            <div>
              <label htmlFor="phone" style={s.label}>
                فون نمبر
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+923001234567"
                style={s.inputLtr}
                autoComplete="tel"
                dir="ltr"
                required
              />
            </div>
            <div>
              <label htmlFor="email" style={s.label}>
                ای میل
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
                style={s.inputLtr}
                autoComplete="email"
                dir="ltr"
                required
              />
            </div>
          </div>

          {/* Password row */}
          <div style={s.row}>
            <div>
              <label htmlFor="password" style={s.label}>
                پاس ورڈ
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="کم از کم 6 حروف"
                style={s.inputLtr}
                autoComplete="new-password"
                dir="ltr"
                required
                minLength={6}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" style={s.label}>
                پاس ورڈ کی تصدیق
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="دوبارہ درج کریں"
                style={s.inputLtr}
                autoComplete="new-password"
                dir="ltr"
                required
              />
            </div>
          </div>

          {/* Role selection */}
          <div>
            <label htmlFor="role" style={s.label}>
              کردار منتخب کریں
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={s.select}
              required
            >
              <option value="" disabled>
                -- کردار چنیں --
              </option>
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.english}
                </option>
              ))}
            </select>
          </div>

          {/* Arthi-specific: Shop details */}
          {role === "arthi" && (
            <>
              <div style={{ background: "#f0f7f4", borderRadius: 10, padding: "0.85rem", border: "1px solid #c8e6d0" }}>
                <div style={{ fontSize: "0.8rem", color: "#006633", fontWeight: 600, marginBottom: "0.6rem" }}>
                  آرتھی دکان کی تفصیلات
                </div>
                <div style={s.row}>
                  <div>
                    <label htmlFor="shopName" style={s.label}>
                      دکان کا نام <span style={{ color: "#cc0000" }}>*</span>
                    </label>
                    <input
                      id="shopName"
                      type="text"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="مثلاً: احمد ٹریڈرز"
                      style={s.input}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="shopNumber" style={s.label}>
                      دکان نمبر
                    </label>
                    <input
                      id="shopNumber"
                      type="text"
                      value={shopNumber}
                      onChange={(e) => setShopNumber(e.target.value)}
                      placeholder="مثلاً: D-42"
                      style={s.inputLtr}
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            style={loading ? s.buttonDisabled : s.button}
          >
            <User size={18} />
            {loading ? "اکاؤنٹ بن رہا ہے..." : "اکاؤنٹ بنائیں"}
          </button>
        </form>

        {/* Footer link */}
        <p style={s.footer}>
          پہلے سے اکاؤنٹ موجود ہے؟{" "}
          <a href="/auth/login" style={s.link}>
            لاگ ان کریں
          </a>
        </p>
      </div>
    </div>
  );
}
