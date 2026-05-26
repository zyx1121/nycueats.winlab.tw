
-- Vendor can update order_items.picked_up for their own menu items
CREATE POLICY order_items_update_vendor ON order_items FOR UPDATE USING (
  auth.uid() IN (
    SELECT v.owner_id FROM menu_items mi
    JOIN vendors v ON v.id = mi.vendor_id
    WHERE mi.id = order_items.menu_item_id
  )
);

-- Vendor can update orders status (for completing orders)
CREATE POLICY orders_update_vendor ON orders FOR UPDATE USING (
  is_vendor_order(id)
);
