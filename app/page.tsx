import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Role → dashboard route map (same as proxy.ts / login page)
// ---------------------------------------------------------------------------

const ROLE_ROUTES: Record<string, string> = {
  arthi: "/dashboard/arthi",
  farmer: "/dashboard/farmer",
  farmer_landlord: "/dashboard/farmer",
  bidder: "/dashboard/bidder",
  buyer: "/dashboard/bidder",
};

// ---------------------------------------------------------------------------
// Root page — server-side redirect based on auth + role
// ---------------------------------------------------------------------------

export default async function RootPage() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth/login");
    }

    // Resolve role from user_metadata (set during signup)
    const role = user.user_metadata?.role as string | undefined;
    const destination = (role && ROLE_ROUTES[role]) || "/auth/login";

    redirect(destination);
  } catch {
    // Supabase unreachable or config issue — send to login
    redirect("/auth/login");
  }
}
