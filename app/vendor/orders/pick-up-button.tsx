"use client";

import { pickUpOrderItem, batchPickUp } from "@/app/vendor/orders/actions";
import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";

export function PickUpButton({ orderItemId }: { orderItemId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await pickUpOrderItem(orderItemId);
            if (result.error) setError(result.error);
          });
        }}
      >
        {isPending ? "處理中..." : "已領取"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function BatchPickUpButton({ orderItemIds }: { orderItemIds: string[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        disabled={isPending || orderItemIds.length === 0}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await batchPickUp(orderItemIds);
            if (result.error) setError(result.error);
          });
        }}
      >
        {isPending ? "處理中..." : `全部已領取（${orderItemIds.length} 筆）`}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
