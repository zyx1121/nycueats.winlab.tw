-- Slot-limiting mechanism — documentation-grade migration.
--
-- Production已经有这些 DDL（最初在 20260323035612 initial_schema +
-- 20260323042727 fix_update_reserved_qty_security_definer 中建立），
-- 但本機 supabase/migrations/ 並未保留 — 此檔把它們落到版控。
--
-- 全部 idempotent：CREATE OR REPLACE / DROP IF EXISTS / DO block check，
-- 即使再次 apply 到已有這些 object 的 production 也不會壞。

-- =====================================================================
-- 1. Trigger function — 將 order_items 變動同步到 daily_slots.reserved_qty
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_reserved_qty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE daily_slots SET reserved_qty = reserved_qty + NEW.qty WHERE id = NEW.daily_slot_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE daily_slots SET reserved_qty = reserved_qty - OLD.qty WHERE id = OLD.daily_slot_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE daily_slots SET reserved_qty = reserved_qty - OLD.qty + NEW.qty WHERE id = NEW.daily_slot_id;
  END IF;
  RETURN NULL;
END;
$function$;

-- =====================================================================
-- 2. Trigger — order_items 增減異動時 fire
-- =====================================================================
DROP TRIGGER IF EXISTS sync_reserved_qty ON public.order_items;
CREATE TRIGGER sync_reserved_qty
AFTER INSERT OR DELETE OR UPDATE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.update_reserved_qty();

-- =====================================================================
-- 3. CHECK constraints on daily_slots（防超賣 + 保證 max_qty 正值）
--    Postgres 沒有 ADD CONSTRAINT IF NOT EXISTS，用 DO block 達成 idempotent
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'no_oversell'
      AND conrelid = 'public.daily_slots'::regclass
  ) THEN
    ALTER TABLE public.daily_slots
      ADD CONSTRAINT no_oversell CHECK (reserved_qty <= max_qty);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'daily_slots_max_qty_check'
      AND conrelid = 'public.daily_slots'::regclass
  ) THEN
    ALTER TABLE public.daily_slots
      ADD CONSTRAINT daily_slots_max_qty_check CHECK (max_qty > 0);
  END IF;
END $$;
