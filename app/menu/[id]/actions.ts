"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type SelectedOption = { option_id: string; name: string; price_delta: number };

export async function addToOrder(
  vendorId: string,
  menuItemId: string,
  dailySlotId: string,
  date: string,
  basePrice: number,
  qty: number,
  selectedOptions: SelectedOption[] = []
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  // 找或建立 pending order
  let orderId: string;
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .single();

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

  const unitPrice = basePrice + selectedOptions.reduce((sum, o) => sum + o.price_delta, 0);

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

  if (selectedOptions.length > 0) {
    await supabase.from("order_item_options").insert(
      selectedOptions.map((o) => ({
        order_item_id: orderItem.id,
        option_id: o.option_id,
        name: o.name,
        price_delta: o.price_delta,
      }))
    );
  }

  revalidatePath(`/menu/${vendorId}`);
  revalidatePath("/cart");
  return { success: true };
}
