"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function removeOrderItem(orderItemId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("order_items")
    .delete()
    .eq("id", orderItemId);

  if (error) return { error: "取消失敗" };
  revalidatePath("/cart");
  return { success: true };
}
