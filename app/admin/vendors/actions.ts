"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function approveVendor(vendorId: string, areaIds: string[]) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ status: "approved", is_active: true })
    .eq("id", vendorId);
  if (error) return { error: "核准失敗" };

  await supabase.from("vendor_areas").delete().eq("vendor_id", vendorId);
  if (areaIds.length > 0) {
    await supabase
      .from("vendor_areas")
      .insert(areaIds.map((area_id) => ({ vendor_id: vendorId, area_id })));
  }

  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorId}`);
  return { success: true };
}

export async function rejectVendor(vendorId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ status: "rejected", is_active: false })
    .eq("id", vendorId);
  if (error) return { error: "拒絕失敗" };
  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorId}`);
  return { success: true };
}

export async function suspendVendor(vendorId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ status: "suspended", is_active: false })
    .eq("id", vendorId);
  if (error) return { error: "停用失敗" };
  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorId}`);
  return { success: true };
}

export async function reactivateVendor(vendorId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vendors")
    .update({ status: "approved", is_active: true })
    .eq("id", vendorId);
  if (error) return { error: "啟用失敗" };
  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorId}`);
  return { success: true };
}

export async function updateVendorAreas(vendorId: string, areaIds: string[]) {
  const supabase = await createClient();
  await supabase.from("vendor_areas").delete().eq("vendor_id", vendorId);
  if (areaIds.length > 0) {
    await supabase
      .from("vendor_areas")
      .insert(areaIds.map((area_id) => ({ vendor_id: vendorId, area_id })));
  }
  revalidatePath(`/admin/vendors/${vendorId}`);
  return { success: true };
}
