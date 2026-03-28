"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function pickUpOrderItem(orderItemId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!vendor) return { error: "找不到商家帳號" };

  const { data: item } = await supabase
    .from("order_items")
    .select("id, order_id, menu_items!inner(vendor_id)")
    .eq("id", orderItemId)
    .single();

  if (!item || (item.menu_items as { vendor_id: string } | null)?.vendor_id !== vendor.id)
    return { error: "此品項不屬於您" };

  const { error: updateError } = await supabase
    .from("order_items")
    .update({ picked_up: true })
    .eq("id", orderItemId);

  if (updateError) return { error: "更新失敗" };

  const { data: remaining } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", item.order_id)
    .eq("picked_up", false);

  if (!remaining || remaining.length === 0) {
    await supabase.from("orders").update({ status: "completed" }).eq("id", item.order_id);
  }

  revalidatePath("/vendor/orders");
  return { success: true, order_id: item.order_id };
}

export async function batchPickUp(orderItemIds: string[]) {
  const errors: string[] = [];
  for (const id of orderItemIds) {
    const result = await pickUpOrderItem(id);
    if (result.error) errors.push(result.error);
  }
  if (errors.length > 0) return { error: `${errors.length} 筆失敗` };
  return { success: true };
}
