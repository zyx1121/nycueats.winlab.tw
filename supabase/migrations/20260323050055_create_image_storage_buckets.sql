
-- 建立兩個 public bucket
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('vendor-images', 'vendor-images', true),
  ('menu-item-images', 'menu-item-images', true)
ON CONFLICT (id) DO NOTHING;

-- vendor-images: 所有人可讀
CREATE POLICY "vendor_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vendor-images');

-- vendor-images: 已登入用戶可上傳/更新/刪除
CREATE POLICY "vendor_images_auth_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'vendor-images');

CREATE POLICY "vendor_images_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'vendor-images');

CREATE POLICY "vendor_images_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'vendor-images');

-- menu-item-images: 所有人可讀
CREATE POLICY "menu_item_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-item-images');

-- menu-item-images: 已登入用戶可上傳/更新/刪除
CREATE POLICY "menu_item_images_auth_write"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'menu-item-images');

CREATE POLICY "menu_item_images_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'menu-item-images');

CREATE POLICY "menu_item_images_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'menu-item-images');
