-- Personalised reasons cache — PR #5 of 4 (LLM half).
--
-- One short Traditional-Chinese sentence per (user, menu_item) explaining
-- why we think this user will like the dish. Generated offline by the
-- `generate-reasons` edge function (OpenAI gpt-5.4-mini) and cached for 24h
-- to keep the homepage cheap (zero LLM cost on the serving path).
--
-- Lazy-fill model: the homepage's `after()` hook checks the cache and only
-- triggers the edge function for items missing or stale. First page-load per
-- new day pays the latency once; subsequent renders hit the cache.

CREATE TABLE IF NOT EXISTS personalized_reasons (
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  reason       text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS personalized_reasons_user_idx
  ON personalized_reasons (user_id, generated_at DESC);

ALTER TABLE personalized_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personalized_reasons_read_own" ON personalized_reasons;
CREATE POLICY "personalized_reasons_read_own" ON personalized_reasons
  FOR SELECT USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "personalized_reasons_write_own" ON personalized_reasons;
CREATE POLICY "personalized_reasons_write_own" ON personalized_reasons
  FOR INSERT WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "personalized_reasons_update_own" ON personalized_reasons;
CREATE POLICY "personalized_reasons_update_own" ON personalized_reasons
  FOR UPDATE USING (user_id = (SELECT auth.uid()));
