import { createClient } from "@/lib/supabase/server";

export type RecommendedItem = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  tags: string[];
  calories: number | null;
  protein: number | null;
  vendor_id: string;
  vendor_name: string;
};

export type HomeItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  tags: string[];
  ai_tags: string[];
  ai_description: string | null;
  calories: number | null;
  protein: number | null;
  sodium: number | null;
  vendor_id: string;
  vendor_name: string;
  vendor_is_open: boolean;
  match_score: number;
  top_tag_label: string | null;
};

export async function getHomeItems(
  areaId?: string,
  limit = 60,
  contextVec?: number[] | null,
): Promise<HomeItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("rank_menu_items_for_home", {
    p_area_id: areaId ?? undefined,
    p_limit: limit,
    p_context_vec: (contextVec ?? undefined) as unknown as string,
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

export async function getTrendingItems(limit = 8, areaId?: string): Promise<RecommendedItem[]> {
  const supabase = await createClient();
  const since = new Date(new Date().getTime() - 7 * 86400000).toISOString();

  const { data: orderItems } = await supabase
    .from("order_items")
    .select("menu_item_id, qty, orders!inner(status, created_at)")
    .in("orders.status", ["confirmed", "completed"])
    .gte("orders.created_at", since);

  if (!orderItems || orderItems.length === 0) return [];

  const totals = new Map<string, number>();
  for (const row of orderItems) {
    totals.set(row.menu_item_id, (totals.get(row.menu_item_id) ?? 0) + row.qty);
  }

  const topIds = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topIds.length === 0) return [];

  const select = areaId
    ? "id, name, price, description, tags, calories, protein, vendor_id, vendors!inner(name, vendor_areas!inner(area_id))"
    : "id, name, price, description, tags, calories, protein, vendor_id, vendors(name)";

  let query = supabase
    .from("menu_items")
    .select(select)
    .in("id", topIds)
    .eq("is_available", true);

  if (areaId) query = query.eq("vendors.vendor_areas.area_id", areaId);

  const { data: items } = await query;

  if (!items) return [];

  return topIds
    .map((id) => {
      const item = items.find((i) => i.id === id);
      if (!item) return null;
      const vendor = item.vendors as { name: string } | null;
      return {
        id: item.id,
        name: item.name,
        price: item.price,
        description: item.description,
        tags: item.tags,
        calories: item.calories,
        protein: item.protein,
        vendor_id: item.vendor_id,
        vendor_name: vendor?.name ?? "",
      };
    })
    .filter((x): x is RecommendedItem => x !== null);
}

