"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface UntouchedItem {
  name: string;
  defaultMaxQty: number;
  untouchedCount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: UntouchedItem[];
  onConfirm: () => void;
  isPending: boolean;
}

export function BulkSlotConfirmDialog({
  open,
  onOpenChange,
  items,
  onConfirm,
  isPending,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>確認建立名額</DialogTitle>
          <DialogDescription>
            以下餐點尚有未設定的日期，儲存時將使用各餐點的預設供應量：
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1.5 text-sm">
          {items.map((item) => (
            <li key={item.name} className="flex justify-between">
              <span>{item.name}</span>
              <span className="text-muted-foreground">
                {item.defaultMaxQty} 份/天（{item.untouchedCount} 天未設定）
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending ? "建立中…" : "確認建立"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
