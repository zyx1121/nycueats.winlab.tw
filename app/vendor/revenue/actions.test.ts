import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { getVendorRevenueDashboard } from "@/app/vendor/revenue/actions";
import { createSupabaseMock, roleProfile } from "@/test/supabase-mock";

describe("getVendorRevenueDashboard", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T12:00:00Z"));
  });

  it("returns an empty dashboard when the vendor record is missing", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [roleProfile("vendor"), { table: "vendors", result: { data: null } }],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getVendorRevenueDashboard(2026, 5)).resolves.toMatchObject({
      vendor: null,
      stats: {
        thisMonth: { orders: 0, revenue: 0, soldQuantity: 0 },
        lastMonth: { orders: 0, revenue: 0, soldQuantity: 0 },
      },
      topMenuItems: [],
    });
  });

  it("builds the dashboard from vendor order items", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        roleProfile("vendor"),
        { table: "vendors", result: { data: { id: "v1", name: "好吃店" } } },
        {
          table: "order_items",
          result: {
            data: [
              {
                date: "2026-05-10",
                qty: 2,
                unit_price: 100,
                order_id: "o1",
                menu_item_id: "m1",
                menu_items: { name: "雞腿飯", vendor_id: "v1" },
                orders: { status: "confirmed" },
              },
              {
                date: "2026-04-20",
                qty: 1,
                unit_price: 80,
                order_id: "o2",
                menu_item_id: "m2",
                menu_items: { name: "湯麵", vendor_id: "v1" },
                orders: { status: "completed" },
              },
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await getVendorRevenueDashboard(2026, 5);

    expect(result.vendor).toEqual({ id: "v1", name: "好吃店" });
    expect(result.stats.thisMonth).toEqual({ orders: 1, revenue: 200, soldQuantity: 2 });
    expect(result.stats.lastMonth).toEqual({ orders: 1, revenue: 80, soldQuantity: 1 });
    expect(result.topMenuItems[0]).toMatchObject({ name: "雞腿飯", count: 2, revenue: 200 });
  });

  it("keeps the vendor but returns empty metrics when the order query fails", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        roleProfile("vendor"),
        { table: "vendors", result: { data: { id: "v1", name: "好吃店" } } },
        { table: "order_items", result: { data: null, error: { message: "db down" } } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getVendorRevenueDashboard(2026, 5)).resolves.toMatchObject({
      vendor: { id: "v1", name: "好吃店" },
      stats: {
        thisMonth: { orders: 0, revenue: 0, soldQuantity: 0 },
        lastMonth: { orders: 0, revenue: 0, soldQuantity: 0 },
      },
    });
  });
});
