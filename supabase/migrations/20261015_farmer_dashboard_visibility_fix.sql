-- ============================================================================
-- FARMER DASHBOARD VISIBILITY FIX
-- Run this in: Supabase Dashboard → SQL Editor → Run
--
-- Fixes: Arthi-entered mandi rates, voice notes, and auction notices
--        not showing up on farmer dashboards.
--
-- Root cause: SELECT policies on mandi_prices, arthi_voice_updates,
--             auction_notices, crops, and mandis must allow ALL authenticated
--             users to read. Without these, farmers see empty dashboards.
-- ============================================================================

-- ═══ PART 1: Enable RLS ═══
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandi_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arthi_voice_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_bidders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arthi_farmer_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_monthly_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- ═══ PART 2: SELECT policies — farmer must read these ═══

-- ★ mandi_prices: ALL authenticated users read (farmer sees mandi rates)
DROP POLICY IF EXISTS "mandi_prices_select_all" ON public.mandi_prices;
CREATE POLICY "mandi_prices_select_all" ON public.mandi_prices
  FOR SELECT TO authenticated USING (true);

-- ★ arthi_voice_updates: ALL authenticated users read (farmer sees voice notes)
DROP POLICY IF EXISTS "voice_updates_select_all" ON public.arthi_voice_updates;
CREATE POLICY "voice_updates_select_all" ON public.arthi_voice_updates
  FOR SELECT TO authenticated USING (true);

-- ★ auction_notices: ALL authenticated users read (farmer sees upcoming nelami)
DROP POLICY IF EXISTS "auction_notices_select_all" ON public.auction_notices;
CREATE POLICY "auction_notices_select_all" ON public.auction_notices
  FOR SELECT TO authenticated USING (true);

-- ★ crops: ALL authenticated users read (needed for join on crop names)
DROP POLICY IF EXISTS "crops_select_all" ON public.crops;
CREATE POLICY "crops_select_all" ON public.crops
  FOR SELECT TO authenticated USING (true);

-- ★ mandis: ALL authenticated users read (needed for join on mandi name/city)
DROP POLICY IF EXISTS "mandis_select_all" ON public.mandis;
CREATE POLICY "mandis_select_all" ON public.mandis
  FOR SELECT TO authenticated USING (true);

-- users: ALL authenticated users read (farmer loads arthi shop profiles)
DROP POLICY IF EXISTS "users_select_all" ON public.users;
CREATE POLICY "users_select_all" ON public.users
  FOR SELECT TO authenticated USING (true);

-- arthi_farmer_contacts: ALL authenticated users read
DROP POLICY IF EXISTS "arthi_contacts_select_all" ON public.arthi_farmer_contacts;
CREATE POLICY "arthi_contacts_select_all" ON public.arthi_farmer_contacts
  FOR SELECT TO authenticated USING (true);

-- crop_arrivals: ALL authenticated users read
DROP POLICY IF EXISTS "arrivals_select_all" ON public.crop_arrivals;
CREATE POLICY "arrivals_select_all" ON public.crop_arrivals
  FOR SELECT TO authenticated USING (true);

-- price_history: ALL authenticated users read
DROP POLICY IF EXISTS "price_history_select_all" ON public.price_history;
CREATE POLICY "price_history_select_all" ON public.price_history
  FOR SELECT TO authenticated USING (true);

-- settlements: owning arthi OR farmer reads own
DROP POLICY IF EXISTS "settlements_select_own" ON public.settlements;
DROP POLICY IF EXISTS "settlements_select_arthi" ON public.settlements;
DROP POLICY IF EXISTS "settlements_select_all" ON public.settlements;
CREATE POLICY "settlements_select_own" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- settlement_bidders: only visible via owning settlement
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

-- receipts: owning arthi or farmer reads
DROP POLICY IF EXISTS "receipts_select_own" ON public.receipts;
CREATE POLICY "receipts_select_own" ON public.receipts
  FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- messages: sender or receiver reads
DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR receiver_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- monthly expenses: owning arthi reads
DROP POLICY IF EXISTS "expenses_select_own" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_select_own" ON public.shop_monthly_expenses
  FOR SELECT TO authenticated
  USING (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ═══ PART 3: INSERT policies — arthi writes these ═══

-- mandi_prices: arthi inserts
DROP POLICY IF EXISTS "mandi_prices_insert" ON public.mandi_prices;
DROP POLICY IF EXISTS "mandi_prices_insert_arthi" ON public.mandi_prices;
CREATE POLICY "mandi_prices_insert" ON public.mandi_prices
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- arthi_voice_updates: arthi inserts
DROP POLICY IF EXISTS "voice_updates_insert" ON public.arthi_voice_updates;
CREATE POLICY "voice_updates_insert" ON public.arthi_voice_updates
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- auction_notices: arthi inserts
DROP POLICY IF EXISTS "auction_notices_insert" ON public.auction_notices;
CREATE POLICY "auction_notices_insert" ON public.auction_notices
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- crop_arrivals: arthi inserts
DROP POLICY IF EXISTS "arrivals_insert" ON public.crop_arrivals;
CREATE POLICY "arrivals_insert" ON public.crop_arrivals
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- settlements: arthi inserts
DROP POLICY IF EXISTS "settlements_insert" ON public.settlements;
CREATE POLICY "settlements_insert" ON public.settlements
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- settlement_bidders: arthi inserts for own settlements
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

-- receipts: arthi inserts
DROP POLICY IF EXISTS "receipts_insert" ON public.receipts;
CREATE POLICY "receipts_insert" ON public.receipts
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- messages: authenticated user sends
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- monthly expenses: arthi inserts
DROP POLICY IF EXISTS "expenses_insert" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_insert" ON public.shop_monthly_expenses
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- users: signup insert (critical for new accounts)
DROP POLICY IF EXISTS "users_insert_auth" ON public.users;
CREATE POLICY "users_insert_auth" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth_id = auth.uid());

-- users: update own profile
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- ═══ PART 4: UPDATE policies ═══

DROP POLICY IF EXISTS "arrivals_update" ON public.crop_arrivals;
CREATE POLICY "arrivals_update" ON public.crop_arrivals
  FOR UPDATE TO authenticated
  USING (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "messages_update" ON public.messages;
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE TO authenticated
  USING (receiver_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "expenses_update_own" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_update_own" ON public.shop_monthly_expenses
  FOR UPDATE TO authenticated
  USING (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()))
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ═══ PART 5: Auto-create users row on signup ═══
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
