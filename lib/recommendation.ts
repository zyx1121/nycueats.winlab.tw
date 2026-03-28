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

export async function getTrendingItems(limit = 8): Promise<RecommendedItem[]> {
  const supabase = await createClient();
  const since = new Date(new Date().getTime() - 7 * 86400000).toISOString();

  const { data: orderItems } = await supabase
    .from("order_items")
    .select("menu_item_id, qty, orders!inner(status, created_at)")
    .neq("orders.status", "pending")
    .gte("created_at", since);

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

  const { data: items } = await supabase
    .from("menu_items")
    .select("id, name, price, description, tags, calories, protein, vendor_id, vendors(name)")
    .in("id", topIds)
    .eq("is_available", true);

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

export async function getNutritionPicks(limit = 8): Promise<RecommendedItem[]> {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("menu_items")
    .select("id, name, price, description, tags, calories, protein, vendor_id, vendors(name)")
    .eq("is_available", true)
    .not("protein", "is", null)
    .order("protein", { ascending: false })
    .limit(limit);

  if (!items) return [];

  return items.map((item) => {
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
  });
}

export async function getRandomPicks(userId: string | null, limit = 8): Promise<RecommendedItem[]> {
  const supabase = await createClient();

  let excludeIds: string[] = [];
  if (userId) {
    const { data: ordered } = await supabase
      .from("order_items")
      .select("menu_item_id, orders!inner(user_id)")
      .eq("orders.user_id", userId);
    if (ordered) {
      excludeIds = [...new Set(ordered.map((r) => r.menu_item_id))];
    }
  }

  let query = supabase
    .from("menu_items")
    .select("id, name, price, description, tags, calories, protein, vendor_id, vendors(name)")
    .eq("is_available", true)
    .order("created_at");

  if (excludeIds.length > 0) {
    query = query.not("id", "in", `(${excludeIds.join(",")})`);
  }

  const { data: items } = await query;

  if (!items || items.length === 0) return [];

  const shuffled = [...items].sort(() => Math.random() - 0.5).slice(0, limit);

  return shuffled.map((item) => {
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
  });
}
