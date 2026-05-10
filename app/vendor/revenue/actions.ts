"use server";

import { requireRole } from "@/lib/auth";

import {
  buildDailyRevenueTrend,
  buildRevenueStats,
  buildTopMenuItems,
  getMonthRange,
  getPreviousMonth,
  type DailyRevenue,
  type MenuRevenueRank,
  type RevenueRow,
  type RevenueStats,
} from "./revenue-model";

export type VendorRevenueDashboard = {
  vendor: { id: string; name: string } | null;
  stats: RevenueStats;
  trend: DailyRevenue[];
  topMenuItems: MenuRevenueRank[];
};

type OrderItemQueryRow = {
  date: string;
  qty: number;
  unit_price: number;
  order_id: string;
  menu_item_id: string;
  menu_items: { name: string; vendor_id: string } | null;
  orders: { status: string } | null;
};

function emptyStats(): RevenueStats {
  return {
    thisMonth: { orders: 0, revenue: 0, soldQuantity: 0 },
    lastMonth: { orders: 0, revenue: 0, soldQuantity: 0 },
  };
}

function emptyDashboard(vendor: { id: string; name: string } | null): VendorRevenueDashboard {
  return {
    vendor,
    stats: emptyStats(),
    trend: buildDailyRevenueTrend([], 30),
    topMenuItems: [],
  };
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getTrendStart(days: number, now = new Date()): string {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return toDateKey(new Date(end - (days - 1) * 86400000));
}

function minDate(...dates: string[]): string {
  return dates.reduce((min, date) => (date < min ? date : min));
}

function maxDate(...dates: string[]): string {
  return dates.reduce((max, date) => (date > max ? date : max));
}

function toRevenueRows(rows: OrderItemQueryRow[]): RevenueRow[] {
  return rows.map((row) => ({
    date: row.date,
    qty: row.qty,
    unit_price: row.unit_price,
    order_id: row.order_id,
    order_status: row.orders?.status ?? "",
    menu_item_id: row.menu_item_id,
    menu_item_name: row.menu_items?.name ?? "",
  }));
}

export async function getVendorRevenueDashboard(
  year: number,
  month: number
): Promise<VendorRevenueDashboard> {
  const { user, supabase } = await requireRole("vendor");

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("owner_id", user.id)
    .single();

  if (!vendor) return emptyDashboard(null);

  const selectedRange = getMonthRange(year, month);
  const previous = getPreviousMonth(year, month);
  const previousRange = getMonthRange(previous.year, previous.month);
  const trendStart = getTrendStart(30);
  const today = toDateKey(new Date());
  const start = minDate(previousRange.start, selectedRange.start, trendStart);
  const end = maxDate(previousRange.end, selectedRange.end, today);

  const { data, error } = await supabase
    .from("order_items")
    .select("date, qty, unit_price, order_id, menu_item_id, menu_items!inner(name, vendor_id), orders!inner(status)")
    .eq("menu_items.vendor_id", vendor.id)
    .in("orders.status", ["confirmed", "completed"])
    .gte("date", start)
    .lte("date", end);

  if (error) return emptyDashboard(vendor);

  const rows = toRevenueRows((data ?? []) as OrderItemQueryRow[]);

  return {
    vendor,
    stats: buildRevenueStats(rows, year, month),
    trend: buildDailyRevenueTrend(rows, 30),
    topMenuItems: buildTopMenuItems(rows, year, month, 5),
  };
}
