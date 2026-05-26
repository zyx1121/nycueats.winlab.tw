
-- Drop the recursive policy
DROP POLICY orders_read_vendor ON orders;

-- Create a SECURITY DEFINER function that bypasses RLS to check vendor ownership
CREATE OR REPLACE FUNCTION is_vendor_order(order_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN vendors v ON v.id = mi.vendor_id
    WHERE oi.order_id = is_vendor_order.order_id
    AND v.owner_id = auth.uid()
  );
$$;

-- Recreate policy using the function
CREATE POLICY orders_read_vendor ON orders FOR SELECT USING (
  is_vendor_order(id)
);
