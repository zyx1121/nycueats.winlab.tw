import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { getMonthlyReport } from "@/app/admin/reports/actions";
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

describe("getMonthlyReport", () => {
  beforeEach(() => createClientMock.mockReset());

  it("requires the admin role", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [roleProfile("vendor")],
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
