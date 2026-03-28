"use client";

import { PickUpButton, BatchPickUpButton } from "@/app/vendor/orders/pick-up-button";
import { CheckCircle, ChevronDown, Circle } from "lucide-react";
import { useState } from "react";

type OrderItem = {
  id: string;
  qty: number;
  unit_price: number;
  picked_up: boolean;
  user_name: string;
  options: string;
};

export function OrderDetail({ items }: { items: OrderItem[] }) {
  const [open, setOpen] = useState(false);
  const unpickedIds = items.filter((i) => !i.picked_up).map((i) => i.id);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "收合" : "展開明細"}（{items.length} 筆）
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between pl-4 py-2 border-l-2">
              <div className="flex items-center gap-2">
                {item.picked_up
                  ? <CheckCircle className="size-4 text-green-600" />
                  : <Circle className="size-4 text-muted-foreground" />}
                <div>
                  <p className="text-sm">{item.user_name} · x{item.qty}</p>
                  {item.options && <p className="text-xs text-muted-foreground">{item.options}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm">${(item.unit_price * item.qty).toFixed(0)}</p>
                {!item.picked_up && <PickUpButton orderItemId={item.id} />}
              </div>
            </div>
          ))}
          {unpickedIds.length > 0 && (
            <div className="pl-4 pt-2">
              <BatchPickUpButton orderItemIds={unpickedIds} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
