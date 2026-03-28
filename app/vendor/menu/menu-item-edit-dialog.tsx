"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays, format } from "date-fns";
import { useRef, useState, useTransition } from "react";
import { deleteMenuItem, setDailySlot, toggleMenuItem, upsertMenuItem } from "./actions";
import { OptionGroupsEditor } from "./option-groups-editor";

type Slot = { id: string; date: string; max_qty: number; reserved_qty: number };
type Option = { id: string; name: string; price_delta: number; sort_order: number };
type OptionGroup = {
  id: string;
  name: string;
  required: boolean;
  max_select: number;
  sort_order: number;
  item_options: Option[];
};

type Item = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  default_max_qty: number;
  image_url: string | null;
  calories: number | null;
  protein: number | null;
  sodium: number | null;
  sugar: number | null;
  tags: string[];
  daily_slots: Slot[];
  item_option_groups: OptionGroup[];
};

interface Props {
  item: Item;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MenuItemEditDialog({ item, open, onOpenChange }: Props) {
  const [isPending, startTransition] = useTransition();
  const [tags, setTags] = useState<string[]>(item.tags ?? []);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const today = new Date();
  const dates = Array.from({ length: 7 }, (_, i) =>
    addDays(today, i + 1).toISOString().split("T")[0]
  );
  const slotMap = Object.fromEntries(item.daily_slots.map((s) => [s.date, s]));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const toNum = (key: string) => {
      const v = parseFloat(fd.get(key) as string);
      return isNaN(v) ? undefined : v;
    };
    startTransition(async () => {
      await upsertMenuItem({
        id: item.id,
        name: fd.get("name") as string,
        description: (fd.get("description") as string) || undefined,
        price: toNum("price") ?? item.price,
        default_max_qty: toNum("default_max_qty") ?? 0,
        calories: toNum("calories"),
        protein: toNum("protein"),
        sodium: toNum("sodium"),
        sugar: toNum("sugar"),
        tags,
      });
      onOpenChange(false);
    });
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const value = (e.currentTarget.value ?? "").trim();
    if (!value || tags.includes(value)) return;
    setTags([...tags, value]);
    e.currentTarget.value = "";
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleQtyChange(date: string, value: string) {
    const qty = parseInt(value);
    if (isNaN(qty) || qty < 0) return;
    startTransition(async () => { await setDailySlot(item.id, date, qty); });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>編輯餐點</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 左欄：基本資訊 + 每日名額 */}
          <div className="flex flex-col gap-6">
            <form id="edit-item-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">名稱</Label>
                <Input id="name" name="name" defaultValue={item.name} required />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="description">描述</Label>
                <Input id="description" name="description" defaultValue={item.description ?? ""} placeholder="選填" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="price">價格</Label>
                  <Input id="price" name="price" type="number" min={0} step={1} defaultValue={item.price} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="default_max_qty">預設每日供應量</Label>
                  <Input id="default_max_qty" name="default_max_qty" type="number" min={0} step={1} defaultValue={item.default_max_qty} />
                </div>
              </div>

              <p className="text-sm font-medium text-muted-foreground -mb-2">營養資訊（選填）</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="calories">熱量 (kcal)</Label>
                  <Input id="calories" name="calories" type="number" min={0} defaultValue={item.calories ?? ""} placeholder="—" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="protein">蛋白質 (g)</Label>
                  <Input id="protein" name="protein" type="number" min={0} step={0.1} defaultValue={item.protein ?? ""} placeholder="—" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sodium">鈉 (mg)</Label>
                  <Input id="sodium" name="sodium" type="number" min={0} defaultValue={item.sodium ?? ""} placeholder="—" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sugar">糖 (g)</Label>
                  <Input id="sugar" name="sugar" type="number" min={0} step={0.1} defaultValue={item.sugar ?? ""} placeholder="—" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>標籤</Label>
                <div className="flex flex-wrap gap-1 min-h-[2rem]">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full border flex items-center gap-1"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="leading-none hover:text-destructive"
                        aria-label={`移除 ${tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <Input
                  ref={tagInputRef}
                  placeholder="輸入標籤後按 Enter 新增"
                  onKeyDown={handleTagKeyDown}
                />
              </div>
            </form>

            {/* 每日名額 */}
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium">每日名額設定</p>
              <div className="grid grid-cols-7 gap-2">
                {dates.map((date) => {
                  const slot = slotMap[date];
                  return (
                    <div key={date} className="flex flex-col gap-1 items-center">
                      <p className="text-xs text-muted-foreground">{format(new Date(date), "MM/dd")}</p>
                      <Input
                        type="number"
                        min={0}
                        defaultValue={slot?.max_qty ?? item.default_max_qty}
                        className="w-full text-center px-1"
                        onBlur={(e) => handleQtyChange(date, e.target.value)}
                      />
                      {slot && (
                        <p className="text-xs text-muted-foreground">已訂 {slot.reserved_qty}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 右欄：自訂選項 */}
          <OptionGroupsEditor
            menuItemId={item.id}
            groups={item.item_option_groups.sort((a, b) => a.sort_order - b.sort_order)}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              await deleteMenuItem(item.id);
              onOpenChange(false);
            })}
          >
            刪除
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              await toggleMenuItem(item.id, !item.is_available);
              onOpenChange(false);
            })}
          >
            {item.is_available ? "下架" : "上架"}
          </Button>
          <Button type="submit" form="edit-item-form" disabled={isPending}>
            {isPending ? "儲存中…" : "儲存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
