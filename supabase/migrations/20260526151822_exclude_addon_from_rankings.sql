-- Exclude items tagged "addon" from homepage rank + daily surprise pick.
--
-- These are sides / hot-pot add-ons (e.g. 加點肉盤) that don't make sense as
-- a standalone recommendation. Search is left alone — if a user types
-- "加點肉盤" they should still find it.
--
-- Both functions get a NOT ('addon' = ANY(ai_tags)) clause guarded with
-- COALESCE so NULL ai_tags rows aren't accidentally filtered out.

CREATE OR REPLACE FUNCTION rank_menu_items_for_home(
  p_area_id     uuid        DEFAULT NULL,
  p_limit       int         DEFAULT 60,
  p_context_vec vector(512) DEFAULT NULL
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
      SUM(oi.qty * EXP(-EXTRACT(EPOCH FROM (now() - o.created_at)) / (3.0 * 86400)))::numeric AS decay_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ('confirmed','completed')
      AND o.created_at > now() - interval '14 days'
    GROUP BY oi.menu_item_id
  ),
  raw AS (
    SELECT
      mi.id, mi.embedding, v.is_open,
      CASE
        WHEN mi.embedding IS NULL THEN 0::numeric
        WHEN v_user_vec IS NULL AND p_context_vec IS NULL THEN 0::numeric
        WHEN v_user_vec IS NOT NULL AND p_context_vec IS NULL THEN
          (1.0 - (mi.embedding <=> v_user_vec))::numeric
        WHEN v_user_vec IS NULL AND p_context_vec IS NOT NULL THEN
          (1.0 - (mi.embedding <=> p_context_vec))::numeric
        ELSE
          (0.7 * (1.0 - (mi.embedding <=> v_user_vec))
           + 0.3 * (1.0 - (mi.embedding <=> p_context_vec)))::numeric
      END AS raw_user_sim,
      CASE WHEN v_nutr.sample_count IS NOT NULL THEN
        1.0 / (1.0
          + COALESCE(ABS(mi.calories - v_nutr.avg_calories) / 100.0, 0)
          + COALESCE(ABS(mi.protein  - v_nutr.avg_protein)  / 10.0,  0)
          + COALESCE(ABS(mi.sodium   - v_nutr.avg_sodium)   / 200.0, 0))
        ELSE 0::numeric END AS raw_nutr_sim,
      LN(1 + COALESCE(t.decay_qty, 0))::numeric AS raw_trend
    FROM menu_items mi
    JOIN vendors v ON v.id = mi.vendor_id
    LEFT JOIN trending t ON t.menu_item_id = mi.id
    WHERE mi.is_available = true AND v.is_active = true
      AND NOT COALESCE('addon' = ANY(mi.ai_tags), false)
      AND (p_area_id IS NULL OR EXISTS (
        SELECT 1 FROM vendor_areas va WHERE va.vendor_id = v.id AND va.area_id = p_area_id))
  ),
  normed AS (
    SELECT r.id, r.embedding, r.is_open,
      (r.raw_user_sim - AVG(r.raw_user_sim) OVER ()) / NULLIF(STDDEV_POP(r.raw_user_sim) OVER (), 0) AS z_user,
      (r.raw_nutr_sim - AVG(r.raw_nutr_sim) OVER ()) / NULLIF(STDDEV_POP(r.raw_nutr_sim) OVER (), 0) AS z_nutr,
      (r.raw_trend - AVG(r.raw_trend) OVER ()) / NULLIF(STDDEV_POP(r.raw_trend) OVER (), 0) AS z_trend
    FROM raw r
  )
  SELECT id, embedding,
    (COALESCE(z_user, 0) + COALESCE(z_nutr, 0) + COALESCE(z_trend, 0)
      + CASE WHEN is_open THEN 0.5 ELSE 0 END)::numeric AS score
  FROM normed ORDER BY score DESC NULLS LAST LIMIT v_pool_size;

  LOOP
    EXIT WHEN COALESCE(array_length(v_selected, 1), 0) >= p_limit;
    SELECT c.id INTO v_pick
    FROM _rank_cand c
    WHERE c.id <> ALL(v_selected)
    ORDER BY (v_lambda * c.score - (1 - v_lambda) * COALESCE(
      (SELECT MAX(1.0 - (c.embedding <=> s.embedding))::numeric
       FROM _rank_cand s WHERE s.id = ANY(v_selected)
         AND s.embedding IS NOT NULL AND c.embedding IS NOT NULL), 0::numeric)
    ) DESC NULLS LAST, c.id LIMIT 1;
    EXIT WHEN v_pick IS NULL;
    v_selected := array_append(v_selected, v_pick);
  END LOOP;

  RETURN QUERY
  WITH ordered AS (
    SELECT u.id, u.ord FROM unnest(v_selected) WITH ORDINALITY AS u(id, ord)
  ),
  user_tags AS (
    SELECT tag_slug, score FROM user_tag_preferences WHERE user_id = v_user_id
  )
  SELECT mi.id, mi.name, mi.description, mi.price, mi.image_url,
    mi.ai_tags, mi.ai_description,
    COALESCE(NULLIF(mi.tags, ARRAY[]::text[]),
      ARRAY(SELECT tv.label FROM unnest(mi.ai_tags) AS t(slug)
            JOIN tag_vocabulary tv ON tv.slug = t.slug ORDER BY tv.sort_order)) AS tags,
    mi.calories, mi.protein, mi.sodium, mi.vendor_id, v.name, v.is_open, c.score,
    (SELECT tv.label FROM user_tags ut JOIN tag_vocabulary tv ON tv.slug = ut.tag_slug
     WHERE ut.tag_slug = ANY (mi.ai_tags) ORDER BY ut.score DESC LIMIT 1) AS top_tag_label
  FROM ordered o
  JOIN _rank_cand c ON c.id = o.id
  JOIN menu_items mi ON mi.id = o.id
  JOIN vendors v ON v.id = mi.vendor_id
  ORDER BY o.ord;
END;
$$;

REVOKE EXECUTE ON FUNCTION rank_menu_items_for_home(uuid, int, vector) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rank_menu_items_for_home(uuid, int, vector) TO anon, authenticated;

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
      AND NOT COALESCE('addon' = ANY(mi.ai_tags), false)
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

-- Recompute today's picks now that addon items are excluded.
SELECT public.compute_daily_picks();
