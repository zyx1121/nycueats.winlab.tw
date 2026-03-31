"use server";

import { buildOrderSummaries } from "@/app/orders/order-summary";
import { createClient } from "@/lib/supabase/server";

export type OrderSummary = {
  id: string;
  status: string;
  created_at: string;
  items: {
    id: string;
    date: string;
    qty: number;
    unit_price: number;
    picked_up: boolean;
    menu_item_name: string;
    vendor_name: string;
    options: { name: string; price_delta: number }[];
  }[];
};

export async function getOrders(
  page: number,
  limit: number = 10
): Promise<{ orders: OrderSummary[]; hasMore: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { orders: [], hasMore: false };

  const from = page * limit;
  const to = from + limit; // fetch limit+1 to detect hasMore

  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, created_at")
    .eq("user_id", user.id)
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (!orders) return { orders: [], hasMore: false };

  const hasMore = orders.length > limit;
  const pageOrders = hasMore ? orders.slice(0, limit) : orders;

  const orderIds = pageOrders.map((o) => o.id);

  const { data: allItems } = await supabase
    .from("order_items")
    .select(
      "id, date, qty, unit_price, picked_up, order_id, menu_items(name, vendors(name)), order_item_options(name, price_delta)"
    )
    .in("order_id", orderIds)
    .order("date");

  const result = buildOrderSummaries(
    pageOrders,
    (allItems as Parameters<typeof buildOrderSummaries>[1] | null) ?? []
  );

  return { orders: result, hasMore };
}
