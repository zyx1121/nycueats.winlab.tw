
-- Add status column to vendors
ALTER TABLE vendors ADD COLUMN status text NOT NULL DEFAULT 'approved';

-- Helper function to check admin role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND 'admin' = ANY(role)
  );
$$;

-- Admin can read all vendors
CREATE POLICY vendors_read_admin ON vendors FOR SELECT USING (is_admin());

-- Admin can update vendors
CREATE POLICY vendors_update_admin ON vendors FOR UPDATE USING (is_admin());

-- Admin can manage vendor_areas
CREATE POLICY vendor_areas_insert_admin ON vendor_areas FOR INSERT WITH CHECK (is_admin());
CREATE POLICY vendor_areas_delete_admin ON vendor_areas FOR DELETE USING (is_admin());
CREATE POLICY vendor_areas_read_admin ON vendor_areas FOR SELECT USING (is_admin());

-- Admin can read all orders (for dashboard)
CREATE POLICY orders_read_admin ON orders FOR SELECT USING (is_admin());

-- Admin can read all order_items (for dashboard)
CREATE POLICY order_items_read_admin ON order_items FOR SELECT USING (is_admin());

-- Admin can read all profiles
CREATE POLICY profiles_read_admin ON profiles FOR SELECT USING (is_admin());
