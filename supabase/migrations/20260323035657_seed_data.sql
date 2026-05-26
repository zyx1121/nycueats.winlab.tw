
-- ==============================
-- SEED: 測試商家資料
-- ==============================
insert into vendors (id, name, description, tags, is_active) values
  ('11111111-0000-0000-0000-000000000001'::uuid, '奉餡・汁心餃子', '新竹市東區的一家餃子店，提供各種口味的餃子', array['餃子', '麵食'], true),
  ('11111111-0000-0000-0000-000000000002'::uuid, '好飯食堂', '家常便當，天天換菜單', array['便當', '台式'], true),
  ('11111111-0000-0000-0000-000000000003'::uuid, '泰式廚房', '道地泰式料理，香辣夠味', array['泰式', '異國'], true);

insert into vendor_areas (vendor_id, area_id)
select '11111111-0000-0000-0000-000000000001'::uuid, id from areas where name = '新竹廠'
union all
select '11111111-0000-0000-0000-000000000002'::uuid, id from areas where name = '新竹廠'
union all
select '11111111-0000-0000-0000-000000000003'::uuid, id from areas where name = '新竹廠'
union all
select '11111111-0000-0000-0000-000000000001'::uuid, id from areas where name = '台中廠';

insert into menu_items (vendor_id, name, description, price, calories, protein, sodium, sugar) values
  ('11111111-0000-0000-0000-000000000001'::uuid, '汁心煎餃', '招牌餡心煎餃，外皮煎至金黃酥脆', 120, 350, 15, 800, 2),
  ('11111111-0000-0000-0000-000000000001'::uuid, '水煮蒸餃', '清爽水煮，保留鮮嫩內餡', 100, 280, 12, 600, 1),
  ('11111111-0000-0000-0000-000000000001'::uuid, '麻辣水餃', '麻辣湯底，香辣過癮', 130, 400, 16, 1200, 3),
  ('11111111-0000-0000-0000-000000000002'::uuid, '雞腿便當', '嫩煎雞腿，附三樣小菜', 90, 650, 35, 900, 4),
  ('11111111-0000-0000-0000-000000000002'::uuid, '排骨便當', '酥炸排骨，附三樣小菜', 85, 700, 32, 950, 5),
  ('11111111-0000-0000-0000-000000000003'::uuid, '打拋豬飯', '道地泰式打拋豬，配白飯', 110, 580, 28, 1100, 6),
  ('11111111-0000-0000-0000-000000000003'::uuid, '綠咖哩雞', '香濃椰奶綠咖哩', 120, 620, 30, 1000, 8);

insert into daily_slots (menu_item_id, date, max_qty)
select m.id, current_date + n, 30
from menu_items m
cross join generate_series(1, 7) as n;
