-- supabase/migrations/20260526220000_hybrid_search_filters.sql

-- Remove old 4-param overload so the new signature replaces it cleanly.
DROP FUNCTION IF EXISTS hybrid_search(text, vector, uuid, int);

CREATE FUNCTION hybrid_search(
  p_query           text,
  p_query_embedding vector(512) DEFAULT NULL,
  p_area_id         uuid        DEFAULT NULL,
  p_limit           int         DEFAULT 30,
  -- filter params — all DEFAULT NULL means "no filter applied"
  p_open            boolean     DEFAULT NULL,
  p_price_min       int         DEFAULT NULL,
  p_price_max       int         DEFAULT NULL,
  p_cal_min         int         DEFAULT NULL,
  p_cal_max         int         DEFAULT NULL,
  p_tags            text[]      DEFAULT NULL,
  p_sort            text        DEFAULT NULL,   -- 'price_asc'|'price_desc'|'cal_asc'|NULL=RRF
  p_dates           date[]      DEFAULT NULL
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
  v.name  AS vendor_name,
  v.is_open AS vendor_is_open,
  f.rrf   AS match_score,
  NULL::text AS top_tag_label
FROM fused f
JOIN menu_items mi ON mi.id = f.id
JOIN vendors    v  ON v.id  = mi.vendor_id
WHERE mi.is_available = true
  AND v.is_active     = true
  AND (p_area_id   IS NULL OR EXISTS (
        SELECT 1 FROM vendor_areas va
        WHERE va.vendor_id = v.id AND va.area_id = p_area_id))
  AND (p_open      IS NULL OR v.is_open         = p_open)
  AND (p_price_min IS NULL OR mi.price          >= p_price_min)
  AND (p_price_max IS NULL OR mi.price          <= p_price_max)
  AND (p_cal_min   IS NULL OR mi.calories       >= p_cal_min)
  AND (p_cal_max   IS NULL OR mi.calories       <= p_cal_max)
  AND (p_tags      IS NULL OR mi.ai_tags        && p_tags)
  AND (p_dates     IS NULL OR EXISTS (
        SELECT 1 FROM daily_slots ds
        WHERE ds.menu_item_id = mi.id
          AND ds.date         = ANY(p_dates)
          AND ds.max_qty      > ds.reserved_qty))
ORDER BY
  CASE p_sort
    WHEN 'price_asc'  THEN -mi.price::float      -- negate so DESC = cheapest first
    WHEN 'price_desc' THEN  mi.price::float
    WHEN 'cal_asc'    THEN -mi.calories::float   -- negate so DESC = lowest cal first
    ELSE f.rrf::float                            -- default: highest RRF score first
  END DESC NULLS LAST,
  mi.name ASC
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION
  hybrid_search(text, vector, uuid, int, boolean, int, int, int, int, text[], text, date[])
  TO anon, authenticated;
