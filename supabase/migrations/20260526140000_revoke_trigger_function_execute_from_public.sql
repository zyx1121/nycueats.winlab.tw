-- Follow-up to 20260526031142_security_hardening.sql.
--
-- The earlier `REVOKE EXECUTE ... FROM anon, authenticated` was a no-op:
-- both roles inherit EXECUTE via the default GRANT TO PUBLIC, so revoking
-- from the inherited roles changes nothing. To actually close the
-- /rest/v1/rpc/<fn> RPC surface we have to REVOKE FROM PUBLIC.
--
-- Scope is limited to the two pure trigger functions, which are fired by
-- DB triggers (running under the table owner's context) and never need
-- to be callable by client roles.
--
-- public.is_admin() and public.is_vendor_order(uuid) are intentionally
-- left alone — they are referenced inside RLS policies (e.g.
-- orders_read_vendor), and RLS evaluation invokes the function under
-- the calling role's permissions. Revoking from PUBLIC would break
-- those queries for anon and authenticated. The Supabase advisor still
-- flags them as a result; that is a known false positive in this
-- codebase.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_reserved_qty() FROM PUBLIC;
