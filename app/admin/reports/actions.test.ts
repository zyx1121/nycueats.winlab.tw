import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { getMonthlyReport, getVendorMonthlyDetail } from "@/app/admin/reports/actions";
import { createSupabaseMock, roleProfile } from "@/test/supabase-mock";

function orderItem(
  qty: number,
  unitPrice: number,
  vendorId: string | null,
  vendorName: string,
  orderId: string | null,
) {
  return {
    qty,
    unit_price: unitPrice,
    menu_items: vendorId ? { vendor_id: vendorId, vendors: { name: vendorName } } : null,
    orders: orderId ? { id: orderId } : null,
  };
}

function detailItem(
  menuItemId: string,
  menuItemName: string,
  qty: number,
  unitPrice: number,
  status: string,
  pickedUp = false,
  options: number[] = [],
) {
  return {
    id: `oi-${menuItemId}-${status}`,
    qty,
    unit_price: unitPrice,
    picked_up: pickedUp,
    menu_items: { id: menuItemId, name: menuItemName, vendor_id: "v1" },
    orders: { status },
    order_item_options: options.map((price_delta) => ({ price_delta })),
  };
}

describe("getMonthlyReport", () => {
  beforeEach(() => createClientMock.mockReset());

  it.each(["user", "vendor"])("blocks %s role", async (role) => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [roleProfile(role)],
    });
    createClientMock.mockResolvedValue(client);
    await expect(getMonthlyReport(2026, 5)).rejects.toThrow("權限不足");
  });

  it("sums revenue per vendor and counts distinct orders, sorted by revenue", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        {
          table: "order_items",
          result: {
            data: [
              orderItem(2, 50, "v1", "A", "o1"), // A: 100, order o1
              orderItem(1, 30, "v1", "A", "o1"), // A: +30, same order o1
              orderItem(1, 20, "v1", "A", "o2"), // A: +20, new order o2
              orderItem(1, 500, "v2", "B", "o3"), // B: 500, order o3
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getMonthlyReport(2026, 5)).resolves.toEqual([
      { vendor_id: "v2", vendor_name: "B", order_count: 1, total_revenue: 500 },
      { vendor_id: "v1", vendor_name: "A", order_count: 2, total_revenue: 150 },
    ]);
  });

  it("skips rows with missing vendor or order joins", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        {
          table: "order_items",
          result: {
            data: [
              orderItem(1, 100, null, "", "o1"), // no vendor → skipped
              orderItem(1, 100, "v1", "A", null), // no order → skipped
              orderItem(2, 40, "v1", "A", "o9"), // counted: 80
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getMonthlyReport(2026, 5)).resolves.toEqual([
      { vendor_id: "v1", vendor_name: "A", order_count: 1, total_revenue: 80 },
    ]);
  });

  it("returns an empty report when there are no qualifying items", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [roleProfile("admin"), { table: "order_items", result: { data: [] } }],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getMonthlyReport(2026, 5)).resolves.toEqual([]);
  });
});

describe("getVendorMonthlyDetail", () => {
  beforeEach(() => createClientMock.mockReset());

  it.each(["user", "vendor"])("blocks %s role", async (role) => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [roleProfile(role)],
    });
    createClientMock.mockResolvedValue(client);
    await expect(getVendorMonthlyDetail("v1", 2026, 5)).rejects.toThrow("權限不足");
  });

  it("aggregates sold, cancelled, picked_up and not_picked_up per menu item, sorted by subtotal", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        {
          table: "order_items",
          result: {
            data: [
              detailItem("m1", "炸雞", 2, 100, "confirmed", true),
              detailItem("m1", "炸雞", 1, 100, "confirmed", false),
              detailItem("m1", "炸雞", 1, 100, "cancelled"),
              detailItem("m2", "便當", 3, 50, "confirmed", true),
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getVendorMonthlyDetail("v1", 2026, 5)).resolves.toEqual([
      {
        menu_item_id: "m1",
        menu_item_name: "炸雞",
        base_price: 100,
        sold_qty: 3,
        cancelled_qty: 1,
        picked_up_qty: 2,
        not_picked_up_qty: 1,
        avg_unit_price: 100,
        subtotal: 300,
      },
      {
        menu_item_id: "m2",
        menu_item_name: "便當",
        base_price: 50,
        sold_qty: 3,
        cancelled_qty: 0,
        picked_up_qty: 3,
        not_picked_up_qty: 0,
        avg_unit_price: 50,
        subtotal: 150,
      },
    ]);
  });

  it("folds option price_delta × qty into subtotal and avg_unit_price", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        {
          table: "order_items",
          result: {
            data: [
              // qty=2, unit=$100, options +$20 +$0 → subtotal = 2*(100+20+0) = 240
              detailItem("m1", "雞腿飯", 2, 100, "confirmed", true, [20, 0]),
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getVendorMonthlyDetail("v1", 2026, 5)).resolves.toEqual([
      expect.objectContaining({ sold_qty: 2, subtotal: 240, avg_unit_price: 120 }),
    ]);
  });

  it("excludes pending orders from all counts", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        {
          table: "order_items",
          result: {
            data: [
              detailItem("m1", "炸雞", 2, 100, "pending"),
              detailItem("m1", "炸雞", 1, 100, "confirmed", true),
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getVendorMonthlyDetail("v1", 2026, 5)).resolves.toEqual([
      expect.objectContaining({ sold_qty: 1, cancelled_qty: 0, subtotal: 100 }),
    ]);
  });

  it("skips rows with missing menu_items or orders join", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        {
          table: "order_items",
          result: {
            data: [
              { id: "x1", qty: 1, unit_price: 100, picked_up: false, menu_items: null, orders: { status: "confirmed" }, order_item_options: [] },
              { id: "x2", qty: 1, unit_price: 100, picked_up: false, menu_items: { id: "m1", name: "A", vendor_id: "v1" }, orders: null, order_item_options: [] },
              detailItem("m2", "有效", 1, 50, "confirmed", true),
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await getVendorMonthlyDetail("v1", 2026, 5);
    expect(result).toHaveLength(1);
    expect(result[0].menu_item_id).toBe("m2");
  });

  it("returns empty array when no items", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [roleProfile("admin"), { table: "order_items", result: { data: [] } }],
    });
    createClientMock.mockResolvedValue(client);

    await expect(getVendorMonthlyDetail("v1", 2026, 5)).resolves.toEqual([]);
  });
});
