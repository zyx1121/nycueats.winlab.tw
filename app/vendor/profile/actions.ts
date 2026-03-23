"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateVendorInfo(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  const name = (formData.get("name") as string).trim();
  const description = (formData.get("description") as string).trim();
  const isOpen = formData.get("is_open") === "true";
  const operatingDays = (formData.get("operating_days") as string)
    .split(",").filter(Boolean).map(Number);

  if (!name) return { error: "店家名稱不能為空" };

  const { error } = await supabase
    .from("vendors")
    .update({ name, description: description || null, is_open: isOpen, operating_days: operatingDays })
    .eq("owner_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/vendor/profile");
  revalidatePath("/");
  return { success: true };
}

export async function updateVendorSchedule(isOpen: boolean, operatingDays: number[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  await supabase
    .from("vendors")
    .update({ is_open: isOpen, operating_days: operatingDays })
    .eq("owner_id", user.id);

  revalidatePath("/vendor/profile");
  revalidatePath("/");
  return { success: true };
}

export async function updateVendorImage(imageUrl: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "未登入" };

  await supabase.from("vendors").update({ image_url: imageUrl }).eq("owner_id", user.id);
  revalidatePath("/vendor/profile");
  revalidatePath("/");
  return { success: true };
}
