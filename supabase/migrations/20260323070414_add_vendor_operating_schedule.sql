
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS operating_days integer[] NOT NULL DEFAULT '{1,2,3,4,5}';
