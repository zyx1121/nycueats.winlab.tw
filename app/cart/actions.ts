"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function removeOrderItem(orderItemId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { data: item } = await supabase
    .from("order_items")
    .select("id, orders!inner(user_id)")
    .eq("id", orderItemId)
    .single();

  if (!item || (item.orders as { user_id: string } | null)?.user_id !== user.id)
    return { error: "權限不足" };

  const { error } = await supabase
    .from("order_items")
    .delete()
    .eq("id", orderItemId);

  if (error) return { error: "取消失敗" };
  revalidatePath("/cart");
  return { success: true };
}

export async function confirmOrder(orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (!order) return { error: "找不到預約單" };
  if (order.status !== "pending") return { error: "預約單狀態不符" };

  const { data: items } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderId)
    .limit(1);
  if (!items || items.length === 0) return { error: "預約單沒有品項" };

  const { error } = await supabase
    .from("orders")
    .update({ status: "confirmed" })
    .eq("id", orderId);

  if (error) return { error: "確認失敗" };
  revalidatePath("/cart");
  revalidatePath("/orders");
  return { success: true };
}

export async function cancelOrder(orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (!order) return { error: "找不到預約單" };
  if (order.status !== "pending") return { error: "預約單狀態不符" };

  const { error: itemsError } = await supabase
    .from("order_items")
    .delete()
    .eq("order_id", orderId);

  if (itemsError) return { error: "清空失敗" };

  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);

  if (error) return { error: "取消失敗" };
  revalidatePath("/cart");
  revalidatePath("/orders");
  return { success: true };
}
