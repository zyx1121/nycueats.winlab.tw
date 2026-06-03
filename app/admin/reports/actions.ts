"use server";

import { requireRole } from "@/lib/auth";

export type VendorReport = {
  vendor_id: string;
  vendor_name: string;
  order_count: number;
  total_revenue: number;
};

export type MenuItemReport = {
  menu_item_id: string;
  menu_item_name: string;
  base_price: number;
  sold_qty: number;
  cancelled_qty: number;
  picked_up_qty: number;
  not_picked_up_qty: number;
  avg_unit_price: number;
  subtotal: number;
};

export async function getMonthlyReport(year: number, month: number): Promise<VendorReport[]> {
  const { supabase } = await requireRole("admin");

  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

  const { data: items } = await supabase
    .from("order_items")
    .select("qty, unit_price, menu_items!inner(vendor_id, vendors!inner(name)), orders!inner(id, status, created_at)")
    .in("orders.status", ["confirmed", "completed"])
    .gte("orders.created_at", startDate)
    .lte("orders.created_at", endDate);

  const map: Record<string, VendorReport> = {};
  const ordersByVendor: Record<string, Set<string>> = {};

  for (const item of items ?? []) {
    const vendorData = item.menu_items as { vendor_id: string; vendors: { name: string } } | null;
    const orderData = item.orders as { id: string } | null;
    if (!vendorData || !orderData) continue;

    const vid = vendorData.vendor_id;
    map[vid] ??= { vendor_id: vid, vendor_name: vendorData.vendors.name, order_count: 0, total_revenue: 0 };
    map[vid].total_revenue += item.qty * item.unit_price;

    ordersByVendor[vid] ??= new Set();
    ordersByVendor[vid].add(orderData.id);
  }

  for (const [vid, orders] of Object.entries(ordersByVendor)) {
    map[vid].order_count = orders.size;
  }

  return Object.values(map).sort((a, b) => b.total_revenue - a.total_revenue);
}

export async function getVendorMonthlyDetail(
  vendorId: string,
  year: number,
  month: number
): Promise<MenuItemReport[]> {
  const { supabase } = await requireRole("admin");

  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

  const { data: items } = await supabase
    .from("order_items")
    .select(
      "id, qty, unit_price, picked_up, menu_items!inner(id, name, vendor_id), orders!inner(status, created_at), order_item_options(price_delta)"
    )
    .eq("menu_items.vendor_id", vendorId)
    .gte("orders.created_at", startDate)
    .lte("orders.created_at", endDate);

  const map = new Map<string, MenuItemReport>();

  for (const item of items ?? []) {
    const mi = item.menu_items as { id: string; name: string; vendor_id: string } | null;
    const order = item.orders as { status: string } | null;
    const options = item.order_item_options as { price_delta: number }[] ?? [];
    if (!mi || !order) continue;

    if (!map.has(mi.id)) {
      map.set(mi.id, {
        menu_item_id: mi.id,
        menu_item_name: mi.name,
        base_price: item.unit_price,
        sold_qty: 0,
        cancelled_qty: 0,
        picked_up_qty: 0,
        not_picked_up_qty: 0,
        avg_unit_price: 0,
        subtotal: 0,
      });
    }

    const r = map.get(mi.id)!;
    const optionTotal = options.reduce((s, o) => s + o.price_delta, 0) * item.qty;

    if (order.status === "confirmed" || order.status === "completed") {
      r.sold_qty += item.qty;
      r.subtotal += item.qty * item.unit_price + optionTotal;
      if (item.picked_up) r.picked_up_qty += item.qty;
      else r.not_picked_up_qty += item.qty;
    } else if (order.status === "cancelled") {
      r.cancelled_qty += item.qty;
    }
  }

  return Array.from(map.values())
    .map((r) => ({
      ...r,
      avg_unit_price: r.sold_qty > 0 ? Math.round(r.subtotal / r.sold_qty) : r.base_price,
    }))
    .sort((a, b) => b.subtotal - a.subtotal);
}
