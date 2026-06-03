import type { HomeItem } from "@/lib/recommendation";
import type { SupabaseClient } from "@supabase/supabase-js";

const TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchReasonsForItems(
  supabase: SupabaseClient,
  userId: string,
  itemIds: string[],
): Promise<Map<string, string>> {
  if (itemIds.length === 0) return new Map();
  const { data } = await supabase
    .from("personalized_reasons")
    .select("menu_item_id, reason, generated_at")
    .eq("user_id", userId)
    .in("menu_item_id", itemIds);
  const map = new Map<string, string>();
  const cutoff = Date.now() - TTL_MS;
  for (const row of data ?? []) {
    if (new Date(row.generated_at).getTime() >= cutoff) {
      map.set(row.menu_item_id, row.reason);
    }
  }
  return map;
}

export function attachReasons<T extends HomeItem>(
  items: T[],
  reasons: Map<string, string>,
): (T & { reason: string | null })[] {
  return items.map((it) => ({ ...it, reason: reasons.get(it.id) ?? null }));
}

export async function triggerReasonGeneration(
  supabase: SupabaseClient,
  items: HomeItem[],
): Promise<void> {
  if (items.length === 0) return;
  try {
    await supabase.functions.invoke("generate-reasons", {
      body: {
        items: items.slice(0, 20).map((it) => ({
          id: it.id,
          name: it.name,
          ai_description: it.ai_description,
          ai_tags: it.ai_tags,
        })),
      },
    });
  } catch (e) {
    console.error("generate-reasons trigger failed:", e);
  }
}
