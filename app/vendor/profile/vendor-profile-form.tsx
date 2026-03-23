"use client";

import { ImageUpload } from "@/components/image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useTransition } from "react";
import { updateVendorInfo, updateVendorImage } from "./actions";

const DAYS = [
  { value: 0, label: "日" },
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
];

interface Props {
  vendor: {
    id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    is_open: boolean;
    operating_days: number[];
  };
  areas: { id: string; name: string }[];
}

export function VendorProfileForm({ vendor, areas }: Props) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [isOpen, setIsOpen] = useState(vendor.is_open);
  const [operatingDays, setOperatingDays] = useState<Set<number>>(new Set(vendor.operating_days));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("is_open", String(isOpen));
    formData.set("operating_days", Array.from(operatingDays).join(","));
    startTransition(async () => {
      const result = await updateVendorInfo(formData);
      if (result?.success) setSaved(true);
    });
  }

  function toggleDay(day: number) {
    setSaved(false);
    const next = new Set(operatingDays);
    next.has(day) ? next.delete(day) : next.add(day);
    setOperatingDays(next);
  }

  function toggleOpen() {
    setSaved(false);
    setIsOpen((v) => !v);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 左欄：圖片 */}
      <ImageUpload
        bucket="vendor-images"
        path={`vendors/${vendor.id}`}
        currentUrl={vendor.image_url}
        onUploaded={(url) => { updateVendorImage(url); }}
        aspectRatio="aspect-video"
      />

      {/* 右欄：全部在同一個 form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">店家名稱</Label>
          <Input id="name" name="name" defaultValue={vendor.name} onChange={() => setSaved(false)} />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">店家描述</Label>
          <Input
            id="description"
            name="description"
            defaultValue={vendor.description ?? ""}
            placeholder="簡短介紹你的店家"
            onChange={() => setSaved(false)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>服務區域</Label>
          <div className="flex flex-wrap gap-2">
            {areas.map((area) => (
              <span key={area.id} className="text-sm border rounded-full px-3 py-1 text-muted-foreground">
                {area.name}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label>營業狀態</Label>
            <Button
              type="button"
              size="sm"
              variant={isOpen ? "default" : "outline"}
              onClick={toggleOpen}
            >
              {isOpen ? "營業中" : "暫停營業"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>營業日</Label>
          <div className="flex gap-1.5">
            {DAYS.map(({ value, label }) => {
              const active = operatingDays.has(value);
              return (
                <Button
                  key={value}
                  type="button"
                  variant={active ? "default" : "outline"}
                  className="flex-1 px-0"
                  onClick={() => toggleDay(value)}
                >
                  {label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-auto">
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "儲存中…" : "儲存"}
          </Button>
          {saved && <p className="text-sm text-muted-foreground whitespace-nowrap">已儲存</p>}
        </div>
      </form>
    </div>
  );
}
