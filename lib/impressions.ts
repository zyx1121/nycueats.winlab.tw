import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordImpressions(
  supabase: SupabaseClient,
  userId: string,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) return;
  const today = new Date().toISOString().split("T")[0];
  const seen = new Set<string>();
  const rows = itemIds.flatMap((id) => {
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ user_id: userId, menu_item_id: id, date: today }];
  });
  await supabase
    .from("menu_item_impressions")
    .upsert(rows, { onConflict: "user_id,menu_item_id,date", ignoreDuplicates: true });
}
