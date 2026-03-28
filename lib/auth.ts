import { createClient } from "@/lib/supabase/server";

type Role = "admin" | "vendor" | "user";

export async function requireRole(role: Role) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("未登入");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role?.includes(role)) throw new Error("權限不足");

  return { user, supabase };
}
