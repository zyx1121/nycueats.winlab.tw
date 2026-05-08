"use client";

import { MenuItemCard } from "@/components/menu-item-card";
import { useState } from "react";
import { MenuItemEditDialog } from "./menu-item-edit-dialog";

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
  daily_slots: { id: string; date: string; max_qty: number; reserved_qty: number }[];
  item_option_groups: {
    id: string; name: string; required: boolean; max_select: number; sort_order: number;
    item_options: { id: string; name: string; price_delta: number; sort_order: number }[];
  }[];
};

export type SlotStatus = "expiring" | "none" | "ok";

export function VendorMenuItemCard({ item, slotStatus }: { item: Item; slotStatus: SlotStatus }) {
  const [editOpen, setEditOpen] = useState(false);

  const badge = (
    <div className="flex flex-wrap gap-1.5">
      {!item.is_available && (
        <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">已下架</span>
      )}
      {slotStatus === "none" && (
        <span className="text-xs text-red-600 border border-red-200 bg-red-50 rounded-full px-2 py-0.5 dark:text-red-400 dark:border-red-900 dark:bg-red-950">無名額</span>
      )}
      {slotStatus === "expiring" && (
        <span className="text-xs text-amber-600 border border-amber-200 bg-amber-50 rounded-full px-2 py-0.5 dark:text-amber-400 dark:border-amber-900 dark:bg-amber-950">名額將盡</span>
      )}
    </div>
  );

  return (
    <>
      <MenuItemEditDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
      <MenuItemCard
        item={item}
        onClick={() => setEditOpen(true)}
        status={badge}
      />
    </>
  );
}
