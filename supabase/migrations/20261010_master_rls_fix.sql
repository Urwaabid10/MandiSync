-- ============================================================================
-- MASTER RLS FIX — Resolves all dashboard visibility issues
-- 
-- Fixes:
--   1. New farmer accounts can now see mandi rates, voice notes, 7-day charts
--   2. Settlement slips only visible to the owning farmer and arthi
--   3. New bidder accounts can now see upcoming biddings
--
-- Root cause: The users table had no INSERT policy for authenticated users.
-- When the handle_new_user() trigger failed, the signup fallback upsert was
-- silently blocked by RLS — leaving no users row, so dashboards loaded
-- nothing (early return on null profile).
--
-- Additionally, crops, mandis, and settlement_bidders SELECT policies were
-- only in some migration files and could be missing depending on apply order.
--
-- COPY THIS ENTIRE FILE INTO: Supabase Dashboard → SQL Editor → Run
-- ============================================================================

-- ═══ PART 1: Enable RLS on ALL tables ═══
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandi_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arthi_farmer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arthi_voice_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_bidders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_monthly_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_knowledge ENABLE ROW LEVEL SECURITY;

-- ═══ PART 2: SELECT policies (read access) ═══

-- Users: all authenticated users can read (needed for name display, resolver)
DROP POLICY IF EXISTS "users_select_all" ON public.users;
CREATE POLICY "users_select_all" ON public.users
  FOR SELECT TO authenticated USING (true);

-- Crops: all authenticated users can read (needed for mandi_prices & settlement joins)
DROP POLICY IF EXISTS "crops_select_all" ON public.crops;
CREATE POLICY "crops_select_all" ON public.crops
  FOR SELECT TO authenticated USING (true);

-- Mandis: all authenticated users can read (needed for mandi name/city display)
DROP POLICY IF EXISTS "mandis_select_all" ON public.mandis;
CREATE POLICY "mandis_select_all" ON public.mandis
  FOR SELECT TO authenticated USING (true);

-- Mandi prices: all authenticated users can read (farmer dashboard shows prices)
DROP POLICY IF EXISTS "mandi_prices_select_all" ON public.mandi_prices;
CREATE POLICY "mandi_prices_select_all" ON public.mandi_prices
  FOR SELECT TO authenticated USING (true);

-- Profiles: all authenticated users can read (dashboard shop cards)
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='profiles') THEN
    EXECUTE 'DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles';
    EXECUTE 'CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- Arthi-Farmer contacts: all authenticated users can read (resolver)
DROP POLICY IF EXISTS "arthi_contacts_select_all" ON public.arthi_farmer_contacts;
CREATE POLICY "arthi_contacts_select_all" ON public.arthi_farmer_contacts
  FOR SELECT TO authenticated USING (true);

-- Voice updates: all authenticated users can read (farmer sees arthi voice notes)
DROP POLICY IF EXISTS "voice_updates_select_all" ON public.arthi_voice_updates;
CREATE POLICY "voice_updates_select_all" ON public.arthi_voice_updates
  FOR SELECT TO authenticated USING (true);

-- Crop arrivals: all authenticated users can read
DROP POLICY IF EXISTS "arrivals_select_all" ON public.crop_arrivals;
CREATE POLICY "arrivals_select_all" ON public.crop_arrivals
  FOR SELECT TO authenticated USING (true);

-- Auction notices: all authenticated users can read (farmer + bidder see auctions)
DROP POLICY IF EXISTS "auction_notices_select_all" ON public.auction_notices;
CREATE POLICY "auction_notices_select_all" ON public.auction_notices
  FOR SELECT TO authenticated USING (true);

-- Settlements: ONLY the owning arthi or farmer can read (NOT all users)
DROP POLICY IF EXISTS "settlements_select_own" ON public.settlements;
DROP POLICY IF EXISTS "settlements_select_arthi" ON public.settlements;
DROP POLICY IF EXISTS "settlements_select_all" ON public.settlements;
CREATE POLICY "settlements_select_own" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Settlement bidders: only visible to the owning arthi or farmer
DROP POLICY IF EXISTS "bidders_select" ON public.settlement_bidders;
DROP POLICY IF EXISTS "bidders_select_own" ON public.settlement_bidders;
CREATE POLICY "bidders_select_own" ON public.settlement_bidders
  FOR SELECT TO authenticated
  USING (
    settlement_id IN (
      SELECT id FROM public.settlements
      WHERE arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
         OR farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    )
  );

-- Receipts: only owning arthi or farmer can read
DROP POLICY IF EXISTS "receipts_select_own" ON public.receipts;
CREATE POLICY "receipts_select_own" ON public.receipts
  FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Invoices: only owning arthi or farmer can read
