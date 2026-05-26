"use server";

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

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

async function invokeAiTagGeneration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  menuItemIds: string[],
  force = false,
) {
  if (menuItemIds.length === 0) return { error: "no items" };
  const { data, error } = await supabase.functions.invoke<{
    results: Array<{ id: string; status: string; error?: string }>;
  }>("generate-menu-item-tags", {
    body: { menu_item_ids: menuItemIds, force },
  });
  if (error) return { error: error.message };
  return { results: data?.results ?? [] };
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

  if (data.id) {
    const { error } = await supabase
      .from("menu_items")
      .update({ ...data, vendor_id: vendor.id })
      .eq("id", data.id);
    if (error) return { error: error.message };
    revalidatePath("/vendor/menu");
    return { success: true };
  }

  const { data: inserted, error } = await supabase
    .from("menu_items")
    .insert({ ...data, vendor_id: vendor.id })
    .select("id")
    .single();
  if (error || !inserted) return { error: error?.message ?? "建立失敗" };

  // Fire-and-forget AI tagging (runs after response is sent)
  after(async () => {
    await invokeAiTagGeneration(supabase, [inserted.id]).catch((e) =>
      console.error("AI tag generation failed for", inserted.id, e),
    );
  });

  revalidatePath("/vendor/menu");
  return { success: true, id: inserted.id };
}

export async function regenerateAiMetadata(menuItemIds: string[]) {
  const { supabase, vendor } = await requireVendor();
  if (menuItemIds.length === 0) return { error: "請選擇至少一道餐點" };

  // RLS check：只允許 invoke 自己擁有的 items
  const { data: owned } = await supabase
    .from("menu_items")
    .select("id")
    .eq("vendor_id", vendor.id)
    .in("id", menuItemIds);
  const ownedIds = (owned ?? []).map((r) => r.id);
  if (ownedIds.length === 0) return { error: "權限不足" };

  const result = await invokeAiTagGeneration(supabase, ownedIds, true);
  revalidatePath("/vendor/menu");
  return result;
}

export async function backfillMissingAiTags() {
  const { supabase, vendor } = await requireVendor();
  const { data: missing } = await supabase
    .from("menu_items")
    .select("id")
    .eq("vendor_id", vendor.id)
    .is("ai_generated_at", null)
    .limit(100);
  const ids = (missing ?? []).map((r) => r.id);
  if (ids.length === 0) return { success: true, count: 0 };

  const result = await invokeAiTagGeneration(supabase, ids);
  revalidatePath("/vendor/menu");
  return { ...result, count: ids.length };
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

export async function bulkUpsertSlots(
  slots: { menu_item_id: string; date: string; max_qty: number }[]
) {
  const { supabase, vendor } = await requireVendor();

  // Verify all menu items belong to this vendor
  const itemIds = [...new Set(slots.map((s) => s.menu_item_id))];
  const { data: ownedItems } = await supabase
    .from("menu_items")
    .select("id")
    .eq("vendor_id", vendor.id)
    .in("id", itemIds);

  const ownedIds = new Set((ownedItems ?? []).map((i) => i.id));
  const validSlots = slots.filter((s) => ownedIds.has(s.menu_item_id));

  if (validSlots.length === 0) return { error: "沒有可建立的名額" };

  const { error } = await supabase
    .from("daily_slots")
    .upsert(
      validSlots.map((s) => ({
        menu_item_id: s.menu_item_id,
        date: s.date,
        max_qty: s.max_qty,
      })),
      { onConflict: "menu_item_id,date" }
    );

  if (error) return { error: error.message };

  revalidatePath("/vendor/menu");
  revalidatePath("/menu", "layout");
  return { success: true, count: validSlots.length };
}

