-- ============================================================
-- P2: AI tag vocabulary + menu_items AI metadata columns
--
-- 1. tag_vocabulary — controlled vocab (slug + 中文 label + axis)
--    ~42 tags across 6 axes (taste / diet / cuisine / category /
--    temperature / occasion). LLM 只能從此 pool 中選 tag。
-- 2. menu_items.ai_tags / ai_description / ai_generated_at — AI
--    生成的 metadata 欄位，與 vendor 自填的 tags 並存。
-- 3. Trigger validate_ai_tags_in_vocab — DB 層強制 ai_tags 必須
--    全在 tag_vocabulary，避免 vocab drift。
-- ============================================================

CREATE TABLE tag_vocabulary (
  slug        text PRIMARY KEY,
  label       text NOT NULL,
  axis        text NOT NULL CHECK (axis IN ('taste','diet','cuisine','category','temperature','occasion')),
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tag_vocabulary ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tag_vocabulary_read" ON tag_vocabulary FOR SELECT USING (true);

-- 寫入只給 service_role + admin（admin 透過 has_role 檢查）
CREATE POLICY "tag_vocabulary_admin_write" ON tag_vocabulary FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid()) AND 'admin' = ANY (profiles.role)
    )
  );

-- ============================================================
-- 初始 vocab seed — 42 tags
-- ============================================================
INSERT INTO tag_vocabulary (slug, label, axis, sort_order) VALUES
  -- taste
  ('refreshing',  '清爽',   'taste', 10),
  ('rich',        '重口',   'taste', 20),
  ('spicy',       '辣',     'taste', 30),
  ('sweet',       '甜',     'taste', 40),
  ('savoury',     '鹹香',   'taste', 50),
  ('sour',        '酸',     'taste', 60),
  -- diet
  ('vegetarian',  '素食',   'diet', 10),
  ('high-protein','高蛋白', 'diet', 20),
  ('low-cal',     '低卡',   'diet', 30),
  ('low-sodium',  '低鹽',   'diet', 40),
  ('low-sugar',   '低糖',   'diet', 50),
  ('healthy',     '健康',   'diet', 60),
  -- cuisine
  ('taiwanese',   '台式',   'cuisine', 10),
  ('chinese',     '中式',   'cuisine', 20),
  ('japanese',    '日式',   'cuisine', 30),
  ('korean',      '韓式',   'cuisine', 40),
  ('cantonese',   '港式',   'cuisine', 50),
  ('thai',        '泰式',   'cuisine', 60),
  ('indian',      '印度',   'cuisine', 70),
  ('western',     '西式',   'cuisine', 80),
  ('italian',     '義式',   'cuisine', 90),
  ('american',    '美式',   'cuisine', 100),
  ('mexican',     '墨西哥', 'cuisine', 110),
  -- category
  ('rice',        '飯',     'category', 10),
  ('noodle',      '麵',     'category', 20),
  ('soup',        '湯品',   'category', 30),
  ('salad',       '沙拉',   'category', 40),
  ('sandwich',    '三明治', 'category', 50),
  ('drink',       '飲料',   'category', 60),
  ('dessert',     '甜點',   'category', 70),
  ('breakfast',   '早餐',   'category', 80),
  ('bento',       '便當',   'category', 90),
  ('hotpot',      '火鍋',   'category', 100),
  ('bbq',         '燒烤',   'category', 110),
  ('fried',       '炸物',   'category', 120),
  -- temperature
  ('hot',         '熱食',   'temperature', 10),
  ('cold',        '冷食',   'temperature', 20),
  ('frozen',      '冰品',   'temperature', 30),
  -- occasion
  ('addon',       '加購',   'occasion', 10),
  ('filling',     '飽足',   'occasion', 20),
  ('light',       '輕食',   'occasion', 30),
  ('comfort',     '療癒',   'occasion', 40);

-- ============================================================
-- menu_items AI metadata 欄位
-- ============================================================
ALTER TABLE menu_items
  ADD COLUMN ai_tags         text[] NOT NULL DEFAULT '{}',
  ADD COLUMN ai_description  text,
  ADD COLUMN ai_generated_at timestamptz;

CREATE INDEX menu_items_ai_tags_idx ON menu_items USING GIN (ai_tags);

-- ============================================================
-- validate_ai_tags — DB 強制 ai_tags ⊆ tag_vocabulary.slug
-- ============================================================
CREATE OR REPLACE FUNCTION validate_ai_tags() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  bad_tag text;
BEGIN
  IF NEW.ai_tags IS NULL OR NEW.ai_tags = '{}' THEN
    RETURN NEW;
  END IF;

  SELECT t INTO bad_tag
  FROM unnest(NEW.ai_tags) AS t
  WHERE NOT EXISTS (SELECT 1 FROM tag_vocabulary WHERE slug = t)
  LIMIT 1;

  IF bad_tag IS NOT NULL THEN
    RAISE EXCEPTION 'ai_tags contains slug % which is not in tag_vocabulary', bad_tag
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_ai_tags() FROM anon, authenticated;

CREATE TRIGGER menu_items_validate_ai_tags
  BEFORE INSERT OR UPDATE OF ai_tags ON menu_items
  FOR EACH ROW EXECUTE FUNCTION validate_ai_tags();
