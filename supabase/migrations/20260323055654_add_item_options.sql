
-- 選項群組
CREATE TABLE item_option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  min_select integer NOT NULL DEFAULT 1,
  max_select integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 選項
CREATE TABLE item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES item_option_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 訂單選項快照
CREATE TABLE order_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES item_options(id),
  name text NOT NULL,
  price_delta integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE item_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_option_groups_read" ON item_option_groups FOR SELECT USING (true);
CREATE POLICY "item_option_groups_write" ON item_option_groups FOR ALL USING (
  EXISTS (
    SELECT 1 FROM menu_items mi
    JOIN vendors v ON v.id = mi.vendor_id
    WHERE mi.id = item_option_groups.menu_item_id AND v.owner_id = auth.uid()
  )
);

CREATE POLICY "item_options_read" ON item_options FOR SELECT USING (true);
CREATE POLICY "item_options_write" ON item_options FOR ALL USING (
  EXISTS (
    SELECT 1 FROM item_option_groups g
    JOIN menu_items mi ON mi.id = g.menu_item_id
    JOIN vendors v ON v.id = mi.vendor_id
    WHERE g.id = item_options.group_id AND v.owner_id = auth.uid()
  )
);

CREATE POLICY "order_item_options_select" ON order_item_options FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_options.order_item_id AND o.user_id = auth.uid()
  )
);
CREATE POLICY "order_item_options_insert" ON order_item_options FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.id = order_item_options.order_item_id AND o.user_id = auth.uid()
  )
);
