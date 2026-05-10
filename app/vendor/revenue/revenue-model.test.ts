import { describe, expect, it } from "vitest";

import {
  buildDailyRevenueTrend,
  buildRevenueStats,
  buildTopMenuItems,
  getMonthRange,
  getPreviousMonth,
  parseRevenueMonth,
  type RevenueRow,
} from "@/app/vendor/revenue/revenue-model";

const rows: RevenueRow[] = [
  {
    date: "2026-05-31",
    qty: 2,
    unit_price: 80,
    order_id: "may-order",
    order_status: "confirmed",
    menu_item_id: "bento",
    menu_item_name: "雞腿便當",
  },
  {
    date: "2026-06-01",
    qty: 1,
    unit_price: 100,
    order_id: "june-order",
    order_status: "completed",
    menu_item_id: "noodle",
    menu_item_name: "牛肉麵",
  },
  {
    date: "2026-06-10",
    qty: 3,
    unit_price: 60,
    order_id: "cancelled-order",
    order_status: "cancelled",
    menu_item_id: "tea",
    menu_item_name: "紅茶",
  },
  {
    date: "2026-06-12",
    qty: 2,
    unit_price: 100,
    order_id: "pending-order",
    order_status: "pending",
    menu_item_id: "noodle",
    menu_item_name: "牛肉麵",
  },
  {
    date: "2026-06-15",
    qty: 4,
    unit_price: 50,
    order_id: "tea-order",
    order_status: "confirmed",
    menu_item_id: "tea",
    menu_item_name: "紅茶",
  },
];

describe("parseRevenueMonth", () => {
  it("uses valid query string month values", () => {
    expect(parseRevenueMonth({ year: "2026", month: "5" }, new Date("2026-06-20"))).toEqual({
      year: 2026,
      month: 5,
    });
  });

  it("falls back to the current month for invalid query values", () => {
    expect(parseRevenueMonth({ year: "bad", month: "13" }, new Date("2026-06-20"))).toEqual({
      year: 2026,
      month: 6,
    });
  });
});

describe("month helpers", () => {
  it("builds inclusive date boundaries for a month", () => {
    expect(getMonthRange(2026, 2)).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
  });

  it("returns previous month across year boundaries", () => {
    expect(getPreviousMonth(2026, 1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("buildRevenueStats", () => {
  it("counts revenue by service date and excludes inactive order statuses", () => {
    const result = buildRevenueStats(rows, 2026, 6);

    expect(result.thisMonth).toEqual({
      orders: 2,
      revenue: 300,
      soldQuantity: 5,
    });
    expect(result.lastMonth).toEqual({
      orders: 1,
      revenue: 160,
      soldQuantity: 2,
    });
  });
});

describe("buildDailyRevenueTrend", () => {
  it("builds a daily revenue series using service dates", () => {
    const result = buildDailyRevenueTrend(rows, 3, new Date("2026-06-16T12:00:00.000Z"));

    expect(result).toEqual([
      { date: "2026-06-14", revenue: 0 },
      { date: "2026-06-15", revenue: 200 },
      { date: "2026-06-16", revenue: 0 },
    ]);
  });
});

describe("buildTopMenuItems", () => {
  it("sorts menu items by selected-month revenue", () => {
    const result = buildTopMenuItems(rows, 2026, 6, 5);

    expect(result).toEqual([
      { name: "紅茶", count: 4, revenue: 200 },
      { name: "牛肉麵", count: 1, revenue: 100 },
    ]);
  });
});
