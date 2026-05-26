-- Daily surprise pick — PR #4 of 4 (Bandit half).
--
-- One "今日驚喜" recommendation per user per day, picked via Thompson Sampling
-- on Beta(α=1, β=impressions+1). Mean shrinks as the user sees the item more,
-- so the bandit naturally pushes never-seen / low-exposure items forward
-- while staying within a quality candidate pool.
--
--   • Candidate pool (per user): top 30 items by
--       cos(user_vec, item_vec) + 0.5 × ln(1 + decay_trend),
--     excluding anything the user has already confirmed.
--   • Beta(1, β) closed-form sample: θ = 1 − (1 − U)^(1/β),
--     where U ~ uniform(0,1) and β = impressions_count + 1.
--   • Daily cron at 02:00 UTC (10:00 TPE), same window as the user-vector
--     refresh.

CREATE TABLE IF NOT EXISTS daily_picks (
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date         date NOT NULL DEFAULT CURRENT_DATE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  theta        numeric NOT NULL,
  beta         numeric NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS daily_picks_user_idx ON daily_picks (user_id, date DESC);

ALTER TABLE daily_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_picks_read_own" ON daily_picks;
CREATE POLICY "daily_picks_read_own" ON daily_picks
  FOR SELECT USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION compute_daily_picks()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH user_pool AS (
    SELECT DISTINCT user_id FROM (
      SELECT user_id FROM orders WHERE status IN ('confirmed','completed')
      UNION
      SELECT user_id FROM menu_item_impressions WHERE date > CURRENT_DATE - INTERVAL '14 days'
    ) u
  ),
  trending AS (
    SELECT oi.menu_item_id,
      SUM(oi.qty * EXP(-EXTRACT(EPOCH FROM (now() - o.created_at)) / (3.0 * 86400)))::numeric AS decay_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ('confirmed','completed')
      AND o.created_at > now() - interval '14 days'
    GROUP BY oi.menu_item_id
  ),
  user_imp AS (
    SELECT user_id, menu_item_id, COUNT(*)::int AS imp_count
    FROM menu_item_impressions
    WHERE date > CURRENT_DATE - INTERVAL '14 days'
    GROUP BY user_id, menu_item_id
  ),
  user_confirmed AS (
    SELECT DISTINCT o.user_id, oi.menu_item_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ('confirmed','completed')
  ),
  active_items AS (
    SELECT mi.id, mi.embedding
    FROM menu_items mi
    JOIN vendors v ON v.id = mi.vendor_id
    WHERE mi.is_available = true
      AND v.is_active = true
      AND mi.embedding IS NOT NULL
  ),
  candidates AS (
    SELECT
      up.user_id,
      ai.id AS menu_item_id,
      COALESCE(1.0 - (ai.embedding <=> ue.embedding), 0)::numeric
        + 0.5 * LN(1 + COALESCE(t.decay_qty, 0))::numeric AS rank_score,
      COALESCE(ui.imp_count, 0) AS imp_count
    FROM user_pool up
    CROSS JOIN active_items ai
    LEFT JOIN user_embeddings ue ON ue.user_id = up.user_id
    LEFT JOIN trending t ON t.menu_item_id = ai.id
    LEFT JOIN user_imp ui ON ui.user_id = up.user_id AND ui.menu_item_id = ai.id
    WHERE NOT EXISTS (
      SELECT 1 FROM user_confirmed uc
      WHERE uc.user_id = up.user_id AND uc.menu_item_id = ai.id
    )
  ),
  ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY rank_score DESC) AS r
    FROM candidates
  ),
  top_pool AS (
    SELECT user_id, menu_item_id, imp_count
    FROM ranked WHERE r <= 30
  ),
  sampled AS (
    SELECT
      user_id, menu_item_id,
      (imp_count + 1)::numeric AS beta,
      (1 - power(1 - random(), 1.0 / (imp_count + 1)))::numeric AS theta
    FROM top_pool
  ),
  picked AS (
    SELECT DISTINCT ON (user_id)
      user_id, menu_item_id, theta, beta
    FROM sampled
    ORDER BY user_id, theta DESC
  ),
  ins AS (
    INSERT INTO daily_picks (user_id, date, menu_item_id, theta, beta)
    SELECT user_id, CURRENT_DATE, menu_item_id, theta, beta FROM picked
    ON CONFLICT (user_id, date) DO UPDATE
      SET menu_item_id = EXCLUDED.menu_item_id,
          theta = EXCLUDED.theta,
          beta = EXCLUDED.beta
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM ins;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION compute_daily_picks() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compute_daily_picks') THEN
    PERFORM cron.schedule(
      'compute_daily_picks',
      '0 2 * * *',
      $job$SELECT public.compute_daily_picks();$job$
    );
  END IF;
END $$;

-- Immediate backfill so the surprise card appears the moment this migration applies.
SELECT public.compute_daily_picks();
