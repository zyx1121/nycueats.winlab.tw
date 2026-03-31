import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { getOrders } from "@/app/orders/actions";

type QueryStep = {
  orderResult?: unknown;
  rangeResult?: unknown;
};

function createQuery(step: QueryStep = {}) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};

  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.neq = vi.fn(() => query);
  query.order = vi.fn(() => {
    if (step.orderResult === undefined) return query;
    return Promise.resolve(step.orderResult);
  });
  query.range = vi.fn(async () => step.rangeResult);
  query.in = vi.fn(() => query);

  return query;
}

function createSupabaseMock({
  user,
  queries,
}: {
  user: { id: string } | null;
  queries: Record<string, QueryStep[]>;
}) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
      })),
    },
    from: vi.fn((table: string) => {
      const steps = queries[table];
      if (!steps || steps.length === 0) {
        throw new Error(`No query step configured for table ${table}`);
      }

      return createQuery(steps.shift());
    }),
  };
}

describe("getOrders", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("returns an empty result when the user is not logged in", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        user: null,
        queries: {},
      })
    );

    await expect(getOrders(0)).resolves.toEqual({
      orders: [],
      hasMore: false,
    });
  });

  it("returns paginated non-pending orders with normalized items", async () => {
    createClientMock.mockResolvedValue(
      createSupabaseMock({
        user: { id: "user-1" },
        queries: {
          orders: [
            {
              rangeResult: {
                data: [
                  {
                    id: "order-2",
                    status: "completed",
                    created_at: "2026-04-02T10:00:00.000Z",
                  },
                  {
                    id: "order-1",
                    status: "confirmed",
                    created_at: "2026-04-01T10:00:00.000Z",
                  },
                ],
              },
            },
          ],
          order_items: [
            {
              orderResult: {
                data: [
                  {
                    id: "item-1",
                    date: "2026-04-01",
                    qty: 2,
                    unit_price: 100,
                    picked_up: false,
                    order_id: "order-1",
                    menu_items: {
                      name: "雞胸便當",
                      vendors: { name: "健康餐盒" },
                    },
                    order_item_options: [{ name: "加蛋", price_delta: 10 }],
                  },
                  {
                    id: "item-2",
                    date: "2026-04-02",
                    qty: 1,
                    unit_price: 80,
                    picked_up: true,
                    order_id: "order-2",
                    menu_items: null,
                    order_item_options: null,
                  },
                ],
              },
            },
          ],
        },
      })
    );

    await expect(getOrders(0, 1)).resolves.toEqual({
      orders: [
        {
          id: "order-2",
          status: "completed",
          created_at: "2026-04-02T10:00:00.000Z",
          items: [
            {
              id: "item-2",
              date: "2026-04-02",
              qty: 1,
              unit_price: 80,
              picked_up: true,
              menu_item_name: "",
              vendor_name: "",
              options: [],
            },
          ],
        },
      ],
      hasMore: true,
    });
  });
});
