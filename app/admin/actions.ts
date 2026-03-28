"use server";

import { requireRole } from "@/lib/auth";

export type DashboardStats = {
  thisMonth: { orders: number; revenue: number };
  lastMonth: { orders: number; revenue: number };
  completionRate: number;
  cancelRate: number;
};

export type DailyOrderCount = { date: string; count: number };

export type RankedItem = { name: string; count: number; revenue: number };

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month, 1).toISOString().slice(0, 10);
  const end = new Date(year, month + 1, 0).toISOString().slice(0, 10);
  return { start, end };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { supabase } = await requireRole("admin");
  const now = new Date();
  const thisMonth = monthRange(now.getFullYear(), now.getMonth());
  const lastMonth = monthRange(now.getFullYear(), now.getMonth() - 1);

  const [thisMonthOrders, lastMonthOrders] = await Promise.all([
    supabase
      .from("orders")
      .select("id, status, order_items(qty, unit_price)")
      .neq("status", "pending")
      .gte("created_at", thisMonth.start)
      .lte("created_at", thisMonth.end + "T23:59:59"),
    supabase
      .from("orders")
      .select("id, status, order_items(qty, unit_price)")
      .neq("status", "pending")
      .gte("created_at", lastMonth.start)
      .lte("created_at", lastMonth.end + "T23:59:59"),
  ]);

  function sumRevenue(orders: typeof thisMonthOrders["data"]) {
    if (!orders) return 0;
    return orders.reduce((total, order) => {
      const items = Array.isArray(order.order_items) ? order.order_items : [];
      return total + items.reduce((s, i) => s + (i.qty ?? 0) * (i.unit_price ?? 0), 0);
    }, 0);
  }

  function countByStatus(orders: typeof thisMonthOrders["data"], status: string) {
    if (!orders) return 0;
    return orders.filter((o) => o.status === status).length;
  }

  const thisData = thisMonthOrders.data ?? [];
  const completedThis = countByStatus(thisData, "completed");
  const cancelledThis = countByStatus(thisData, "cancelled");
  const totalThis = thisData.length;

  return {
    thisMonth: { orders: totalThis, revenue: sumRevenue(thisData) },
    lastMonth: { orders: (lastMonthOrders.data ?? []).length, revenue: sumRevenue(lastMonthOrders.data) },
    completionRate: totalThis > 0 ? completedThis / totalThis : 0,
    cancelRate: totalThis > 0 ? cancelledThis / totalThis : 0,
  };
}

export async function getOrderTrend(days: number): Promise<DailyOrderCount[]> {
  const { supabase } = await requireRole("admin");
  const now = new Date();
  const start = new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from("orders")
    .select("created_at")
    .neq("status", "pending")
    .gte("created_at", start);

  const counts: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getTime() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    counts[d] = 0;
  }

  for (const row of data ?? []) {
    const d = row.created_at.slice(0, 10);
    if (d in counts) counts[d]++;
  }

  return Object.entries(counts).map(([date, count]) => ({ date, count }));
}

export async function getTopVendors(limit: number): Promise<RankedItem[]> {
  const { supabase } = await requireRole("admin");

  const { data } = await supabase
    .from("order_items")
    .select("qty, unit_price, menu_items(vendor_id, vendors(name)), orders!inner(status)")
    .neq("orders.status", "pending")
    .neq("orders.status", "cancelled");

  type Row = {
    qty: number;
    unit_price: number;
    menu_items: { vendor_id: string; vendors: { name: string } | null } | null;
  };

  const map: Record<string, { name: string; count: number; revenue: number }> = {};

  for (const row of (data ?? []) as Row[]) {
    const vendor = row.menu_items?.vendors;
    const vendorId = row.menu_items?.vendor_id;
    if (!vendor || !vendorId) continue;
    if (!map[vendorId]) map[vendorId] = { name: vendor.name, count: 0, revenue: 0 };
    map[vendorId].count += row.qty ?? 0;
    map[vendorId].revenue += (row.qty ?? 0) * (row.unit_price ?? 0);
  }

  return Object.values(map)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export async function getTopMenuItems(limit: number): Promise<RankedItem[]> {
  const { supabase } = await requireRole("admin");

  const { data } = await supabase
    .from("order_items")
    .select("qty, unit_price, menu_item_id, menu_items(name), orders!inner(status)")
    .neq("orders.status", "pending")
    .neq("orders.status", "cancelled");

  type Row = {
    qty: number;
    unit_price: number;
    menu_item_id: string;
    menu_items: { name: string } | null;
  };

  const map: Record<string, { name: string; count: number; revenue: number }> = {};

  for (const row of (data ?? []) as Row[]) {
    const name = row.menu_items?.name;
    if (!name) continue;
    if (!map[row.menu_item_id]) map[row.menu_item_id] = { name, count: 0, revenue: 0 };
    map[row.menu_item_id].count += row.qty ?? 0;
    map[row.menu_item_id].revenue += (row.qty ?? 0) * (row.unit_price ?? 0);
  }

  return Object.values(map)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}
