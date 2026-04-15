import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { cancelOrder, confirmOrder, removeOrderItem } from "@/app/cart/actions";

type QueryStep = {
  eqResults?: Array<unknown>;
  singleResult?: unknown;
  limitResult?: unknown;
};

function createQuery(step: QueryStep = {}) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  let eqCallIndex = 0;

  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => {
    const value = step.eqResults?.[eqCallIndex];
    eqCallIndex += 1;
    return value === undefined ? query : value;
  });
  query.single = vi.fn(async () => step.singleResult);
  query.limit = vi.fn(async () => step.limitResult);
  query.update = vi.fn(() => query);
  query.delete = vi.fn(() => query);

  return query;
}

function createSupabaseMock({
  user,
  queries,
}: {
  user: { id: string } | null;
  queries: Record<string, QueryStep[]>;
}) {
  const queryInstances = new Map<string, ReturnType<typeof createQuery>[]>();

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

      const query = createQuery(steps.shift());
      const list = queryInstances.get(table) ?? [];
      list.push(query);
      queryInstances.set(table, list);
      return query;
    }),
    queryInstances,
  };
}

describe("cart server actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects checkout when the user is not logged in", async () => {
    const supabase = createSupabaseMock({
      user: null,
      queries: {},
    });
    createClientMock.mockResolvedValue(supabase);

    await expect(confirmOrder("order-1")).resolves.toEqual({ error: "未登入" });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("confirms a pending order with at least one item", async () => {
    const supabase = createSupabaseMock({
      user: { id: "user-1" },
      queries: {
        orders: [
          { singleResult: { data: { id: "order-1", status: "pending" } } },
          { eqResults: [{ error: null }] },
        ],
        order_items: [{ limitResult: { data: [{ id: "item-1" }] } }],
      },
    });
    createClientMock.mockResolvedValue(supabase);

    await expect(confirmOrder("order-1")).resolves.toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/cart");
    expect(revalidatePathMock).toHaveBeenCalledWith("/orders");
  });

  it("refuses to confirm an empty pending order", async () => {
    const supabase = createSupabaseMock({
      user: { id: "user-1" },
      queries: {
        orders: [{ singleResult: { data: { id: "order-1", status: "pending" } } }],
        order_items: [{ limitResult: { data: [] } }],
      },
    });
    createClientMock.mockResolvedValue(supabase);

    await expect(confirmOrder("order-1")).resolves.toEqual({
      error: "預約單沒有品項",
    });
  });

  it("cancels a pending order and clears its items", async () => {
    const supabase = createSupabaseMock({
      user: { id: "user-1" },
      queries: {
        orders: [
          { singleResult: { data: { id: "order-1", status: "pending" } } },
          { eqResults: [{ error: null }] },
        ],
        order_items: [{ eqResults: [{ error: null }] }],
      },
    });
    createClientMock.mockResolvedValue(supabase);

    await expect(cancelOrder("order-1")).resolves.toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/cart");
    expect(revalidatePathMock).toHaveBeenCalledWith("/orders");
  });

  it("removes an order item owned by the current user", async () => {
    const supabase = createSupabaseMock({
      user: { id: "user-1" },
      queries: {
        order_items: [
          {
            singleResult: {
              data: { id: "item-1", orders: { user_id: "user-1" } },
            },
          },
          { eqResults: [{ error: null }] },
        ],
      },
    });
    createClientMock.mockResolvedValue(supabase);

    await expect(removeOrderItem("item-1")).resolves.toEqual({ success: true });
    expect(revalidatePathMock).toHaveBeenCalledWith("/cart");
  });

  it("blocks removing an item owned by another user", async () => {
    const supabase = createSupabaseMock({
      user: { id: "user-1" },
      queries: {
        order_items: [
          {
            singleResult: {
              data: { id: "item-1", orders: { user_id: "user-2" } },
            },
          },
        ],
      },
    });
    createClientMock.mockResolvedValue(supabase);

    await expect(removeOrderItem("item-1")).resolves.toEqual({
      error: "權限不足",
    });
  });
});
