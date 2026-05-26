-- Auto-rollover daily_slots from menu_items.default_max_qty.
--
-- Before this migration, daily_slots rows were only created when a vendor
-- explicitly hit the bulk-upsert dialog. Most vendors never did, so /menu/[id]
-- rendered "本週已售完" for everything except the one vendor (大口漢堡) that
-- actively maintained slots. This migration adds a nightly pg_cron job that
-- materialises slots for the next 14 days from menu_items.default_max_qty,
-- respecting vendor.operating_days. ON CONFLICT DO NOTHING preserves any
-- manual max_qty tuning vendors have already applied to specific dates.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- SECURITY DEFINER bypasses daily_slots write RLS (owner-only).
-- Inputs are public columns on menu_items + vendors; no data leak surface.
CREATE OR REPLACE FUNCTION public.rollover_daily_slots()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted int;
BEGIN
  WITH date_series AS (
    SELECT generate_series(CURRENT_DATE + 1, CURRENT_DATE + 14, '1 day'::interval)::date AS d
  ),
  candidate AS (
    SELECT mi.id AS menu_item_id, ds.d AS date, mi.default_max_qty AS max_qty
    FROM menu_items mi
    JOIN vendors v ON v.id = mi.vendor_id
    CROSS JOIN date_series ds
    WHERE mi.is_available = true
      AND mi.default_max_qty > 0
      AND v.is_active = true
      AND EXTRACT(DOW FROM ds.d)::int = ANY(v.operating_days)
  ),
  ins AS (
    INSERT INTO daily_slots (menu_item_id, date, max_qty)
    SELECT menu_item_id, date, max_qty FROM candidate
    ON CONFLICT (menu_item_id, date) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rollover_daily_slots() FROM PUBLIC;

-- Schedule daily at 22:00 UTC = 06:00 Asia/Taipei, before employees check menus.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rollover_daily_slots') THEN
    PERFORM cron.schedule(
      'rollover_daily_slots',
      '0 22 * * *',
      $job$SELECT public.rollover_daily_slots();$job$
    );
  END IF;
END $$;

-- Immediate backfill so the fix takes effect the moment this migration applies.
SELECT public.rollover_daily_slots();
