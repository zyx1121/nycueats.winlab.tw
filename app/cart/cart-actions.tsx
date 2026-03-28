"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cancelOrder, confirmOrder } from "@/app/cart/actions";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";

interface Props {
  orderId: string;
  total: number;
  itemCount: number;
}

export function CartActions({ orderId, total, itemCount }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleCancel() {
    startTransition(async () => {
      const result = await cancelOrder(orderId);
      if (result.error) {
        alert(result.error);
        return;
      }
      setCancelOpen(false);
      router.refresh();
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmOrder(orderId);
      if (result.error) {
        alert(result.error);
        return;
      }
      setConfirmOpen(false);
      router.push("/orders");
    });
  }

  return (
    <div className="flex gap-3">
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="flex-1" disabled={isPending}>
            清空購物車
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確定要清空購物車？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            共 {itemCount} 項將被移除，此操作無法復原。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={isPending}>
              返回
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isPending}>
              {isPending ? "處理中…" : "確定清空"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger asChild>
          <Button className="flex-1" disabled={isPending}>
            結帳確認（${total.toFixed(0)}）
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認結帳</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            共 {itemCount} 項，合計 ${total.toFixed(0)}，確認送出預約？
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isPending}>
              返回
            </Button>
            <Button onClick={handleConfirm} disabled={isPending}>
              {isPending ? "處理中…" : "確認結帳"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
