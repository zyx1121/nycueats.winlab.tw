// lib/search.ts
import type { SearchFilters } from "@/lib/filters";
import type { HomeItem } from "@/lib/recommendation";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const RERANK_POOL = 40;

export async function searchHomeItems(
  query: string,
  areaId?: string,
  limit = 30,
  filters?: SearchFilters,
): Promise<HomeItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();

  let embedding: number[] | null = null;
  try {
    const { data: embedRes, error: embedErr } = await supabase.functions.invoke<{
      embedding: number[];
    }>("embed-query", { body: { query: trimmed } });
    if (!embedErr) embedding = embedRes?.embedding ?? null;
  } catch (e) {
    console.error("embed-query failed; degrading to keyword-only:", e);
  }

  const hasExplicitSort = filters?.sort && filters.sort !== "recommended";
  const fetchLimit = hasExplicitSort ? limit : Math.max(limit, RERANK_POOL);

  const { data, error } = await supabase.rpc("hybrid_search", {
    p_query: trimmed,
    p_query_embedding: embedding as unknown as string,
    p_area_id: areaId ?? undefined,
    p_limit: fetchLimit,
    p_open: filters?.open ?? undefined,
    p_price_min: filters?.priceMin ?? undefined,
    p_price_max: filters?.priceMax ?? undefined,
    p_cal_min: filters?.calMin ?? undefined,
    p_cal_max: filters?.calMax ?? undefined,
    p_tags: filters?.tags ?? undefined,
    p_sort: hasExplicitSort ? filters!.sort : undefined,
    p_dates: filters?.dates ?? undefined,
  } as Parameters<typeof supabase.rpc>[1]);
  if (error || !data) return [];

  const items: HomeItem[] = data.map((row) => ({
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

  if (hasExplicitSort) return items;

  const reranked = await rerankItems(supabase, trimmed, items);
  return (reranked ?? items).slice(0, limit);
}

async function rerankItems(
  supabase: SupabaseServerClient,
  query: string,
  items: HomeItem[],
): Promise<HomeItem[] | null> {
  if (items.length <= 1) return null;

  try {
    const candidates = items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.ai_description ?? i.description,
      tags: i.tags,
      calories: i.calories,
      protein: i.protein,
      sodium: i.sodium,
    }));

    const { data, error } = await supabase.functions.invoke<{
      ranking: Array<{ id: string; score: number }>;
    }>("rerank-search", { body: { query, candidates } });

    if (error || !data?.ranking?.length) return null;

    const scoreById = new Map(data.ranking.map((r) => [r.id, r.score]));

    return [...items].sort((a, b) => {
      const sa = scoreById.get(a.id);
      const sb = scoreById.get(b.id);
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    });
  } catch (e) {
    console.error("rerank-search failed; keeping RRF order:", e);
    return null;
  }
}
