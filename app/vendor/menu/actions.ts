"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

async function requireVendor() {
  const { user, supabase } = await requireRole("vendor");
  const { data: vendor } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!vendor) throw new Error("找不到商家");
  return { supabase, vendor };
}

async function requireMenuItemOwnership(supabase: Awaited<ReturnType<typeof createClient>>, vendorId: string, menuItemId: string) {
  const { data } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", menuItemId)
    .eq("vendor_id", vendorId)
    .single();
  if (!data) throw new Error("權限不足");
}

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
  const { supabase, vendor } = await requireVendor();

  const { error } = data.id
    ? await supabase.from("menu_items").update({ ...data, vendor_id: vendor.id }).eq("id", data.id)
    : await supabase.from("menu_items").insert({ ...data, vendor_id: vendor.id });

  if (error) return { error: error.message };
  revalidatePath("/vendor/menu");
  return { success: true };
}

export async function setDailySlot(menuItemId: string, date: string, maxQty: number) {
  const { supabase, vendor } = await requireVendor();
  await requireMenuItemOwnership(supabase, vendor.id, menuItemId);

  const { error } = await supabase
    .from("daily_slots")
    .upsert({ menu_item_id: menuItemId, date, max_qty: maxQty }, { onConflict: "menu_item_id,date" });

  if (error) return { error: error.message };
  revalidatePath("/vendor/menu");
  return { success: true };
}

export async function toggleMenuItem(id: string, isAvailable: boolean) {
  const { supabase, vendor } = await requireVendor();
  await supabase.from("menu_items").update({ is_available: isAvailable }).eq("id", id).eq("vendor_id", vendor.id);
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
  const { supabase, vendor } = await requireVendor();
  await requireMenuItemOwnership(supabase, vendor.id, data.menu_item_id);
  const { error } = data.id
    ? await supabase.from("item_option_groups").update(data).eq("id", data.id)
    : await supabase.from("item_option_groups").insert(data);
  if (error) return { error: error.message };
  revalidatePath("/vendor/menu");
  return { success: true };
}

export async function deleteOptionGroup(id: string) {
  const { supabase, vendor } = await requireVendor();
  const { data: group } = await supabase
    .from("item_option_groups")
    .select("menu_item_id")
    .eq("id", id)
    .single();
  if (group) await requireMenuItemOwnership(supabase, vendor.id, group.menu_item_id);
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
  const { supabase, vendor } = await requireVendor();
  const { data: group } = await supabase
    .from("item_option_groups")
    .select("menu_item_id")
    .eq("id", data.group_id)
    .single();
  if (!group) return { error: "找不到選項群組" };
  await requireMenuItemOwnership(supabase, vendor.id, group.menu_item_id);
  const { error } = data.id
    ? await supabase.from("item_options").update(data).eq("id", data.id)
    : await supabase.from("item_options").insert(data);
  if (error) return { error: error.message };
  revalidatePath("/vendor/menu");
  return { success: true };
}

export async function deleteOption(id: string) {
  const { supabase, vendor } = await requireVendor();
  const { data: option } = await supabase
    .from("item_options")
    .select("group_id, item_option_groups(menu_item_id)")
    .eq("id", id)
    .single();
  if (option) {
    const group = option.item_option_groups as { menu_item_id: string } | null;
    if (group) await requireMenuItemOwnership(supabase, vendor.id, group.menu_item_id);
  }
  await supabase.from("item_options").delete().eq("id", id);
  revalidatePath("/vendor/menu");
}

export async function deleteMenuItem(id: string) {
  const { supabase, vendor } = await requireVendor();

  const { error } = await supabase.from("menu_items").delete().eq("id", id).eq("vendor_id", vendor.id);
  if (error) return { error: error.message };

  revalidatePath("/vendor/menu");
  return { success: true };
}

