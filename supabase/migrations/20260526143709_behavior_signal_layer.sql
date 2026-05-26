-- Behaviour signal layer — PR #2 of 4.
--
--   1. menu_item_impressions table — 1 row per user × item × date.
--      Lets the recommender detect repeated exposure without engagement.
--
--   2. Trend decay — replace SUM(qty over 7d) with SUM(qty × exp(-Δt / 3d)).
--      Fresh orders count more; week-old hits decay toward zero. Kills the
--      Matthew effect where last week's runaway item stays pinned forever.
--
--   3. Skip-aware user vector — daily pg_cron rebuilds user_embeddings as
--      Σ confirmed_emb − 0.3 × Σ skipped_emb, where "skipped" = "impressed
--      ≥ 3 days ago and never confirmed". β = 0.3 keeps skip a weak negative
--      so noise can't dominate the vector. Cosine ranking is scale-invariant,
--      so no l2-normalise step needed.
--
-- Confirm trigger stays (instant feedback when user orders). Cron picks up
-- skip signal asynchronously since impressions can't sanely fire triggers.

-- =====================================================================
-- 1. menu_item_impressions
-- =====================================================================
CREATE TABLE IF NOT EXISTS menu_item_impressions (
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  menu_item_id  uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  date          date NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, menu_item_id, date)
);

CREATE INDEX IF NOT EXISTS menu_item_impressions_user_date_idx
  ON menu_item_impressions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS menu_item_impressions_item_idx
  ON menu_item_impressions (menu_item_id);

ALTER TABLE menu_item_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_item_impressions_read_own" ON menu_item_impressions;
CREATE POLICY "menu_item_impressions_read_own" ON menu_item_impressions
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "menu_item_impressions_write_own" ON menu_item_impressions;
CREATE POLICY "menu_item_impressions_write_own" ON menu_item_impressions
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

