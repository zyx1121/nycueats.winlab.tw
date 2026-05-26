-- Recommendation engine upgrade — PR #1 of 4.
--
-- Replaces the linear tag-match × 10 + nutrition × 2 + log(trend) × 5 ranking
-- with three improvements:
--
--   1. Semantic user vector — aggregate the embeddings of the items each user
--      has confirmed. Recommend = cosine similarity against menu_items.embedding.
--      This learns continuous taste, not just 42 discrete tag slugs.
--
--   2. Z-score normalisation — raw factors (user_sim, nutrition_sim, ln(trend))
--      live on wildly different scales, so the old × 10 / × 5 / × 2 weights had
--      no real meaning. Normalising each factor in the candidate pool lets the
--      coefficients actually mean "1× as influential".
--
--   3. MMR diversity rerank — top of the pool reranked with Maximal Marginal
--      Relevance (λ = 0.7). Stops the homepage filling up with five variants
--      of the same dish.
--
-- Cold-start (anonymous / no orders) degrades gracefully: user vector NULL →
-- z_user clamps to 0 → trend + nutrition + open_bonus drive the ranking.

-- =====================================================================
-- 1. user_embeddings — materialised mean of confirmed items' embeddings
-- =====================================================================
CREATE TABLE IF NOT EXISTS user_embeddings (
  user_id    uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  embedding  vector(512) NOT NULL,
  n_orders   int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_embeddings_read_own" ON user_embeddings;
CREATE POLICY "user_embeddings_read_own" ON user_embeddings
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- =====================================================================
-- 2. Extend confirm trigger to also recompute user_embeddings
--    Full recompute (not incremental) — per-user order volume is small and
--    avoids floating-point drift across many incremental updates.
-- =====================================================================
CREATE OR REPLACE FUNCTION update_user_preferences_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Tag preferences (unchanged from before)
  INSERT INTO user_tag_preferences (user_id, tag_slug, score, last_event_at)
  SELECT
    NEW.user_id,
    tag,
    SUM(oi.qty)::numeric,
    now()
  FROM order_items oi
  JOIN menu_items mi ON mi.id = oi.menu_item_id
  CROSS JOIN LATERAL unnest(mi.ai_tags) AS t(tag)
  WHERE oi.order_id = NEW.id
  GROUP BY tag
  ON CONFLICT (user_id, tag_slug) DO UPDATE
    SET score = user_tag_preferences.score + EXCLUDED.score,
        last_event_at = now();

  -- Nutrition profile (unchanged)
  WITH order_avg AS (
    SELECT
      AVG(mi.calories::numeric) FILTER (WHERE mi.calories IS NOT NULL) AS calories,
      AVG(mi.protein) FILTER (WHERE mi.protein IS NOT NULL) AS protein,
      AVG(mi.sodium)  FILTER (WHERE mi.sodium IS NOT NULL)  AS sodium,
      AVG(mi.sugar)   FILTER (WHERE mi.sugar IS NOT NULL)   AS sugar,
      COUNT(*) AS n
    FROM order_items oi
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = NEW.id
  )
  INSERT INTO user_nutrition_profile
    (user_id, avg_calories, avg_protein, avg_sodium, avg_sugar, sample_count, last_event_at)
  SELECT NEW.user_id, calories, protein, sodium, sugar, n, now()
  FROM order_avg
  WHERE n > 0
  ON CONFLICT (user_id) DO UPDATE
    SET
      avg_calories = CASE
        WHEN EXCLUDED.avg_calories IS NULL THEN user_nutrition_profile.avg_calories
        WHEN user_nutrition_profile.avg_calories IS NULL THEN EXCLUDED.avg_calories
        ELSE (user_nutrition_profile.avg_calories * user_nutrition_profile.sample_count
              + EXCLUDED.avg_calories * EXCLUDED.sample_count)
             / (user_nutrition_profile.sample_count + EXCLUDED.sample_count)
      END,
      avg_protein = CASE
        WHEN EXCLUDED.avg_protein IS NULL THEN user_nutrition_profile.avg_protein
        WHEN user_nutrition_profile.avg_protein IS NULL THEN EXCLUDED.avg_protein
        ELSE (user_nutrition_profile.avg_protein * user_nutrition_profile.sample_count
              + EXCLUDED.avg_protein * EXCLUDED.sample_count)
             / (user_nutrition_profile.sample_count + EXCLUDED.sample_count)
      END,
      avg_sodium = CASE
        WHEN EXCLUDED.avg_sodium IS NULL THEN user_nutrition_profile.avg_sodium
        WHEN user_nutrition_profile.avg_sodium IS NULL THEN EXCLUDED.avg_sodium
        ELSE (user_nutrition_profile.avg_sodium * user_nutrition_profile.sample_count
              + EXCLUDED.avg_sodium * EXCLUDED.sample_count)
             / (user_nutrition_profile.sample_count + EXCLUDED.sample_count)
      END,
      avg_sugar = CASE
        WHEN EXCLUDED.avg_sugar IS NULL THEN user_nutrition_profile.avg_sugar
        WHEN user_nutrition_profile.avg_sugar IS NULL THEN EXCLUDED.avg_sugar
        ELSE (user_nutrition_profile.avg_sugar * user_nutrition_profile.sample_count
              + EXCLUDED.avg_sugar * EXCLUDED.sample_count)
             / (user_nutrition_profile.sample_count + EXCLUDED.sample_count)
      END,
      sample_count = user_nutrition_profile.sample_count + EXCLUDED.sample_count,
      last_event_at = now();

  -- NEW: recompute user embedding (mean of all confirmed items' embeddings)
  INSERT INTO user_embeddings (user_id, embedding, n_orders, updated_at)
  SELECT
    NEW.user_id,
    AVG(mi.embedding)::vector(512),
    COUNT(*)::int,
    now()
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  JOIN menu_items mi ON mi.id = oi.menu_item_id
  WHERE o.user_id = NEW.user_id
    AND o.status IN ('confirmed', 'completed')
    AND mi.embedding IS NOT NULL
  HAVING COUNT(*) > 0
  ON CONFLICT (user_id) DO UPDATE
    SET embedding = EXCLUDED.embedding,
        n_orders = EXCLUDED.n_orders,
        updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_user_preferences_on_confirm() FROM PUBLIC;

-- =====================================================================
-- 3. Backfill user_embeddings from existing confirmed orders
-- =====================================================================
INSERT INTO user_embeddings (user_id, embedding, n_orders, updated_at)
SELECT
  o.user_id,
  AVG(mi.embedding)::vector(512),
  COUNT(*)::int,
  now()
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
JOIN menu_items mi ON mi.id = oi.menu_item_id
WHERE o.status IN ('confirmed', 'completed')
  AND mi.embedding IS NOT NULL
GROUP BY o.user_id
HAVING COUNT(*) > 0
ON CONFLICT (user_id) DO UPDATE
  SET embedding = EXCLUDED.embedding,
      n_orders = EXCLUDED.n_orders,
      updated_at = now();

-- =====================================================================
-- 4. Rewrite rank_menu_items_for_home with semantic + z-norm + MMR
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

  -- Candidate pool: raw 3 factors → z-score normalise → blended score → top N
  DROP TABLE IF EXISTS _rank_cand;
  CREATE TEMP TABLE _rank_cand ON COMMIT DROP AS
  WITH trending AS (
    SELECT oi.menu_item_id, SUM(oi.qty)::numeric AS recent_qty
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ('confirmed','completed')
      AND o.created_at > now() - interval '7 days'
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
      LN(1 + COALESCE(t.recent_qty, 0))::numeric AS raw_trend
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

  -- MMR rerank: λ × relevance − (1 − λ) × max similarity-to-already-selected
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

  -- Final projection — preserves original 16-column shape for the UI
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
