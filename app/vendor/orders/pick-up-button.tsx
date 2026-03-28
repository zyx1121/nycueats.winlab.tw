"use client";

import { pickUpOrderItem, batchPickUp } from "@/app/vendor/orders/actions";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";

export function PickUpButton({ orderItemId }: { orderItemId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => startTransition(async () => { await pickUpOrderItem(orderItemId); })}
    >
      {isPending ? "處理中..." : "已領取"}
    </Button>
  );
}

export function BatchPickUpButton({ orderItemIds }: { orderItemIds: string[] }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      disabled={isPending || orderItemIds.length === 0}
      onClick={() => startTransition(async () => { await batchPickUp(orderItemIds); })}
    >
      {isPending ? "處理中..." : `全部已領取（${orderItemIds.length} 筆）`}
    </Button>
  );
}
