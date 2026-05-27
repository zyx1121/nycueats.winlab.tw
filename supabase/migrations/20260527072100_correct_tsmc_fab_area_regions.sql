-- Correct TSMC Fab labels and science park area mappings after the first rebrand.

INSERT INTO public.areas (name, city, is_active)
VALUES
  ('Fab 1', '新竹科學園區竹科園區工研院中興園區', true),
  ('Fab 2', '新竹科學園區竹科園區', true),
  ('Fab 3', '新竹科學園區竹科園區', true),
  ('Fab 5', '新竹科學園區竹科園區', true),
  ('Fab 6', '南部科學園區台南園區', true),
  ('Fab 8', '新竹科學園區竹科園區', true),
  ('Fab 12A', '新竹科學園區竹科園區', true),
  ('Fab 12B', '新竹科學園區竹科園區', true),
  ('Fab 20', '新竹科學園區竹科園區', true),
  ('Fab 14', '南部科學園區台南園區', true),
  ('Fab 18', '南部科學園區台南園區', true),
  ('Fab 15', '中部科學園區台中園區', true),
  ('Fab 22', '南部科學園區高雄楠梓園區', true),
  ('Fab 25', '中部科學園區台中園區', true)
ON CONFLICT (name) DO UPDATE
SET city = EXCLUDED.city,
    is_active = true;

WITH area_map(old_name, new_name) AS (
  VALUES
    ('Fab 22 高雄', 'Fab 22'),
    ('Fab 25 嘉義/台南沙崙', 'Fab 25')
)
UPDATE public.profiles AS p
SET area_id = new_area.id
FROM public.areas AS old_area
JOIN area_map ON area_map.old_name = old_area.name
JOIN public.areas AS new_area ON new_area.name = area_map.new_name
WHERE p.area_id = old_area.id;

WITH area_map(old_name, new_name) AS (
  VALUES
    ('Fab 22 高雄', 'Fab 22'),
    ('Fab 25 嘉義/台南沙崙', 'Fab 25')
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
  AND old_area.name IN ('Fab 22 高雄', 'Fab 25 嘉義/台南沙崙');

UPDATE public.areas
SET is_active = false
WHERE name IN ('Fab 22 高雄', 'Fab 25 嘉義/台南沙崙');
