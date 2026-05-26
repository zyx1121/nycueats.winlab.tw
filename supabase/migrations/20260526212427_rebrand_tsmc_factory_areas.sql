-- Rebrand active areas from legacy campus records to TSMC factory sites.
-- Keep the `areas` table and FK structure intact; only active data changes.

INSERT INTO public.areas (name, city, is_active)
VALUES
  ('新竹廠', '新竹', true),
  ('台中廠', '台中', true),
  ('嘉義廠', '嘉義', true),
  ('台南廠', '台南', true),
  ('高雄廠', '高雄', true)
ON CONFLICT (name) DO UPDATE
SET city = EXCLUDED.city,
    is_active = true;

WITH area_map(old_name, new_name) AS (
  VALUES
    ('新竹光復校區', '新竹廠'),
    ('新竹博愛校區', '新竹廠'),
    ('新竹六家校區', '新竹廠'),
    ('臺南歸仁校區', '台南廠'),
    ('高雄校區', '高雄廠')
)
UPDATE public.profiles AS p
SET area_id = new_area.id
FROM public.areas AS old_area
JOIN area_map ON area_map.old_name = old_area.name
JOIN public.areas AS new_area ON new_area.name = area_map.new_name
WHERE p.area_id = old_area.id;

WITH area_map(old_name, new_name) AS (
  VALUES
    ('新竹光復校區', '新竹廠'),
    ('新竹博愛校區', '新竹廠'),
    ('新竹六家校區', '新竹廠'),
    ('臺南歸仁校區', '台南廠'),
    ('高雄校區', '高雄廠')
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
    '高雄校區'
  );

INSERT INTO public.vendor_areas (vendor_id, area_id)
SELECT DISTINCT v.id, a.id
FROM public.vendors AS v
CROSS JOIN public.areas AS a
WHERE v.is_active = true
  AND a.is_active = true
  AND a.name IN ('新竹廠', '台中廠', '嘉義廠', '台南廠', '高雄廠')
ON CONFLICT (vendor_id, area_id) DO NOTHING;

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
  '高雄校區'
);

UPDATE public.profiles
SET area_id = (SELECT id FROM public.areas WHERE name = '新竹廠')
WHERE area_id IS NULL
  AND EXISTS (SELECT 1 FROM public.areas WHERE name = '新竹廠');
