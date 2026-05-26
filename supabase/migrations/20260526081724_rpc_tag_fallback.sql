-- ============================================================
-- Fallback for empty vendor tags：home / search RPC 兩支都
-- COALESCE vendor.tags ↔ ai_tags 翻成中文 label
--
-- 24/85 items 沒有 vendor tags 但 ai_tags 是 100% 覆蓋（P2 backfill），
-- UI 上呈現的 `tags` 欄位需要永遠有值才不會有空白卡片。
-- 不動 menu_items.tags 本身（保留 vendor curation 的 source of truth）。
-- ============================================================

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH caller AS (
  SELECT (SELECT auth.uid()) AS user_id
),
user_tags AS (
  SELECT tag_slug, score
  FROM user_tag_preferences
  WHERE user_id = (SELECT user_id FROM caller)
),
user_nutr AS (
  SELECT avg_calories, avg_protein, avg_sodium, sample_count
  FROM user_nutrition_profile
  WHERE user_id = (SELECT user_id FROM caller)
),
trending AS (
  SELECT oi.menu_item_id, SUM(oi.qty)::numeric AS recent_qty
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.status IN ('confirmed', 'completed')
    AND o.created_at > now() - interval '7 days'
  GROUP BY oi.menu_item_id
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
  (
    COALESCE((
      SELECT SUM(ut.score)
      FROM user_tags ut
      WHERE ut.tag_slug = ANY (mi.ai_tags)
    ), 0) * 10
    +
    CASE WHEN (SELECT sample_count FROM user_nutr) IS NOT NULL THEN
      2.0 / (
        1.0
        + COALESCE(ABS(mi.calories - (SELECT avg_calories FROM user_nutr)) / 100.0, 0)
        + COALESCE(ABS(mi.protein  - (SELECT avg_protein  FROM user_nutr)) / 10.0, 0)
        + COALESCE(ABS(mi.sodium   - (SELECT avg_sodium   FROM user_nutr)) / 200.0, 0)
      )
    ELSE 0 END
    +
    LN(1 + COALESCE((SELECT recent_qty FROM trending t WHERE t.menu_item_id = mi.id), 0)) * 5
    +
    CASE WHEN v.is_open THEN 1 ELSE 0 END
  )::numeric AS match_score,
  (
    SELECT tv.label
    FROM user_tags ut
    JOIN tag_vocabulary tv ON tv.slug = ut.tag_slug
    WHERE ut.tag_slug = ANY (mi.ai_tags)
    ORDER BY ut.score DESC
    LIMIT 1
  ) AS top_tag_label
FROM menu_items mi
JOIN vendors v ON v.id = mi.vendor_id
WHERE mi.is_available = true
  AND v.is_active = true
  AND (
    p_area_id IS NULL
    OR EXISTS (
      SELECT 1 FROM vendor_areas va
      WHERE va.vendor_id = v.id AND va.area_id = p_area_id
    )
  )
ORDER BY match_score DESC NULLS LAST, mi.name ASC
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION rank_menu_items_for_home(uuid, int) TO anon, authenticated;


CREATE OR REPLACE FUNCTION hybrid_search(
  p_query           text,
  p_query_embedding vector(512) DEFAULT NULL,
  p_area_id         uuid DEFAULT NULL,
  p_limit           int  DEFAULT 30
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH keyword AS (
  SELECT mi.id, RANK() OVER (ORDER BY similarity(mi.name, p_query) DESC) AS r
  FROM menu_items mi
  WHERE p_query IS NOT NULL
    AND length(p_query) > 0
    AND similarity(mi.name, p_query) > 0.05
  ORDER BY similarity(mi.name, p_query) DESC
  LIMIT 50
),
semantic AS (
  SELECT mi.id, RANK() OVER (ORDER BY mi.embedding <=> p_query_embedding) AS r
  FROM menu_items mi
  WHERE p_query_embedding IS NOT NULL
    AND mi.embedding IS NOT NULL
  ORDER BY mi.embedding <=> p_query_embedding
  LIMIT 50
),
all_ranked AS (
  SELECT id, r::bigint AS k_rank, NULL::bigint AS s_rank FROM keyword
  UNION ALL
  SELECT id, NULL::bigint AS k_rank, r::bigint AS s_rank FROM semantic
),
fused AS (
  SELECT
    id,
    SUM(
      COALESCE(1.0 / (60 + k_rank), 0)
      + COALESCE(1.0 / (60 + s_rank), 0)
    )::numeric AS rrf
  FROM all_ranked
  GROUP BY id
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
  f.rrf AS match_score,
  NULL::text AS top_tag_label
FROM fused f
JOIN menu_items mi ON mi.id = f.id
JOIN vendors v ON v.id = mi.vendor_id
WHERE mi.is_available = true
  AND v.is_active = true
  AND (
    p_area_id IS NULL
    OR EXISTS (
      SELECT 1 FROM vendor_areas va
      WHERE va.vendor_id = v.id AND va.area_id = p_area_id
    )
  )
ORDER BY f.rrf DESC, mi.name ASC
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION hybrid_search(text, vector, uuid, int) TO anon, authenticated;
