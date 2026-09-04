"use client";

import { useState, Suspense, type FormEvent, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LogIn } from "lucide-react";

// ---------------------------------------------------------------------------
// Role → dashboard route map
// ---------------------------------------------------------------------------

const ROLE_ROUTES: Record<string, string> = {
  arthi: "/dashboard/arthi",
  farmer: "/dashboard/farmer",
  farmer_landlord: "/dashboard/farmer",
  bidder: "/dashboard/bidder",
  buyer: "/dashboard/bidder",
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
    maxWidth: 440,
    background: "#fff",
    borderRadius: 16,
    padding: "2.5rem 2rem",
    boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
    border: "2px solid #D4AF37",
  },
  header: {
    textAlign: "center",
    marginBottom: "2rem",
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
    gap: "1rem",
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
    padding: "0.7rem 0.85rem",
    border: "1.5px solid #dde3df",
    borderRadius: 8,
    fontSize: "0.95rem",
    outline: "none",
    transition: "border-color 0.2s",
    direction: "ltr",
    textAlign: "left",
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
// Inner form component (calls useSearchParams — requires Suspense boundary)
// ---------------------------------------------------------------------------

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("براہ کرم ای میل اور پاس ورڈ درج کریں");
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();

      // Step 1: authenticate
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (authError || !authData.user) {
        setError(
          authError?.message ?? "لاگ ان ناکام ہوا۔ براہ کرم دوبارہ کوشش کریں"
        );
        return;
      }

      // Step 2: resolve role from public.users via auth_id
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("auth_id", authData.user.id)
        .maybeSingle();

      const role = profile?.role ?? authData.user.user_metadata?.role;
      const destination =
        (role && ROLE_ROUTES[role as string]) ||
        redirectTo ||
        "/dashboard/farmer";

      router.push(destination);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "غیر متوقع خرابی پیش آئی"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.wrapper}>
      <div style={s.card}>
        {/* Header */}
        <div style={s.header}>
          <h1 style={s.title}>MandiSync</h1>
          <p style={s.subtitle}>لاگ ان کریں</p>
          <span style={s.badge}>MANDI SYNC</span>
        </div>

        {/* Error banner */}
        {error && <div style={s.errorBox}>{error}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit} style={s.form}>
          <div>
            <label htmlFor="email" style={s.label}>
              ای میل ایڈریس
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              style={s.input}
              autoComplete="email"
              dir="ltr"
              required
            />
          </div>

          <div>
            <label htmlFor="password" style={s.label}>
              پاس ورڈ
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={s.input}
              autoComplete="current-password"
              dir="ltr"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={loading ? s.buttonDisabled : s.button}
          >
            <LogIn size={18} />
            {loading ? "لاگ ان ہو رہا ہے..." : "لاگ ان کریں"}
          </button>
        </form>

        {/* Footer link */}
        <p style={s.footer}>
          نیا اکاؤنٹ بنائیں{" "}
          <a href="/auth/signup" style={s.link}>
            یہاں کلک کریں
          </a>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Login Page — wraps LoginFormContent in a Suspense boundary
// ---------------------------------------------------------------------------

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div style={s.wrapper}>
          <div style={{ ...s.card, textAlign: "center", color: "#555" }}>
            لوڈ ہو رہا ہے...
          </div>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
