-- Rebrand active areas from legacy campus/factory records to TSMC Fab sites.
-- Keep the `areas` table and FK structure intact; only active data changes.

INSERT INTO public.areas (name, city, is_active)
VALUES
  ('Fab 2', '新竹科學園區（竹科）', true),
  ('Fab 3', '新竹科學園區（竹科）', true),
  ('Fab 5', '新竹科學園區（竹科）', true),
  ('Fab 6', '新竹科學園區（竹科）', true),
  ('Fab 8', '新竹科學園區（竹科）', true),
  ('Fab 12A', '新竹科學園區（竹科）', true),
  ('Fab 12B', '新竹科學園區（竹科）', true),
  ('Fab 20', '新竹科學園區（竹科）', true),
  ('Fab 14', '台南科學園區（南科）', true),
  ('Fab 18', '台南科學園區（南科）', true),
  ('Fab 15', '中部科學園區（中科）', true),
  ('Fab 22 高雄', '南部科學園區', true),
  ('Fab 25 嘉義/台南沙崙', '南部科學園區', true)
ON CONFLICT (name) DO UPDATE
SET city = EXCLUDED.city,
    is_active = true;

WITH area_map(old_name, new_name) AS (
  VALUES
    ('新竹光復校區', 'Fab 12A'),
    ('新竹博愛校區', 'Fab 12A'),
    ('新竹六家校區', 'Fab 12A'),
    ('新竹廠', 'Fab 12A'),
    ('臺南歸仁校區', 'Fab 14'),
    ('台南廠', 'Fab 14'),
    ('台中廠', 'Fab 15'),
    ('嘉義廠', 'Fab 25 嘉義/台南沙崙'),
    ('高雄校區', 'Fab 22 高雄'),
    ('高雄廠', 'Fab 22 高雄')
)
UPDATE public.profiles AS p
SET area_id = new_area.id
FROM public.areas AS old_area
JOIN area_map ON area_map.old_name = old_area.name
JOIN public.areas AS new_area ON new_area.name = area_map.new_name
WHERE p.area_id = old_area.id;

WITH area_map(old_name, new_name) AS (
  VALUES
    ('新竹光復校區', 'Fab 12A'),
    ('新竹博愛校區', 'Fab 12A'),
    ('新竹六家校區', 'Fab 12A'),
    ('新竹廠', 'Fab 12A'),
    ('臺南歸仁校區', 'Fab 14'),
    ('台南廠', 'Fab 14'),
    ('台中廠', 'Fab 15'),
    ('嘉義廠', 'Fab 25 嘉義/台南沙崙'),
    ('高雄校區', 'Fab 22 高雄'),
    ('高雄廠', 'Fab 22 高雄')
)
INSERT INTO public.vendor_areas (vendor_id, area_id)
SELECT DISTINCT va.vendor_id, new_area.id
FROM public.vendor_areas AS va
JOIN public.areas AS old_area ON old_area.id = va.area_id
JOIN area_map ON area_map.old_name = old_area.name
JOIN public.areas AS new_area ON new_area.name = area_map.new_name
ON CONFLICT (vendor_id, area_id) DO NOTHING;

DELETE FROM public.vendor_areas AS va
USING public.areas AS old_area
WHERE va.area_id = old_area.id
  AND old_area.name IN (
    '新竹光復校區',
    '新竹博愛校區',
    '新竹六家校區',
    '臺北陽明校區',
    '臺北北門校區',
    '臺南歸仁校區',
    '高雄校區',
    '新竹廠',
    '台中廠',
    '嘉義廠',
    '台南廠',
    '高雄廠'
  );

UPDATE public.profiles
SET area_id = NULL
WHERE area_id IN (
  SELECT id
  FROM public.areas
  WHERE name IN ('臺北陽明校區', '臺北北門校區')
);

UPDATE public.areas
SET is_active = false
WHERE name IN (
  '新竹光復校區',
  '新竹博愛校區',
  '新竹六家校區',
  '臺北陽明校區',
  '臺北北門校區',
  '臺南歸仁校區',
  '高雄校區',
  '新竹廠',
  '台中廠',
  '嘉義廠',
  '台南廠',
  '高雄廠'
);

UPDATE public.profiles
SET area_id = (SELECT id FROM public.areas WHERE name = 'Fab 12A')
WHERE area_id IS NULL
  AND EXISTS (SELECT 1 FROM public.areas WHERE name = 'Fab 12A');
