"use client";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Loader2Icon, UploadIcon } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

interface Props {
  bucket: "vendor-images" | "menu-item-images";
  path: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  aspectRatio?: string;
}

export function ImageUpload({ bucket, path, currentUrl, onUploaded, aspectRatio = "aspect-video" }: Props) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop();
    const filePath = `${path}/${Date.now()}.${ext}`;

    setUploading(true);
    const supabase = createClient();
    const { error } = await supabase.storage.from(bucket).upload(filePath, file, { upsert: true });

    if (!error) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
      setPreview(data.publicUrl);
      onUploaded(data.publicUrl);
    }
    setUploading(false);
    e.target.value = "";
  }

  return (
    <div className={`${aspectRatio} relative`}>
      {/* 圖片 / 佔位區 */}
      <div className="absolute inset-0 bg-muted rounded-lg overflow-hidden">
        {preview && <Image src={preview} alt="圖片" fill className="object-cover rounded-lg" />}

        {/* 無圖片時的預設狀態 */}
        {!preview && !uploading && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 w-full"
          >
            <UploadIcon className="size-6 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">點擊上傳圖片</p>
          </button>
        )}

        {/* 上傳中 */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2Icon className="size-6 text-muted-foreground animate-spin" />
          </div>
        )}
      </div>

      {/* 有圖片時的右上角按鈕 */}
      {preview && !uploading && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white"
        >
          更換圖片
        </Button>
      )}

      {preview && uploading && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled
          className="absolute top-2 right-2 bg-black/60 text-white"
        >
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
          上傳中
        </Button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFile}
      />
    </div>
  );
}