-- =====================================================================
-- 2. Trend decay — rewrite ranking RPC with exp decay over τ = 3 days
-- =====================================================================
CREATE OR REPLACE FUNCTION rank_menu_items_for_home(
  p_area_id uuid DEFAULT NULL,
  p_limit   int  DEFAULT 60
)
RETURNS TABLE (
  id              uuid,
  name            text,
  description     text,
  price           numeric,
  image_url       text,
  ai_tags         text[],
  ai_description  text,
  tags            text[],
  calories        int,
  protein         numeric,
  sodium          numeric,
  vendor_id       uuid,
  vendor_name     text,
  vendor_is_open  boolean,
  match_score     numeric,
  top_tag_label   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_user_id   uuid := (SELECT auth.uid());
  v_user_vec  vector(512);
  v_nutr      record;
  v_lambda    numeric := 0.7;
  v_pool_size int := GREATEST(p_limit * 3, 30);
  v_selected  uuid[] := ARRAY[]::uuid[];
  v_pick      uuid;
BEGIN
  SELECT ue.embedding INTO v_user_vec
  FROM user_embeddings ue WHERE ue.user_id = v_user_id;

  SELECT * INTO v_nutr
  FROM user_nutrition_profile WHERE user_id = v_user_id;

  DROP TABLE IF EXISTS _rank_cand;
  CREATE TEMP TABLE _rank_cand ON COMMIT DROP AS
  WITH trending AS (
    SELECT
      oi.menu_item_id,
      SUM(
        oi.qty
        * EXP(-EXTRACT(EPOCH FROM (now() - o.created_at)) / (3.0 * 86400))
      )::numeric AS decay_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ('confirmed','completed')
      AND o.created_at > now() - interval '14 days'
    GROUP BY oi.menu_item_id
  ),
  raw AS (
    SELECT
      mi.id,
      mi.embedding,
      v.is_open,
      CASE
        WHEN v_user_vec IS NOT NULL AND mi.embedding IS NOT NULL
        THEN (1.0 - (mi.embedding <=> v_user_vec))::numeric
        ELSE 0::numeric
      END AS raw_user_sim,
      CASE
        WHEN v_nutr.sample_count IS NOT NULL THEN
          1.0 / (
            1.0
            + COALESCE(ABS(mi.calories - v_nutr.avg_calories) / 100.0, 0)
            + COALESCE(ABS(mi.protein  - v_nutr.avg_protein)  / 10.0,  0)
            + COALESCE(ABS(mi.sodium   - v_nutr.avg_sodium)   / 200.0, 0)
          )
        ELSE 0::numeric
      END AS raw_nutr_sim,
      LN(1 + COALESCE(t.decay_qty, 0))::numeric AS raw_trend
    FROM menu_items mi
    JOIN vendors v ON v.id = mi.vendor_id
    LEFT JOIN trending t ON t.menu_item_id = mi.id
    WHERE mi.is_available = true
      AND v.is_active = true
      AND (
        p_area_id IS NULL
        OR EXISTS (
          SELECT 1 FROM vendor_areas va
          WHERE va.vendor_id = v.id AND va.area_id = p_area_id
        )
      )
  ),
  normed AS (
    SELECT
      r.id, r.embedding, r.is_open,
      (r.raw_user_sim - AVG(r.raw_user_sim) OVER ())
        / NULLIF(STDDEV_POP(r.raw_user_sim) OVER (), 0) AS z_user,
      (r.raw_nutr_sim - AVG(r.raw_nutr_sim) OVER ())
        / NULLIF(STDDEV_POP(r.raw_nutr_sim) OVER (), 0) AS z_nutr,
      (r.raw_trend - AVG(r.raw_trend) OVER ())
        / NULLIF(STDDEV_POP(r.raw_trend) OVER (), 0) AS z_trend
    FROM raw r
  )
  SELECT
    id, embedding,
    (COALESCE(z_user, 0) + COALESCE(z_nutr, 0) + COALESCE(z_trend, 0)
      + CASE WHEN is_open THEN 0.5 ELSE 0 END)::numeric AS score
  FROM normed
  ORDER BY score DESC NULLS LAST
  LIMIT v_pool_size;

  LOOP
    EXIT WHEN COALESCE(array_length(v_selected, 1), 0) >= p_limit;

    SELECT c.id INTO v_pick
    FROM _rank_cand c
    WHERE c.id <> ALL(v_selected)
    ORDER BY (
      v_lambda * c.score
      - (1 - v_lambda) * COALESCE(
          (SELECT MAX(1.0 - (c.embedding <=> s.embedding))::numeric
           FROM _rank_cand s
           WHERE s.id = ANY(v_selected)
             AND s.embedding IS NOT NULL
             AND c.embedding IS NOT NULL),
          0::numeric
        )
    ) DESC NULLS LAST, c.id
    LIMIT 1;

    EXIT WHEN v_pick IS NULL;
    v_selected := array_append(v_selected, v_pick);
  END LOOP;

  RETURN QUERY
  WITH ordered AS (
    SELECT u.id, u.ord
    FROM unnest(v_selected) WITH ORDINALITY AS u(id, ord)
  ),
  user_tags AS (
    SELECT tag_slug, score FROM user_tag_preferences
    WHERE user_id = v_user_id
  )
  SELECT
    mi.id,
    mi.name,
    mi.description,
    mi.price,
    mi.image_url,
    mi.ai_tags,
    mi.ai_description,
    COALESCE(
      NULLIF(mi.tags, ARRAY[]::text[]),
      ARRAY(
        SELECT tv.label
        FROM unnest(mi.ai_tags) AS t(slug)
        JOIN tag_vocabulary tv ON tv.slug = t.slug
        ORDER BY tv.sort_order
      )
    ) AS tags,
    mi.calories,
    mi.protein,
    mi.sodium,
    mi.vendor_id,
    v.name AS vendor_name,
    v.is_open AS vendor_is_open,
    c.score AS match_score,
    (
      SELECT tv.label
      FROM user_tags ut
      JOIN tag_vocabulary tv ON tv.slug = ut.tag_slug
      WHERE ut.tag_slug = ANY (mi.ai_tags)
      ORDER BY ut.score DESC
      LIMIT 1
    ) AS top_tag_label
  FROM ordered o
  JOIN _rank_cand c ON c.id = o.id
  JOIN menu_items mi ON mi.id = o.id
  JOIN vendors v ON v.id = mi.vendor_id
  ORDER BY o.ord;
END;
$$;

REVOKE EXECUTE ON FUNCTION rank_menu_items_for_home(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rank_menu_items_for_home(uuid, int) TO anon, authenticated;

-- =====================================================================
-- 3. Helper: combine confirmed and skipped vectors with β skip-weight.
--    pgvector has no native scalar-multiplication operator, so we unpack
--    the vectors element-wise. Called once per user per cron run — the
--    O(dim) work is fine at MVP scale.
-- =====================================================================
CREATE OR REPLACE FUNCTION combine_user_vectors(
  confirmed vector,
  skipped   vector,
  beta      numeric
)
RETURNS vector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN skipped IS NULL THEN confirmed
    ELSE (
      SELECT array_agg(uc.c - beta * us.s ORDER BY uc.ord)::vector
      FROM unnest(confirmed::real[]) WITH ORDINALITY AS uc(c, ord)
      JOIN unnest(skipped::real[])   WITH ORDINALITY AS us(s, ord_s) ON uc.ord = us.ord_s
    )
  END
$$;

-- =====================================================================
-- 4. Skip-aware user embedding refresh — daily pg_cron job
-- =====================================================================
CREATE OR REPLACE FUNCTION refresh_all_user_embeddings()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  WITH confirmed AS (
    SELECT
      o.user_id,
      AVG(mi.embedding)::vector(512) AS vec,
      COUNT(*)::int AS n
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE o.status IN ('confirmed','completed')
      AND mi.embedding IS NOT NULL
    GROUP BY o.user_id
  ),
  skipped AS (
    SELECT
      imp.user_id,
      AVG(mi.embedding)::vector(512) AS vec
    FROM menu_item_impressions imp
    JOIN menu_items mi ON mi.id = imp.menu_item_id
    WHERE imp.date < CURRENT_DATE - INTERVAL '3 days'
      AND mi.embedding IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM order_items oi2
        JOIN orders o2 ON o2.id = oi2.order_id
        WHERE o2.user_id = imp.user_id
          AND oi2.menu_item_id = imp.menu_item_id
          AND o2.status IN ('confirmed','completed')
      )
    GROUP BY imp.user_id
  ),
  blended AS (
    SELECT
      c.user_id,
      combine_user_vectors(c.vec, s.vec, 0.3) AS vec,
      c.n AS n_orders
    FROM confirmed c
    LEFT JOIN skipped s ON s.user_id = c.user_id
  )
  INSERT INTO user_embeddings (user_id, embedding, n_orders, updated_at)
  SELECT user_id, vec::vector(512), n_orders, now() FROM blended
  WHERE vec IS NOT NULL
  ON CONFLICT (user_id) DO UPDATE
    SET embedding = EXCLUDED.embedding,
        n_orders = EXCLUDED.n_orders,
        updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION refresh_all_user_embeddings() FROM PUBLIC;

-- Schedule daily 02:00 UTC (10:00 Asia/Taipei) — late enough that
-- yesterday's impression rows have settled, early enough that
-- morning recommendations see updated vectors.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_user_embeddings') THEN
    PERFORM cron.schedule(
      'refresh_user_embeddings',
      '0 2 * * *',
      $job$SELECT public.refresh_all_user_embeddings();$job$
    );
  END IF;
END $$;
