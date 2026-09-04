-- ============================================================================
-- COPY THIS ENTIRE FILE INTO: Supabase Dashboard → SQL Editor → Run
-- This fixes ALL dashboards: Farmer, Bidder, Arthi
-- ============================================================================

-- ═══ PART 1: Enable RLS on all tables ═══
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arthi_farmer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arthi_voice_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_monthly_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandi_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chatbot_knowledge ENABLE ROW LEVEL SECURITY;

-- ═══ PART 2: SELECT policies (read access) ═══

-- Users: everyone can read (needed for name display, profile loading, resolver)
DROP POLICY IF EXISTS "users_select_all" ON public.users;
CREATE POLICY "users_select_all" ON public.users FOR SELECT TO authenticated USING (true);

-- Arthi-Farmer contacts: everyone can read (resolver needs this)
DROP POLICY IF EXISTS "arthi_contacts_select_all" ON public.arthi_farmer_contacts;
CREATE POLICY "arthi_contacts_select_all" ON public.arthi_farmer_contacts FOR SELECT TO authenticated USING (true);

-- Profiles: skip if table doesn't exist
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname='public' AND tablename='profiles') THEN
    EXECUTE 'DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles';
    EXECUTE 'CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

-- Voice updates: everyone can read (farmer sees arthi voice notes)
DROP POLICY IF EXISTS "voice_updates_select_all" ON public.arthi_voice_updates;
CREATE POLICY "voice_updates_select_all" ON public.arthi_voice_updates FOR SELECT TO authenticated USING (true);

-- Crop arrivals: everyone can read (arthi sees own, farmer/bidder can see)
DROP POLICY IF EXISTS "arrivals_select_all" ON public.crop_arrivals;
CREATE POLICY "arrivals_select_all" ON public.crop_arrivals FOR SELECT TO authenticated USING (true);

-- Settlements: arthi OR farmer can read own
DROP POLICY IF EXISTS "settlements_select_own" ON public.settlements;
CREATE POLICY "settlements_select_own" ON public.settlements FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Auction notices: everyone can read (farmer + bidder see upcoming auctions)
DROP POLICY IF EXISTS "auction_notices_select_all" ON public.auction_notices;
CREATE POLICY "auction_notices_select_all" ON public.auction_notices FOR SELECT TO authenticated USING (true);

-- Receipts: arthi or farmer reads own
DROP POLICY IF EXISTS "receipts_select_own" ON public.receipts;
CREATE POLICY "receipts_select_own" ON public.receipts FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Invoices: arthi or farmer reads own
DROP POLICY IF EXISTS "invoices_select_own" ON public.invoices;
CREATE POLICY "invoices_select_own" ON public.invoices FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Monthly expenses: arthi reads own
DROP POLICY IF EXISTS "expenses_select_own" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_select_own" ON public.shop_monthly_expenses FOR SELECT TO authenticated
  USING (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Messages: sender or receiver reads
DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
CREATE POLICY "messages_select_own" ON public.messages FOR SELECT TO authenticated
  USING (
    sender_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR receiver_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- Notifications: user reads own
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Price history: everyone reads
DROP POLICY IF EXISTS "price_history_select_all" ON public.price_history;
CREATE POLICY "price_history_select_all" ON public.price_history FOR SELECT TO authenticated USING (true);

-- Chatbot knowledge: everyone reads
DROP POLICY IF EXISTS "chatbot_knowledge_select_all" ON public.chatbot_knowledge;
CREATE POLICY "chatbot_knowledge_select_all" ON public.chatbot_knowledge FOR SELECT TO authenticated USING (true);

-- Mandi prices: everyone reads (farmer dashboard shows prices)
DROP POLICY IF EXISTS "mandi_prices_select_all" ON public.mandi_prices;
CREATE POLICY "mandi_prices_select_all" ON public.mandi_prices FOR SELECT TO authenticated USING (true);

-- ═══ PART 3: INSERT policies (write access) ═══

DROP POLICY IF EXISTS "voice_updates_insert" ON public.arthi_voice_updates;
CREATE POLICY "voice_updates_insert" ON public.arthi_voice_updates FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "arrivals_insert" ON public.crop_arrivals;
CREATE POLICY "arrivals_insert" ON public.crop_arrivals FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "settlements_insert" ON public.settlements;
CREATE POLICY "settlements_insert" ON public.settlements FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "receipts_insert" ON public.receipts;
CREATE POLICY "receipts_insert" ON public.receipts FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "invoices_insert" ON public.invoices;
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "expenses_insert" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_insert" ON public.shop_monthly_expenses FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "auction_notices_insert" ON public.auction_notices;
CREATE POLICY "auction_notices_insert" ON public.auction_notices FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "arthi_contacts_insert" ON public.arthi_farmer_contacts;
CREATE POLICY "arthi_contacts_insert" ON public.arthi_farmer_contacts FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "mandi_prices_insert" ON public.mandi_prices;
CREATE POLICY "mandi_prices_insert" ON public.mandi_prices FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ═══ PART 4: UPDATE policies ═══

DROP POLICY IF EXISTS "arrivals_update" ON public.crop_arrivals;
CREATE POLICY "arrivals_update" ON public.crop_arrivals FOR UPDATE TO authenticated
  USING (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "messages_update" ON public.messages;
CREATE POLICY "messages_update" ON public.messages FOR UPDATE TO authenticated
  USING (receiver_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ═══ PART 5: Auto-create users row on signup ═══
-- This trigger fires whenever a new auth user is created and inserts a
-- corresponding row into the public.users table so dashboards can load.

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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
