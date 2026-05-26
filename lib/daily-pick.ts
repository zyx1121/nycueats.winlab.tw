import type { HomeItem } from "@/lib/recommendation";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function getDailyPick(
  supabase: SupabaseClient,
  userId: string,
): Promise<HomeItem | null> {
  const today = new Date().toISOString().split("T")[0];

  const { data: pick } = await supabase
    .from("daily_picks")
    .select("menu_item_id")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();

  if (!pick?.menu_item_id) return null;

  const { data: item } = await supabase
    .from("menu_items")
    .select(
      "id, name, description, price, image_url, ai_tags, ai_description, tags, calories, protein, sodium, vendor_id, is_available, vendors!inner(name, is_open, is_active)",
    )
    .eq("id", pick.menu_item_id)
    .maybeSingle();

  if (!item || !item.is_available) return null;
  const vendor = item.vendors as unknown as { name: string; is_open: boolean; is_active: boolean };
  if (!vendor.is_active) return null;

  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    image_url: item.image_url,
    tags: item.tags ?? [],
    ai_tags: item.ai_tags ?? [],
    ai_description: item.ai_description,
    calories: item.calories,
    protein: item.protein,
    sodium: item.sodium,
    vendor_id: item.vendor_id,
    vendor_name: vendor.name,
    vendor_is_open: vendor.is_open,
    match_score: 0,
    top_tag_label: null,
  };
}
