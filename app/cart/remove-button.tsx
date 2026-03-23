"use client";

import { removeOrderItem } from "@/app/cart/actions";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { useTransition } from "react";

export function RemoveButton({ orderItemId }: { orderItemId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => startTransition(async () => { await removeOrderItem(orderItemId); })}
      className="size-8 text-muted-foreground hover:text-destructive"
    >
      <XIcon className="size-4" />
    </Button>
  );
}
