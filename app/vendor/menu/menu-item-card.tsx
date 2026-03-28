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

export function VendorMenuItemCard({ item }: { item: Item }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <MenuItemEditDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
      <MenuItemCard
        item={item}
        onClick={() => setEditOpen(true)}
        status={
          !item.is_available && (
            <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5 self-start">已下架</span>
          )
        }
      />
    </>
  );
}
