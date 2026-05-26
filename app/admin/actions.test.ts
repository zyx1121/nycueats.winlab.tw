import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { getDashboardStats, getTopMenuItems, getTopVendors } from "@/app/admin/actions";
import { createSupabaseMock, roleProfile } from "@/test/supabase-mock";

describe("getDashboardStats", () => {
  beforeEach(() => createClientMock.mockReset());

  it("requires the admin role", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [roleProfile("user")],
    });
    createClientMock.mockResolvedValue(client);
    await expect(getDashboardStats()).rejects.toThrow("權限不足");
  });

  it("counts orders, sums confirmed/completed revenue, and derives rates", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        {
          table: "orders",
          result: {
            data: [
              { id: "o1", status: "completed", order_items: [{ qty: 2, unit_price: 50 }] },
              { id: "o2", status: "confirmed", order_items: [{ qty: 1, unit_price: 30 }] },
              { id: "o3", status: "cancelled", order_items: [{ qty: 1, unit_price: 999 }] },
              { id: "o4", status: "completed", order_items: [{ qty: 1, unit_price: 20 }] },
            ],
          },
        },
        {
          table: "orders",
          result: {
            data: [
              { id: "l1", status: "completed", order_items: [{ qty: 1, unit_price: 100 }] },
              { id: "l2", status: "confirmed", order_items: [{ qty: 2, unit_price: 25 }] },
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getDashboardStats()).resolves.toEqual({
      thisMonth: { orders: 4, revenue: 150 }, // cancelled o3 excluded from revenue
      lastMonth: { orders: 2, revenue: 150 },
      completionRate: 0.5, // 2 completed / 4 total
      cancelRate: 0.25, // 1 cancelled / 4 total
    });
  });

  it("avoids divide-by-zero when there are no orders this month", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        { table: "orders", result: { data: [] } },
        { table: "orders", result: { data: [] } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getDashboardStats()).resolves.toEqual({
      thisMonth: { orders: 0, revenue: 0 },
      lastMonth: { orders: 0, revenue: 0 },
      completionRate: 0,
      cancelRate: 0,
    });
  });
});

describe("getTopVendors", () => {
  beforeEach(() => createClientMock.mockReset());

  it("aggregates qty + revenue per vendor and respects the limit", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        {
          table: "order_items",
          result: {
            data: [
              { qty: 2, unit_price: 50, menu_items: { vendor_id: "v1", vendors: { name: "A" } } },
              { qty: 1, unit_price: 10, menu_items: { vendor_id: "v1", vendors: { name: "A" } } },
              { qty: 1, unit_price: 500, menu_items: { vendor_id: "v2", vendors: { name: "B" } } },
              { qty: 9, unit_price: 9, menu_items: null }, // unjoined → skipped
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getTopVendors(1)).resolves.toEqual([{ name: "B", count: 1, revenue: 500 }]);
  });
});

describe("getTopMenuItems", () => {
  beforeEach(() => createClientMock.mockReset());

  it("ranks menu items by revenue", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        {
          table: "order_items",
          result: {
            data: [
              { qty: 3, unit_price: 40, menu_item_id: "m1", menu_items: { name: "拉麵" } },
              { qty: 1, unit_price: 40, menu_item_id: "m1", menu_items: { name: "拉麵" } },
              { qty: 1, unit_price: 300, menu_item_id: "m2", menu_items: { name: "牛排" } },
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getTopMenuItems(5)).resolves.toEqual([
      { name: "牛排", count: 1, revenue: 300 },
      { name: "拉麵", count: 4, revenue: 160 },
    ]);
  });
});
