"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addToOrder(
  vendorId: string,
  menuItemId: string,
  dailySlotId: string,
  date: string,
  qty: number,
  optionIds: string[] = []
) {
  if (!Number.isInteger(qty) || qty < 1 || qty > 50) return { error: "數量錯誤" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  // Cross-check slot ↔ menu_item ↔ date (anti-tampering)
  const { data: slot } = await supabase
    .from("daily_slots")
    .select("id, menu_item_id, date")
    .eq("id", dailySlotId)
    .single();
  if (!slot) return { error: "找不到此時段" };
  if (slot.menu_item_id !== menuItemId || slot.date !== date) {
    return { error: "時段與餐點不符" };
  }

  // Fetch authoritative price + verify vendor ownership
  const { data: menuItem } = await supabase
    .from("menu_items")
    .select("id, price, is_available, vendor_id")
    .eq("id", menuItemId)
    .single();
  if (!menuItem || !menuItem.is_available) return { error: "餐點目前未供應" };
  if (menuItem.vendor_id !== vendorId) return { error: "餐點與商家不符" };

  // Validate options belong to this menu_item, fetch authoritative price_delta + name
  type ValidatedOption = { id: string; name: string; price_delta: number };
  let validatedOptions: ValidatedOption[] = [];
  const uniqueOptionIds = [...new Set(optionIds)];
  if (uniqueOptionIds.length > 0) {
    const { data: optionRows } = await supabase
      .from("item_options")
      .select("id, name, price_delta, item_option_groups!inner(menu_item_id)")
      .in("id", uniqueOptionIds);
    if (!optionRows || optionRows.length !== uniqueOptionIds.length) {
      return { error: "選項無效" };
    }
    for (const r of optionRows) {
      const group = r.item_option_groups as { menu_item_id: string } | null;
      if (group?.menu_item_id !== menuItemId) {
        return { error: "選項不屬於此餐點" };
      }
    }
    validatedOptions = optionRows.map((r) => ({
      id: r.id,
      name: r.name,
      price_delta: r.price_delta,
    }));
  }

  const unitPrice =
    Number(menuItem.price) +
    validatedOptions.reduce((sum, o) => sum + o.price_delta, 0);

  // Find or create pending order
  let orderId: string;
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    orderId = existing.id;
  } else {
    const { data: newOrder, error } = await supabase
      .from("orders")
      .insert({ user_id: user.id })
      .select("id")
      .single();
    if (error || !newOrder) return { error: "建立訂單失敗" };
    orderId = newOrder.id;
  }

  const { data: orderItem, error } = await supabase
    .from("order_items")
    .insert({
      order_id: orderId,
      menu_item_id: menuItemId,
      daily_slot_id: dailySlotId,
      date,
      qty,
      unit_price: unitPrice,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23514") return { error: "此日期已售完" };
    return { error: "加入失敗，請稍後再試" };
  }

  if (validatedOptions.length > 0) {
    await supabase.from("order_item_options").insert(
      validatedOptions.map((o) => ({
        order_item_id: orderItem.id,
        option_id: o.id,
        name: o.name,
        price_delta: o.price_delta,
      }))
    );
  }

  revalidatePath(`/menu/${vendorId}`);
  revalidatePath("/cart");
  return { success: true };
}
