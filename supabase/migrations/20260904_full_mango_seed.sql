-- ============================================================================
-- MandiSync: Full Mango (Chaunsa) Database Seed Migration
-- Date: 2026-09-04
-- ============================================================================

-- 1. Add created_at column to mandi_prices if it doesn't exist
ALTER TABLE public.mandi_prices
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Seed Mandi reference data (required FK for mandi_prices.mandi_id)
INSERT INTO public.mandis (id, name, city, district, province)
VALUES (1, 'Multan Mandi', 'Multan', 'Multan', 'Punjab')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    city = EXCLUDED.city,
    district = EXCLUDED.district,
    province = EXCLUDED.province;

-- 3. Seed Single Product: Mango Chaunsa
INSERT INTO public.crops (id, name, urdu_name, unit)
VALUES (1, 'Mango Chaunsa', 'چونسا آم', '40kg')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    urdu_name = EXCLUDED.urdu_name,
    unit = EXCLUDED.unit;

-- 4. Seed Arthi user accounts (required FK for mandi_prices.arthi_id → users.id)
INSERT INTO public.users (id, name, role, email)
VALUES
  (1, 'Mian Kamran', 'arthi', 'kamran@mandisync.pk'),
  (2, 'Haji Bashir', 'arthi', 'bashir@mandisync.pk')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    role = EXCLUDED.role,
    email = EXCLUDED.email;

-- 5. Seed Arthi Profile Entries
INSERT INTO public.profiles (id, user_id, shop_number, shop_name, is_shop_rented)
VALUES
  (1, 1, '42-B', 'میاں کامران فروٹ مرچنٹ', false),
  (2, 2, '18-A', 'حاجی بشیر احمد اینڈ سنز', true)
ON CONFLICT (id) DO UPDATE
SET user_id = EXCLUDED.user_id,
    shop_number = EXCLUDED.shop_number,
    shop_name = EXCLUDED.shop_name,
    is_shop_rented = EXCLUDED.is_shop_rented;

-- 6. Seed Mandi Price Records (clear + re-insert for crop_id = 1)
DELETE FROM public.mandi_prices WHERE crop_id = 1;

INSERT INTO public.mandi_prices (mandi_id, crop_id, arthi_id, source_voice_update_id, price, created_at)
VALUES
  (1, 1, 1, NULL, 7200.00, NOW() - INTERVAL '5 days'),
  (1, 1, 1, NULL, 7100.00, NOW() - INTERVAL '4 days'),
  (1, 1, 2, NULL, 7300.00, NOW() - INTERVAL '3 days'),
  (1, 1, 1, NULL, 7250.00, NOW() - INTERVAL '2 days'),
  (1, 1, 2, NULL, 7400.00, NOW() - INTERVAL '1 day'),
  (1, 1, 1, NULL, 7500.00, NOW());

-- 7. Reset sequences to accommodate seeded data
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('profiles_id_seq', (SELECT MAX(id) FROM profiles));
SELECT setval('crops_id_seq', (SELECT MAX(id) FROM crops));
SELECT setval('mandis_id_seq', (SELECT MAX(id) FROM mandis));

-- ============================================================================
-- 8. RLS Policies — allow authenticated users to READ seed tables
-- ============================================================================

-- Enable RLS on tables if not already enabled
ALTER TABLE public.crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandi_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arthi_voice_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- crops: anyone authenticated can read
DROP POLICY IF EXISTS "crops_select_all" ON public.crops;
CREATE POLICY "crops_select_all" ON public.crops
  FOR SELECT TO authenticated USING (true);

-- mandis: anyone authenticated can read
DROP POLICY IF EXISTS "mandis_select_all" ON public.mandis;
CREATE POLICY "mandis_select_all" ON public.mandis
  FOR SELECT TO authenticated USING (true);

-- mandi_prices: anyone authenticated can read
DROP POLICY IF EXISTS "mandi_prices_select_all" ON public.mandi_prices;
CREATE POLICY "mandi_prices_select_all" ON public.mandi_prices
  FOR SELECT TO authenticated USING (true);

-- profiles: anyone authenticated can read
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- arthi_voice_updates: anyone authenticated can read
DROP POLICY IF EXISTS "voice_updates_select_all" ON public.arthi_voice_updates;
CREATE POLICY "voice_updates_select_all" ON public.arthi_voice_updates
  FOR SELECT TO authenticated USING (true);

-- auction_notices: anyone authenticated can read
DROP POLICY IF EXISTS "auction_notices_select_all" ON public.auction_notices;
CREATE POLICY "auction_notices_select_all" ON public.auction_notices
  FOR SELECT TO authenticated USING (true);

-- settlements: farmer reads own settlements
DROP POLICY IF EXISTS "settlements_select_own" ON public.settlements;
CREATE POLICY "settlements_select_own" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    farmer_landlord_id IN (
      SELECT id FROM public.users WHERE auth_id = auth.uid()
    )
  );

-- mandi_prices: arthi can insert own prices
DROP POLICY IF EXISTS "mandi_prices_insert_arthi" ON public.mandi_prices;
CREATE POLICY "mandi_prices_insert_arthi" ON public.mandi_prices
  FOR INSERT TO authenticated
  WITH CHECK (
    arthi_id IN (
      SELECT id FROM public.users WHERE auth_id = auth.uid()
    )
  );
