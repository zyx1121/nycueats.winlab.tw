"use server";

import { requireRole } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function grantVendorRole(targetUserId: string) {
  const { supabase } = await requireRole("admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", targetUserId)
    .single();

  if (!profile) return { error: "找不到使用者" };

  if (profile.role.includes("vendor")) return { success: true };

  const { error } = await supabase
    .from("profiles")
    .update({ role: [...profile.role, "vendor"] })
    .eq("id", targetUserId);

  if (error) return { error: "授權失敗" };
  revalidatePath("/admin/users");
  return { success: true };
}

export async function revokeVendorRole(targetUserId: string) {
  const { supabase } = await requireRole("admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", targetUserId)
    .single();

  if (!profile) return { error: "找不到使用者" };

  const { error } = await supabase
    .from("profiles")
    .update({ role: profile.role.filter((r) => r !== "vendor") })
    .eq("id", targetUserId);

  if (error) return { error: "撤銷失敗" };
  revalidatePath("/admin/users");
  return { success: true };
}
