import type { HomeItem } from "@/lib/recommendation";
import { createClient } from "@/lib/supabase/server";

export async function searchHomeItems(
  query: string,
  areaId?: string,
  limit = 30,
): Promise<HomeItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();

  // Step 1: try to get semantic embedding via edge function. Falls back
  // to keyword-only search if OpenAI / function unavailable.
  let embedding: number[] | null = null;
  try {
    const { data: embedRes, error: embedErr } = await supabase.functions.invoke<{
      embedding: number[];
    }>("embed-query", { body: { query: trimmed } });
    if (!embedErr) embedding = embedRes?.embedding ?? null;
  } catch (e) {
    console.error("embed-query failed; degrading to keyword-only:", e);
  }

  const { data, error } = await supabase.rpc("hybrid_search", {
    p_query: trimmed,
    p_query_embedding: embedding as unknown as string,
    p_area_id: areaId ?? undefined,
    p_limit: limit,
  });
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    image_url: row.image_url,
    tags: row.tags ?? [],
    ai_tags: row.ai_tags ?? [],
    ai_description: row.ai_description,
    calories: row.calories,
    protein: row.protein,
    sodium: row.sodium,
    vendor_id: row.vendor_id,
    vendor_name: row.vendor_name,
    vendor_is_open: row.vendor_is_open,
    match_score: row.match_score,
    top_tag_label: row.top_tag_label,
  }));
}
