CREATE POLICY orders_read_vendor ON orders FOR SELECT USING (
  id IN (
    SELECT oi.order_id FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN vendors v ON v.id = mi.vendor_id
    WHERE v.owner_id = auth.uid()
  )
);