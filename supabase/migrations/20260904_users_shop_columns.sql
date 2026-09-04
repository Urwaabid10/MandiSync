-- Add shop_name and shop_number columns to users table for arthi profiles
-- These columns store the arthi's shop/duka details which are displayed
-- on farmer and bidder dashboards alongside mandi prices and auction notices.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS shop_name text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS shop_number text;

-- Add entities (JSONB) and voice_type columns to arthi_voice_updates
-- entities stores the extracted AI data (crop, mandi, price etc.) for later confirmation
-- voice_type stores the type of voice note (mandi_rate, auction_arrival, settlement_audio)

ALTER TABLE public.arthi_voice_updates ADD COLUMN IF NOT EXISTS entities jsonb;
ALTER TABLE public.arthi_voice_updates ADD COLUMN IF NOT EXISTS voice_type text;

-- Update RLS: ensure users can read shop_name and shop_number
-- (existing SELECT policies on users table already cover these columns)

-- Fix missing RLS SELECT policy on mandis table
-- The mandis table had RLS enabled but no SELECT policy, blocking all client reads.
-- This caused the farmer dashboard to show "نامعلوم منڈی" for all mandi groupings.
DROP POLICY IF EXISTS "mandis_select_all" ON public.mandis;
CREATE POLICY "mandis_select_all" ON public.mandis
  FOR SELECT TO authenticated USING (true);

-- Enable Supabase Realtime on the messages table for live chat
-- Without this, the ChatDrawer's postgres_changes subscription receives no events
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Add UPDATE policy for shop_monthly_expenses
-- The form uses upsert (INSERT...ON CONFLICT DO UPDATE) which requires an UPDATE policy
-- Without this, re-saving expenses for the same month fails silently
DROP POLICY IF EXISTS "expenses_update_own" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_update_own" ON public.shop_monthly_expenses
  FOR UPDATE TO authenticated
  USING ((select auth_id from users where id = arthi_id) = auth.uid())
  WITH CHECK ((select auth_id from users where id = arthi_id) = auth.uid());

-- Add unique constraint on (arthi_id, month_year) for upsert ON CONFLICT clause
-- Without this, the .upsert({ onConflict: "arthi_id,month_year" }) call fails with:
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"
ALTER TABLE public.shop_monthly_expenses
  ADD CONSTRAINT IF NOT EXISTS shop_monthly_expenses_arthi_month_unique
  UNIQUE (arthi_id, month_year);

-- Add address fields to users table for arthi shop profiles
-- These are visible on the farmer dashboard's arthi cards and settlement slips
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS shop_address text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS shop_city text;

-- Add crop_id to settlements for linking settlements to specific crops
-- This enables the farmer dashboard to show which crop a settlement belongs to
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS crop_id bigint;

-- FK from settlements.crop_id to crops.id
-- Without this, the PostgREST join crops(name, urdu_name) fails silently
-- and the settlement query returns 0 rows on the farmer dashboard
ALTER TABLE public.settlements
  DROP CONSTRAINT IF EXISTS settlements_crop_id_fkey;
ALTER TABLE public.settlements
  ADD CONSTRAINT settlements_crop_id_fkey
  FOREIGN KEY (crop_id) REFERENCES public.crops(id);

-- Add UPDATE policy for users table so arthis can save their profile
-- Without this, the Profile tab save fails silently (only SELECT existed)
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid())
  WITH CHECK (auth_id = auth.uid());

-- Storage buckets for receipt images and voice note audio files
-- Without these buckets, uploads fail silently and receipts/voice notes don't work
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('voice-notes', 'voice-notes', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
CREATE POLICY "receipts_arthi_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "receipts_select_all" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');
CREATE POLICY "voice_notes_arthi_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'voice-notes');
CREATE POLICY "voice_notes_select_all" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'voice-notes');

-- ---------------------------------------------------------------------------
-- settlement_bidders: individual bidder line items per settlement
-- Each row = one bidder who bought N gattu for Rs. X
-- Kacchi Bikri = SUM(cost) across all bidders for a settlement
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_bidders (
  id bigserial PRIMARY KEY,
  settlement_id bigint NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  bidder_name text,
  gattu_count numeric DEFAULT 0,
  cost numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.settlement_bidders ENABLE ROW LEVEL SECURITY;

-- SELECT: same visibility as the parent settlement (arthi or farmer can see)
CREATE POLICY "bidders_select" ON public.settlement_bidders
  FOR SELECT TO authenticated
  USING (
    settlement_id IN (
      SELECT id FROM settlements
      WHERE arthi_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
         OR farmer_landlord_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- INSERT: arthi can add bidders to their own settlements
CREATE POLICY "bidders_insert" ON public.settlement_bidders
  FOR INSERT TO authenticated
  WITH CHECK (
    settlement_id IN (
      SELECT id FROM settlements
      WHERE arthi_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );
