-- ============================================================================
-- Comprehensive RLS policies for the full voice note confirm flow
-- Fixes: "تصدیق اور محفوظ کریں" button not working
--
-- The confirm flow requires:
--   SELECT: crops, mandis, users, arthi_farmer_contacts, profiles
--   INSERT: arthi_voice_updates, mandi_prices, crop_arrivals, settlements
--   UPDATE: crop_arrivals (confirm arrival)
--
-- Run this in Supabase SQL Editor AFTER the full_mango_seed migration.
-- ============================================================================

-- ── Enable RLS on tables that might not have it yet ──
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

-- ══════════════════════════════════════════════════════════════════════
-- SELECT policies (resolver + dashboard reads)
-- ══════════════════════════════════════════════════════════════════════

-- users: any authenticated user can read all users (needed for resolver + name display)
DROP POLICY IF EXISTS "users_select_all" ON public.users;
CREATE POLICY "users_select_all" ON public.users
  FOR SELECT TO authenticated USING (true);

-- arthi_farmer_contacts: any authenticated user can read (needed for resolver)
DROP POLICY IF EXISTS "arthi_contacts_select_all" ON public.arthi_farmer_contacts;
CREATE POLICY "arthi_contacts_select_all" ON public.arthi_farmer_contacts
  FOR SELECT TO authenticated USING (true);

-- profiles: any authenticated user can read (needed for dashboard shop cards)
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT TO authenticated USING (true);

-- receipts: arthi reads own receipts
DROP POLICY IF EXISTS "receipts_select_own" ON public.receipts;
CREATE POLICY "receipts_select_own" ON public.receipts
  FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR
    farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- invoices: arthi/farmer reads own invoices
DROP POLICY IF EXISTS "invoices_select_own" ON public.invoices;
CREATE POLICY "invoices_select_own" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR
    farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- shop_monthly_expenses: arthi reads own expenses
DROP POLICY IF EXISTS "expenses_select_own" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_select_own" ON public.shop_monthly_expenses
  FOR SELECT TO authenticated
  USING (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- messages: user reads messages where they are sender or receiver
DROP POLICY IF EXISTS "messages_select_own" ON public.messages;
CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT TO authenticated
  USING (
    sender_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR
    receiver_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- notifications: user reads own notifications
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- price_history: any authenticated user can read
DROP POLICY IF EXISTS "price_history_select_all" ON public.price_history;
CREATE POLICY "price_history_select_all" ON public.price_history
  FOR SELECT TO authenticated USING (true);

-- settlements: arthi reads own settlements too
DROP POLICY IF EXISTS "settlements_select_arthi" ON public.settlements;
CREATE POLICY "settlements_select_arthi" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
    OR
    farmer_landlord_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- ══════════════════════════════════════════════════════════════════════
-- INSERT policies (voice note confirm + dashboard actions)
-- ══════════════════════════════════════════════════════════════════════

-- arthi_voice_updates: arthi inserts own voice notes
DROP POLICY IF EXISTS "voice_updates_insert_arthi" ON public.arthi_voice_updates;
CREATE POLICY "voice_updates_insert_arthi" ON public.arthi_voice_updates
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- crop_arrivals: arthi inserts arrivals
DROP POLICY IF EXISTS "arrivals_insert_arthi" ON public.crop_arrivals;
CREATE POLICY "arrivals_insert_arthi" ON public.crop_arrivals
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- settlements: arthi inserts settlements
DROP POLICY IF EXISTS "settlements_insert_arthi" ON public.settlements;
CREATE POLICY "settlements_insert_arthi" ON public.settlements
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- receipts: arthi inserts receipts
DROP POLICY IF EXISTS "receipts_insert_arthi" ON public.receipts;
CREATE POLICY "receipts_insert_arthi" ON public.receipts
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- invoices: arthi inserts invoices
DROP POLICY IF EXISTS "invoices_insert_arthi" ON public.invoices;
CREATE POLICY "invoices_insert_arthi" ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- shop_monthly_expenses: arthi inserts own expenses
DROP POLICY IF EXISTS "expenses_insert_arthi" ON public.shop_monthly_expenses;
CREATE POLICY "expenses_insert_arthi" ON public.shop_monthly_expenses
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- messages: authenticated user can insert (send) messages
DROP POLICY IF EXISTS "messages_insert_auth" ON public.messages;
CREATE POLICY "messages_insert_auth" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- notifications: system inserts (authenticated)
DROP POLICY IF EXISTS "notifications_insert_auth" ON public.notifications;
CREATE POLICY "notifications_insert_auth" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- auction_notices: arthi inserts notices
DROP POLICY IF EXISTS "auction_notices_insert_arthi" ON public.auction_notices;
CREATE POLICY "auction_notices_insert_arthi" ON public.auction_notices
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- arthi_farmer_contacts: arthi inserts own contacts
DROP POLICY IF EXISTS "arthi_contacts_insert" ON public.arthi_farmer_contacts;
CREATE POLICY "arthi_contacts_insert" ON public.arthi_farmer_contacts
  FOR INSERT TO authenticated
  WITH CHECK (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- ══════════════════════════════════════════════════════════════════════
-- UPDATE policies (confirm arrival, etc.)
-- ══════════════════════════════════════════════════════════════════════

-- crop_arrivals: arthi updates own arrivals (confirm status)
DROP POLICY IF EXISTS "arrivals_update_arthi" ON public.crop_arrivals;
CREATE POLICY "arrivals_update_arthi" ON public.crop_arrivals
  FOR UPDATE TO authenticated
  USING (arthi_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- messages: mark as read
DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    receiver_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- notifications: mark as read
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));
