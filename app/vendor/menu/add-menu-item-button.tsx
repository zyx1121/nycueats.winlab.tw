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
import { useState, useTransition } from "react";
import { upsertMenuItem } from "./actions";

export function AddMenuItemButton() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const toNum = (key: string) => {
      const v = parseFloat(fd.get(key) as string);
      return isNaN(v) ? undefined : v;
    };
    startTransition(async () => {
      const result = await upsertMenuItem({
        name: fd.get("name") as string,
        description: (fd.get("description") as string) || undefined,
        price: toNum("price") ?? 0,
        default_max_qty: toNum("default_max_qty"),
      });
      if (result?.error) {
        alert(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        新增餐點
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>新增餐點</DialogTitle>
          </DialogHeader>
          <form id="add-item-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-name">名稱</Label>
              <Input id="add-name" name="name" required placeholder="餐點名稱" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-description">描述</Label>
              <Input id="add-description" name="description" placeholder="選填" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-price">價格</Label>
                <Input
                  id="add-price"
                  name="price"
                  type="number"
                  min={0}
                  step={1}
                  required
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-default_max_qty">每日供應量</Label>
                <Input
                  id="add-default_max_qty"
                  name="default_max_qty"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="0"
                />
              </div>
            </div>
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button type="submit" form="add-item-form" disabled={isPending}>
              {isPending ? "新增中…" : "新增"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
