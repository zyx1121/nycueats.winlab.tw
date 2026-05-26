-- ============================================================
-- P4: pgvector embeddings + 自然語言 hybrid search
--
-- 1. enable vector + pg_trgm
-- 2. menu_items.embedding vector(512) — text-embedding-3-small
--    truncated to 512 dim via Matryoshka representation learning
-- 3. HNSW index on embedding (cosine) + GIN trigram index on name
-- 4. hybrid_search(query, query_embedding) — RRF (k=60) of trigram
--    keyword match + semantic vector match。query_embedding 可為 NULL
--    讓 OpenAI 未配置時降級為 keyword-only
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE menu_items ADD COLUMN embedding vector(512);

-- HNSW for cosine similarity（適合 normalized embeddings）
CREATE INDEX menu_items_embedding_hnsw_idx
  ON menu_items USING hnsw (embedding vector_cosine_ops);

-- Trigram index for 中文 fuzzy name match
CREATE INDEX menu_items_name_trgm_idx
  ON menu_items USING gin (name gin_trgm_ops);

-- ============================================================
-- hybrid_search — RRF (Reciprocal Rank Fusion) k=60
-- ============================================================
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
  mi.tags,
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