DROP POLICY IF EXISTS "invoices_select_own" ON public.invoices;
CREATE POLICY "invoices_select_own" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Monthly expenses: only owning arthi can read
DROP POLICY IF EXISTS "expenses_select_own" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_select_own" ON public.shop_monthly_expenses
  FOR SELECT TO authenticated
  USING (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Messages: sender or receiver can read
DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR receiver_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Notifications: user reads own
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Price history: all authenticated users can read
DROP POLICY IF EXISTS "price_history_select_all" ON public.price_history;
CREATE POLICY "price_history_select_all" ON public.price_history
  FOR SELECT TO authenticated USING (true);

-- Chatbot knowledge: all authenticated users can read
DROP POLICY IF EXISTS "chatbot_knowledge_select_all" ON public.chatbot_knowledge;
CREATE POLICY "chatbot_knowledge_select_all" ON public.chatbot_knowledge
  FOR SELECT TO authenticated USING (true);

-- ═══ PART 3: INSERT policies (write access) ═══

-- ★★★ CRITICAL FIX: Users table INSERT for signup flow ★★★
-- Without this, the signup fallback upsert is blocked by RLS when the
-- handle_new_user() trigger fails, leaving no users row for the new account.
-- This is why new farmers/bidders see empty dashboards.
DROP POLICY IF EXISTS "users_insert_auth" ON public.users;
CREATE POLICY "users_insert_auth" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth_id = auth.uid());

-- Users: arthi can update own profile (shop name, address, etc.)
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Voice updates: arthi inserts own voice notes
DROP POLICY IF EXISTS "voice_updates_insert" ON public.arthi_voice_updates;
CREATE POLICY "voice_updates_insert" ON public.arthi_voice_updates
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Crop arrivals: arthi inserts arrivals
DROP POLICY IF EXISTS "arrivals_insert" ON public.crop_arrivals;
CREATE POLICY "arrivals_insert" ON public.crop_arrivals
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Settlements: arthi inserts settlements
DROP POLICY IF EXISTS "settlements_insert" ON public.settlements;
CREATE POLICY "settlements_insert" ON public.settlements
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Settlement bidders: arthi inserts bidders for own settlements
DROP POLICY IF EXISTS "bidders_insert" ON public.settlement_bidders;
DROP POLICY IF EXISTS "bidders_insert_own" ON public.settlement_bidders;
CREATE POLICY "bidders_insert_own" ON public.settlement_bidders
  FOR INSERT TO authenticated
  WITH CHECK (
    settlement_id IN (
      SELECT id FROM public.settlements
      WHERE arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    )
  );

-- Receipts: arthi inserts receipts
DROP POLICY IF EXISTS "receipts_insert" ON public.receipts;
CREATE POLICY "receipts_insert" ON public.receipts
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Invoices: arthi inserts invoices
DROP POLICY IF EXISTS "invoices_insert" ON public.invoices;
CREATE POLICY "invoices_insert" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Monthly expenses: arthi inserts own expenses
DROP POLICY IF EXISTS "expenses_insert" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_insert" ON public.shop_monthly_expenses
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Messages: authenticated user can send messages
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Notifications: system inserts for authenticated users
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Auction notices: arthi inserts notices
DROP POLICY IF EXISTS "auction_notices_insert" ON public.auction_notices;
CREATE POLICY "auction_notices_insert" ON public.auction_notices
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Arthi-Farmer contacts: arthi inserts own contacts
DROP POLICY IF EXISTS "arthi_contacts_insert" ON public.arthi_farmer_contacts;
CREATE POLICY "arthi_contacts_insert" ON public.arthi_farmer_contacts
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Mandi prices: arthi inserts prices
DROP POLICY IF EXISTS "mandi_prices_insert" ON public.mandi_prices;
DROP POLICY IF EXISTS "mandi_prices_insert_arthi" ON public.mandi_prices;
CREATE POLICY "mandi_prices_insert" ON public.mandi_prices
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ═══ PART 4: UPDATE policies ═══

-- Crop arrivals: arthi updates own arrivals (confirm status)
DROP POLICY IF EXISTS "arrivals_update" ON public.crop_arrivals;
CREATE POLICY "arrivals_update" ON public.crop_arrivals
  FOR UPDATE TO authenticated
  USING (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Messages: receiver marks as read
DROP POLICY IF EXISTS "messages_update" ON public.messages;
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (receiver_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Notifications: user marks own as read
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Monthly expenses: arthi updates own (upsert support)
DROP POLICY IF EXISTS "expenses_update_own" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_update_own" ON public.shop_monthly_expenses
  FOR UPDATE TO authenticated
  USING (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()))
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ═══ PART 5: Ensure auto-create trigger exists ═══
-- This trigger fires when a new auth user is created and inserts a
-- corresponding row into public.users so dashboards can load immediately.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (auth_id, name, email, role, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'farmer'),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (auth_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user trigger failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
