"use server";

import { requireRole } from "@/lib/auth";

export type VendorReport = {
  vendor_id: string;
  vendor_name: string;
  order_count: number;
  total_revenue: number;
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
