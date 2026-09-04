-- ============================================================================
-- Test Data Seed — Simulates the "تصدیق اور محفوظ کریں" confirm flow
-- Inserts test records as if the Arthi recorded a voice note about rates,
-- arrivals, and settlements. Run this in Supabase SQL Editor to verify
-- data appears on Farmer and Bidder dashboards.
-- ============================================================================

-- Step 1: Find the Arthi user (created by browser test: kamran@mandisync.pk)
-- If this user doesn't exist, create one first.
DO $$
DECLARE
  v_arthi_id BIGINT;
  v_farmer_id BIGINT;
  v_crop_id BIGINT;
  v_mandi_id BIGINT;
BEGIN
  -- Get arthi user
  SELECT id INTO v_arthi_id FROM public.users WHERE email = 'kamran@mandisync.pk' LIMIT 1;

  -- If arthi doesn't exist, pick any arthi user
  IF v_arthi_id IS NULL THEN
    SELECT id INTO v_arthi_id FROM public.users WHERE role = 'arthi' LIMIT 1;
  END IF;

  -- If still no arthi, report error
  IF v_arthi_id IS NULL THEN
    RAISE EXCEPTION 'No arthi user found. Please sign up as arthi first.';
  END IF;

  RAISE NOTICE 'Using arthi_id: %', v_arthi_id;

  -- Get a farmer user
  SELECT id INTO v_farmer_id FROM public.users WHERE role = 'farmer' LIMIT 1;
  IF v_farmer_id IS NULL THEN
    RAISE NOTICE 'No farmer user found — will insert with NULL farmer_id';
  ELSE
    RAISE NOTICE 'Using farmer_id: %', v_farmer_id;
  END IF;

  -- Get a crop (should exist from seed data)
  SELECT id INTO v_crop_id FROM public.crops LIMIT 1;
  IF v_crop_id IS NULL THEN
    RAISE NOTICE 'No crops found — inserting test crop';
    INSERT INTO public.crops (name, urdu_name, category)
    VALUES ('Mango', 'آم', 'fruit')
    RETURNING id INTO v_crop_id;
  END IF;
  RAISE NOTICE 'Using crop_id: % (crop)', v_crop_id;

  -- Get a mandi
  SELECT id INTO v_mandi_id FROM public.mandis LIMIT 1;
  IF v_mandi_id IS NULL THEN
    RAISE NOTICE 'No mandi found — inserting test mandi';
    INSERT INTO public.mandis (name, city, district)
    VALUES ('Multan Mandi', 'Multan', 'Multan')
    RETURNING id INTO v_mandi_id;
  END IF;
  RAISE NOTICE 'Using mandi_id: % (mandi)', v_mandi_id;

  -- ── Insert 1: mandi_prices (simulates نرخ voice note confirm) ──
  INSERT INTO public.mandi_prices (arthi_id, crop_id, mandi_id, price, recorded_at)
  VALUES (v_arthi_id, v_crop_id, v_mandi_id, 450, NOW());
  RAISE NOTICE 'Inserted mandi_prices: crop=%, mandi=%, price=450', v_crop_id, v_mandi_id;

  -- ── Insert 2: crop_arrivals (simulates آمد voice note confirm) ──
  INSERT INTO public.crop_arrivals (arthi_id, crop_id, farmer_landlord_id, gatta_count, peti_count, arrival_date, status)
  VALUES (v_arthi_id, v_crop_id, v_farmer_id, 25, 10, CURRENT_DATE, 'pending');
  RAISE NOTICE 'Inserted crop_arrivals: crop=%, farmer=%, gatta=25, peti=10', v_crop_id, v_farmer_id;

  -- ── Insert 3: settlements (simulates سیٹلمنٹ voice note confirm) ──
  INSERT INTO public.settlements (arthi_id, farmer_landlord_id, kacha_birki, settlement_date)
  VALUES (v_arthi_id, v_farmer_id, 15000, CURRENT_DATE);
  RAISE NOTICE 'Inserted settlements: farmer=%, kacha_birki=15000', v_farmer_id;

  -- ── Insert 4: arthi_voice_updates (simulates the voice record itself) ──
  INSERT INTO public.arthi_voice_updates (arthi_id, status, transaction_text)
  VALUES (v_arthi_id, 'completed', 'آج آم کا نرخ ساڑھے چار سو روپے ہے ملتان منڈی میں');
  RAISE NOTICE 'Inserted arthi_voice_updates with transaction text';

  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE 'Test data inserted successfully!';
  RAISE NOTICE 'Check Farmer Dashboard for prices & settlements';
  RAISE NOTICE 'Check Bidder Dashboard for arrivals';
  RAISE NOTICE '═══════════════════════════════════════════';
END $$;
