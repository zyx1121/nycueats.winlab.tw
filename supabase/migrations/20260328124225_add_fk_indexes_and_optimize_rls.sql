-- ============================================================
-- Part 1: Add indexes on unindexed foreign key columns
-- ============================================================

CREATE INDEX idx_item_option_groups_menu_item_id ON public.item_option_groups (menu_item_id);
CREATE INDEX idx_item_options_group_id ON public.item_options (group_id);
CREATE INDEX idx_menu_items_vendor_id ON public.menu_items (vendor_id);
CREATE INDEX idx_order_item_options_option_id ON public.order_item_options (option_id);
CREATE INDEX idx_order_item_options_order_item_id ON public.order_item_options (order_item_id);
CREATE INDEX idx_order_items_daily_slot_id ON public.order_items (daily_slot_id);
CREATE INDEX idx_order_items_menu_item_id ON public.order_items (menu_item_id);
CREATE INDEX idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX idx_orders_user_id ON public.orders (user_id);
CREATE INDEX idx_profiles_area_id ON public.profiles (area_id);
CREATE INDEX idx_vendor_areas_area_id ON public.vendor_areas (area_id);
CREATE INDEX idx_vendors_owner_id ON public.vendors (owner_id);

-- ============================================================
-- Part 2: Recreate RLS policies with (SELECT auth.uid())
-- to avoid per-row re-evaluation (initplan optimization)
-- ============================================================

-- profiles
DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
CREATE POLICY "profiles_read_own" ON public.profiles FOR SELECT
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (id = (SELECT auth.uid()));

-- vendors
DROP POLICY IF EXISTS "vendors_read_own" ON public.vendors;
CREATE POLICY "vendors_read_own" ON public.vendors FOR SELECT
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "vendors_insert_own" ON public.vendors;
CREATE POLICY "vendors_insert_own" ON public.vendors FOR INSERT
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "vendors_update_own" ON public.vendors;
CREATE POLICY "vendors_update_own" ON public.vendors FOR UPDATE
  USING (owner_id = (SELECT auth.uid()));

-- vendor_areas
DROP POLICY IF EXISTS "vendor_areas_write" ON public.vendor_areas;
CREATE POLICY "vendor_areas_write" ON public.vendor_areas FOR ALL
  USING ((SELECT auth.uid()) = (SELECT v.owner_id FROM vendors v WHERE v.id = vendor_areas.vendor_id));

-- menu_items
DROP POLICY IF EXISTS "menu_items_read_own" ON public.menu_items;
CREATE POLICY "menu_items_read_own" ON public.menu_items FOR SELECT
  USING ((SELECT auth.uid()) = (SELECT v.owner_id FROM vendors v WHERE v.id = menu_items.vendor_id));

DROP POLICY IF EXISTS "menu_items_write_own" ON public.menu_items;
CREATE POLICY "menu_items_write_own" ON public.menu_items FOR ALL
  USING ((SELECT auth.uid()) = (SELECT v.owner_id FROM vendors v WHERE v.id = menu_items.vendor_id));

-- item_option_groups
DROP POLICY IF EXISTS "item_option_groups_write" ON public.item_option_groups;
CREATE POLICY "item_option_groups_write" ON public.item_option_groups FOR ALL
  USING (EXISTS (
    SELECT 1 FROM menu_items mi JOIN vendors v ON v.id = mi.vendor_id
    WHERE mi.id = item_option_groups.menu_item_id AND v.owner_id = (SELECT auth.uid())
  ));

-- item_options
DROP POLICY IF EXISTS "item_options_write" ON public.item_options;
CREATE POLICY "item_options_write" ON public.item_options FOR ALL
  USING (EXISTS (
    SELECT 1 FROM item_option_groups g
    JOIN menu_items mi ON mi.id = g.menu_item_id
    JOIN vendors v ON v.id = mi.vendor_id
    WHERE g.id = item_options.group_id AND v.owner_id = (SELECT auth.uid())
  ));

-- daily_slots
DROP POLICY IF EXISTS "daily_slots_write_own" ON public.daily_slots;
CREATE POLICY "daily_slots_write_own" ON public.daily_slots FOR ALL
  USING ((SELECT auth.uid()) = (
    SELECT v.owner_id FROM menu_items m JOIN vendors v ON v.id = m.vendor_id
    WHERE m.id = daily_slots.menu_item_id
  ));

-- orders
DROP POLICY IF EXISTS "orders_read_own" ON public.orders;
CREATE POLICY "orders_read_own" ON public.orders FOR SELECT
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "orders_update_own" ON public.orders;
CREATE POLICY "orders_update_own" ON public.orders FOR UPDATE
  USING (user_id = (SELECT auth.uid()));

-- order_items
DROP POLICY IF EXISTS "order_items_read_own" ON public.order_items;
CREATE POLICY "order_items_read_own" ON public.order_items FOR SELECT
  USING ((SELECT auth.uid()) = (SELECT o.user_id FROM orders o WHERE o.id = order_items.order_id));

DROP POLICY IF EXISTS "order_items_insert_own" ON public.order_items;
CREATE POLICY "order_items_insert_own" ON public.order_items FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = (SELECT o.user_id FROM orders o WHERE o.id = order_items.order_id));

DROP POLICY IF EXISTS "order_items_delete_own" ON public.order_items;
CREATE POLICY "order_items_delete_own" ON public.order_items FOR DELETE
  USING ((SELECT auth.uid()) = (SELECT o.user_id FROM orders o WHERE o.id = order_items.order_id));

DROP POLICY IF EXISTS "order_items_read_vendor" ON public.order_items;
CREATE POLICY "order_items_read_vendor" ON public.order_items FOR SELECT
  USING ((SELECT auth.uid()) = (
    SELECT v.owner_id FROM menu_items m JOIN vendors v ON v.id = m.vendor_id
    WHERE m.id = order_items.menu_item_id
  ));

DROP POLICY IF EXISTS "order_items_update_vendor" ON public.order_items;
CREATE POLICY "order_items_update_vendor" ON public.order_items FOR UPDATE
  USING ((SELECT auth.uid()) IN (
    SELECT v.owner_id FROM menu_items mi JOIN vendors v ON v.id = mi.vendor_id
    WHERE mi.id = order_items.menu_item_id
  ));

-- order_item_options
DROP POLICY IF EXISTS "order_item_options_select" ON public.order_item_options;
CREATE POLICY "order_item_options_select" ON public.order_item_options FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_options.order_item_id AND o.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "order_item_options_insert" ON public.order_item_options;
CREATE POLICY "order_item_options_insert" ON public.order_item_options FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_options.order_item_id AND o.user_id = (SELECT auth.uid())
  ));
