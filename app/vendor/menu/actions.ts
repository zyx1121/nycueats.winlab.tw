"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function upsertMenuItem(data: {
  id?: string;
  name: string;
  description?: string;
  price: number;
  default_max_qty?: number;
  calories?: number;
  protein?: number;
  sodium?: number;
  sugar?: number;
  tags?: string[];
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!vendor) return { error: "找不到商家" };

  const { error } = data.id
    ? await supabase.from("menu_items").update({ ...data, vendor_id: vendor.id }).eq("id", data.id)
    : await supabase.from("menu_items").insert({ ...data, vendor_id: vendor.id });

  if (error) return { error: error.message };
  revalidatePath("/vendor/menu");
  return { success: true };
}

export async function setDailySlot(menuItemId: string, date: string, maxQty: number) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("daily_slots")
    .upsert({ menu_item_id: menuItemId, date, max_qty: maxQty }, { onConflict: "menu_item_id,date" });

  if (error) return { error: error.message };
  revalidatePath("/vendor/menu");
  return { success: true };
}

export async function toggleMenuItem(id: string, isAvailable: boolean) {
  const supabase = await createClient();
  await supabase.from("menu_items").update({ is_available: isAvailable }).eq("id", id);
  revalidatePath("/vendor/menu");
}

export async function upsertOptionGroup(data: {
  id?: string;
  menu_item_id: string;
  name: string;
  required: boolean;
  max_select: number;
  sort_order: number;
}) {
  const supabase = await createClient();
  const { error } = data.id
    ? await supabase.from("item_option_groups").update(data).eq("id", data.id)
    : await supabase.from("item_option_groups").insert(data);
  if (error) return { error: error.message };
  revalidatePath("/vendor/menu");
  return { success: true };
}

export async function deleteOptionGroup(id: string) {
  const supabase = await createClient();
  await supabase.from("item_option_groups").delete().eq("id", id);
  revalidatePath("/vendor/menu");
}

export async function upsertOption(data: {
  id?: string;
  group_id: string;
  name: string;
  price_delta: number;
  sort_order: number;
}) {
  const supabase = await createClient();
  const { error } = data.id
    ? await supabase.from("item_options").update(data).eq("id", data.id)
    : await supabase.from("item_options").insert(data);
  if (error) return { error: error.message };
  revalidatePath("/vendor/menu");
  return { success: true };
}

export async function deleteOption(id: string) {
  const supabase = await createClient();
  await supabase.from("item_options").delete().eq("id", id);
  revalidatePath("/vendor/menu");
}

export async function deleteMenuItem(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const { data: vendor } = await supabase.from("vendors").select("id").eq("owner_id", user.id).single();
  if (!vendor) return { error: "找不到商家" };

  const { error } = await supabase.from("menu_items").delete().eq("id", id).eq("vendor_id", vendor.id);
  if (error) return { error: error.message };

  revalidatePath("/vendor/menu");
  return { success: true };
}

