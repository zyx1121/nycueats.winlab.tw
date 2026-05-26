-- ============================================================
-- P3: User preference tracking + personalised ranking
--
-- 1. user_tag_preferences — per (user, tag) score 累積，每次 order
--    confirmed 加一筆 +qty 分。
-- 2. user_nutrition_profile — per user running avg of consumed
--    calories/protein/sodium/sugar，用 incremental weighted mean。
-- 3. Trigger update_user_preferences_on_confirm — orders.status
--    'pending' → 'confirmed' 觸發累積，避免下單未確認就影響推薦。
-- 4. SQL function rank_menu_items_for_home(p_area_id, p_limit) —
--    SECURITY DEFINER，內部用 auth.uid() 取 caller 身份做 ranking。
--    回傳 tag_match × nutrition_similarity × trend bonus 加權後的
--    final score + explainable top_tag_label。
-- ============================================================

-- ============================================================
-- user_tag_preferences
-- ============================================================
CREATE TABLE user_tag_preferences (
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_slug      text NOT NULL REFERENCES tag_vocabulary(slug) ON DELETE CASCADE,
  score         numeric NOT NULL DEFAULT 0 CHECK (score >= 0),
  last_event_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tag_slug)
);

CREATE INDEX user_tag_preferences_user_score_idx
  ON user_tag_preferences (user_id, score DESC);

ALTER TABLE user_tag_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_tag_preferences_read_own" ON user_tag_preferences
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- user_nutrition_profile — running avg
-- ============================================================
CREATE TABLE user_nutrition_profile (
  user_id       uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  avg_calories  numeric,
  avg_protein   numeric,
  avg_sodium    numeric,
  avg_sugar     numeric,
  sample_count  int NOT NULL DEFAULT 0,
  last_event_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE user_nutrition_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_nutrition_profile_read_own" ON user_nutrition_profile
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- Trigger function: 確認訂單時累積 preferences
-- ============================================================
CREATE OR REPLACE FUNCTION update_user_preferences_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 只在 pending → confirmed 觸發
  IF NEW.status IS DISTINCT FROM 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- 累積 tag preferences (weight = qty)
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

  -- 累積 nutrition profile (incremental weighted mean)
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

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_user_preferences_on_confirm() FROM PUBLIC;

CREATE TRIGGER update_preferences_on_order_confirm
  AFTER UPDATE OF status ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed')
  EXECUTE FUNCTION update_user_preferences_on_confirm();

-- ============================================================
-- rank_menu_items_for_home — ranking function
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
  mi.tags,
  mi.calories,
  mi.protein,
  mi.sodium,
  mi.vendor_id,
  v.name AS vendor_name,
  v.is_open AS vendor_is_open,
  -- final score = tag_match * 10 + nutrition_sim * 2 + log(trend+1) * 5 + open_bonus
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
  -- top tag (explainable badge)
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

-- 只給 authenticated + anon 呼叫，function 內部自己用 auth.uid() 鎖身份
GRANT EXECUTE ON FUNCTION rank_menu_items_for_home(uuid, int) TO anon, authenticated;
