
-- ==============================
-- ROW LEVEL SECURITY
-- ==============================
alter table areas        enable row level security;
alter table profiles     enable row level security;
alter table vendors      enable row level security;
alter table vendor_areas enable row level security;
alter table menu_items   enable row level security;
alter table daily_slots  enable row level security;
alter table orders       enable row level security;
alter table order_items  enable row level security;

-- areas: 所有人可讀
create policy "areas_read" on areas for select using (true);

-- profiles: 自己可讀寫
create policy "profiles_read_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);

-- vendors: 所有人可讀 active 商家；owner 可讀寫自己的
create policy "vendors_read_active" on vendors for select using (is_active = true);
create policy "vendors_read_own" on vendors for select using (auth.uid() = owner_id);
create policy "vendors_insert_own" on vendors for insert with check (auth.uid() = owner_id);
create policy "vendors_update_own" on vendors for update using (auth.uid() = owner_id);

-- vendor_areas: 所有人可讀；vendor owner 可寫
create policy "vendor_areas_read" on vendor_areas for select using (true);
create policy "vendor_areas_write" on vendor_areas for all
  using (auth.uid() = (select owner_id from vendors where id = vendor_id));

-- menu_items: 所有人可讀 available 餐點；vendor owner 可寫
create policy "menu_items_read" on menu_items for select using (is_available = true);
create policy "menu_items_read_own" on menu_items for select
  using (auth.uid() = (select owner_id from vendors where id = vendor_id));
create policy "menu_items_write_own" on menu_items for all
  using (auth.uid() = (select owner_id from vendors where id = vendor_id));

-- daily_slots: 所有人可讀；vendor owner 可寫
create policy "daily_slots_read" on daily_slots for select using (true);
create policy "daily_slots_write_own" on daily_slots for all
  using (auth.uid() = (
    select v.owner_id from menu_items m
    join vendors v on v.id = m.vendor_id
    where m.id = menu_item_id
  ));

-- orders: 自己的可讀寫
create policy "orders_read_own" on orders for select using (auth.uid() = user_id);
create policy "orders_insert_own" on orders for insert with check (auth.uid() = user_id);
create policy "orders_update_own" on orders for update using (auth.uid() = user_id);

-- order_items: 自己的可讀；建立時 insert；vendor 可讀自己商家的
create policy "order_items_read_own" on order_items for select
  using (auth.uid() = (select user_id from orders where id = order_id));
create policy "order_items_insert_own" on order_items for insert
  with check (auth.uid() = (select user_id from orders where id = order_id));
create policy "order_items_delete_own" on order_items for delete
  using (auth.uid() = (select user_id from orders where id = order_id));
create policy "order_items_read_vendor" on order_items for select
  using (auth.uid() = (
    select v.owner_id from menu_items m
    join vendors v on v.id = m.vendor_id
    where m.id = menu_item_id
  ));
