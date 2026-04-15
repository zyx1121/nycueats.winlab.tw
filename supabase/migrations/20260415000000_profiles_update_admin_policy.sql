-- Allow admin users to update any profile (e.g., grant/revoke vendor role)
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE
  USING (is_admin())
  WITH CHECK (is_admin());
