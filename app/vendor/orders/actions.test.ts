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

import { pickUpOrderItem } from "@/app/vendor/orders/actions";

type QueryResult = { data?: unknown; error?: unknown };
type FromExpectation = { table: string; result: QueryResult };

function createSupabaseMock({
  user,
  expectations,
}: {
  user: { id: string } | null;
  expectations: FromExpectation[];
}) {
  const queue = [...expectations];
  const updateCaptures: Array<{ table: string; payload: unknown }> = [];

  function makeBuilder(result: QueryResult, table: string) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    const passthrough = ["select", "eq", "in", "order", "limit"] as const;
    for (const m of passthrough) builder[m] = vi.fn(() => builder as never);
    builder.update = vi.fn((payload: unknown) => {
      updateCaptures.push({ table, payload });
      return builder as never;
    });
    builder.insert = vi.fn(() => builder as never);
    builder.delete = vi.fn(() => builder as never);
    builder.single = vi.fn(async () => result);
    builder.maybeSingle = vi.fn(async () => result);
    (builder as unknown as { then: (resolve: (v: QueryResult) => void) => Promise<void> }).then = (
      resolve
    ) => Promise.resolve(result).then(resolve);
    return builder;
  }

  return {
    updateCaptures,
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user } })) },
      from: vi.fn((table: string) => {
        const exp = queue.shift();
        if (!exp) throw new Error(`Unexpected from(${table}) — queue empty`);
        if (exp.table !== table) {
          throw new Error(`Expected from(${exp.table}), got from(${table})`);
        }
        return makeBuilder(exp.result, table);
      }),
    },
  };
}

describe("pickUpOrderItem", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects when the user is not logged in", async () => {
    const { client } = createSupabaseMock({ user: null, expectations: [] });
    createClientMock.mockResolvedValue(client);
    const result = await pickUpOrderItem("oi1");
    expect(result).toEqual({ error: "請先登入" });
  });

  it("rejects when the user has no vendor record", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [{ table: "vendors", result: { data: null } }],
    });
    createClientMock.mockResolvedValue(client);
    const result = await pickUpOrderItem("oi1");
    expect(result).toEqual({ error: "找不到商家帳號" });
  });

  it("rejects when the item belongs to a different vendor (boundary)", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        { table: "vendors", result: { data: { id: "v1" } } },
        {
          table: "order_items",
          result: {
            data: {
              id: "oi1",
              order_id: "ord1",
              menu_items: { vendor_id: "OTHER_VENDOR" },
            },
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);
    const result = await pickUpOrderItem("oi1");
    expect(result).toEqual({ error: "此品項不屬於您" });
  });

  it("marks the order completed when the last item is picked up", async () => {
    const { client, updateCaptures } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        { table: "vendors", result: { data: { id: "v1" } } },
        {
          table: "order_items",
          result: {
            data: {
              id: "oi1",
              order_id: "ord1",
              menu_items: { vendor_id: "v1" },
            },
          },
        },
        { table: "order_items", result: { data: null, error: null } }, // update picked_up=true
        { table: "order_items", result: { data: [] } }, // remaining unpicked = empty
        { table: "orders", result: { data: null, error: null } }, // update status=completed
      ],
    });
    createClientMock.mockResolvedValue(client);
    const result = await pickUpOrderItem("oi1");
    expect(result).toEqual({ success: true, order_id: "ord1" });
    expect(updateCaptures).toEqual([
      { table: "order_items", payload: { picked_up: true } },
      { table: "orders", payload: { status: "completed" } },
    ]);
  });

  it("does NOT mark the order completed when other items remain unpicked", async () => {
    const { client, updateCaptures } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        { table: "vendors", result: { data: { id: "v1" } } },
        {
          table: "order_items",
          result: {
            data: { id: "oi1", order_id: "ord1", menu_items: { vendor_id: "v1" } },
          },
        },
        { table: "order_items", result: { data: null, error: null } }, // update
        { table: "order_items", result: { data: [{ id: "oi2" }] } }, // remaining
      ],
    });
    createClientMock.mockResolvedValue(client);
    const result = await pickUpOrderItem("oi1");
    expect(result).toEqual({ success: true, order_id: "ord1" });
    expect(updateCaptures).toEqual([
      { table: "order_items", payload: { picked_up: true } },
    ]);
  });
});
