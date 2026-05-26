-- Security hardening — three changes:
--
-- 1. Tighten profiles_update_own so a user cannot self-promote to admin/vendor
--    by editing their own role array. The previous policy only checked id =
--    auth.uid() on USING, with no WITH CHECK, so PostgREST clients could
--    PATCH role: ['admin'] freely. profiles_update_admin (separate policy)
--    still lets admins change roles for everyone.
-- 2. REVOKE EXECUTE on the four SECURITY DEFINER functions from the anon
--    and authenticated roles so they are no longer reachable via
--    /rest/v1/rpc/<fn>. RLS policies that reference these functions
--    continue to work — RLS evaluation is server-side and bypasses the
--    client EXECUTE permission.
-- 3. handle_new_user and update_reserved_qty are pure trigger functions;
--    update_reserved_qty also drives the slot-limiting CHECK. No client
--    should ever call them as RPC.

-- ====================================================================
-- 1. profiles_update_own with role-change guard
-- ====================================================================
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );

-- ====================================================================
-- 2. REVOKE EXECUTE on SECURITY DEFINER functions from client roles
-- ====================================================================
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_vendor_order(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_reserved_qty() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
