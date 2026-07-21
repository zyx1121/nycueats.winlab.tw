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

import { addToOrder } from "@/app/menu/[id]/actions";

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
  const insertCaptures: Record<string, unknown[]> = {};

  function makeBuilder(result: QueryResult, table: string) {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {};
    const passthrough = ["select", "eq", "in", "order", "limit"] as const;
    for (const m of passthrough) builder[m] = vi.fn(() => builder as never);
    builder.insert = vi.fn((payload: unknown) => {
      (insertCaptures[table] ??= []).push(payload);
      return builder as never;
    });
    builder.update = vi.fn(() => builder as never);
    builder.delete = vi.fn(() => builder as never);
    builder.single = vi.fn(async () => result);
    builder.maybeSingle = vi.fn(async () => result);
    // Thenable so `await query.in(...)` resolves to result.
    (builder as unknown as { then: (resolve: (v: QueryResult) => void) => Promise<void> }).then = (
      resolve
    ) => Promise.resolve(result).then(resolve);
    return builder;
  }

  return {
    insertCaptures,
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

describe("addToOrder", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects when the user is not logged in", async () => {
    const { client } = createSupabaseMock({ user: null, expectations: [] });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 1, []);
    expect(result).toEqual({ error: "請先登入" });
  });

  it("rejects qty out of bounds without touching the DB", async () => {
    const { client } = createSupabaseMock({ user: { id: "u1" }, expectations: [] });
    createClientMock.mockResolvedValue(client);

    const negative = await addToOrder("v1", "m1", "s1", "2026-05-27", 0, []);
    expect(negative).toEqual({ error: "數量錯誤" });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("rejects when the daily_slot does not belong to the menu_item (anti-tampering)", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        {
          table: "daily_slots",
          result: { data: { id: "s1", menu_item_id: "OTHER", date: "2026-05-27" } },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 1, []);
    expect(result).toEqual({ error: "時段與餐點不符" });
  });

  it("rejects when the daily slot is missing", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        {
          table: "daily_slots",
          result: { data: null },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 1, []);
    expect(result).toEqual({ error: "找不到此時段" });
  });

  it("rejects when the menu_item does not belong to the vendor (anti-tampering)", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        {
          table: "daily_slots",
          result: { data: { id: "s1", menu_item_id: "m1", date: "2026-05-27" } },
        },
        {
          table: "menu_items",
          result: {
            data: { id: "m1", price: 100, is_available: true, vendor_id: "OTHER_VENDOR" },
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 1, []);
    expect(result).toEqual({ error: "餐點與商家不符" });
  });

  it("rejects when the menu item is unavailable", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        {
          table: "daily_slots",
          result: { data: { id: "s1", menu_item_id: "m1", date: "2026-05-27" } },
        },
        {
          table: "menu_items",
          result: {
            data: { id: "m1", price: 100, is_available: false, vendor_id: "v1" },
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 1, []);
    expect(result).toEqual({ error: "餐點目前未供應" });
  });

  it("computes unit_price from server-fetched price + option deltas, ignoring any client-side number", async () => {
    const { client, insertCaptures } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        {
          table: "daily_slots",
          result: { data: { id: "s1", menu_item_id: "m1", date: "2026-05-27" } },
        },
        {
          table: "menu_items",
          result: {
            data: { id: "m1", price: 100, is_available: true, vendor_id: "v1" },
          },
        },
        {
          table: "item_options",
          result: {
            data: [
              {
                id: "o1",
                name: "加蛋",
                price_delta: 15,
                item_option_groups: { menu_item_id: "m1" },
              },
            ],
          },
        },
        // No pending order yet
        { table: "orders", result: { data: null } },
        // Insert new order
        { table: "orders", result: { data: { id: "ord1" } } },
        // Insert order_item
        { table: "order_items", result: { data: { id: "oi1" }, error: null } },
        // Insert order_item_options (fire-and-forget but mock still consumed)
        { table: "order_item_options", result: { data: null } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 2, ["o1"]);
    expect(result).toEqual({ success: true });

    // Server computed unit_price = 100 + 15 = 115
    expect(insertCaptures.order_items?.[0]).toMatchObject({
      menu_item_id: "m1",
      daily_slot_id: "s1",
      qty: 2,
      unit_price: 115,
    });
  });

  it("rejects when an option does not belong to the chosen menu_item", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        {
          table: "daily_slots",
          result: { data: { id: "s1", menu_item_id: "m1", date: "2026-05-27" } },
        },
        {
          table: "menu_items",
          result: {
            data: { id: "m1", price: 100, is_available: true, vendor_id: "v1" },
          },
        },
        {
          table: "item_options",
          result: {
            data: [
              {
                id: "o1",
                name: "加蛋",
                price_delta: 15,
                item_option_groups: { menu_item_id: "DIFFERENT_MENU" },
              },
            ],
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 1, ["o1"]);
    expect(result).toEqual({ error: "選項不屬於此餐點" });
  });

  it("rejects when not all selected options can be loaded", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        {
          table: "daily_slots",
          result: { data: { id: "s1", menu_item_id: "m1", date: "2026-05-27" } },
        },
        {
          table: "menu_items",
          result: {
            data: { id: "m1", price: 100, is_available: true, vendor_id: "v1" },
          },
        },
        {
          table: "item_options",
          result: { data: [] },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 1, ["o1"]);
    expect(result).toEqual({ error: "選項無效" });
  });

  it("returns an error when creating a pending order fails", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        {
          table: "daily_slots",
          result: { data: { id: "s1", menu_item_id: "m1", date: "2026-05-27" } },
        },
        {
          table: "menu_items",
          result: {
            data: { id: "m1", price: 100, is_available: true, vendor_id: "v1" },
          },
        },
        { table: "orders", result: { data: null } },
        { table: "orders", result: { data: null, error: { message: "insert failed" } } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 1, []);
    expect(result).toEqual({ error: "建立訂單失敗" });
  });

  it("returns a retryable error when inserting the order item fails", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        {
          table: "daily_slots",
          result: { data: { id: "s1", menu_item_id: "m1", date: "2026-05-27" } },
        },
        {
          table: "menu_items",
          result: {
            data: { id: "m1", price: 100, is_available: true, vendor_id: "v1" },
          },
        },
        { table: "orders", result: { data: { id: "ord1" } } },
        {
          table: "order_items",
          result: { data: null, error: { code: "XX000", message: "insert failed" } },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 1, []);
    expect(result).toEqual({ error: "加入失敗，請稍後再試" });
  });

  it("translates Postgres CHECK violation (23514) to 此日期已售完", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        {
          table: "daily_slots",
          result: { data: { id: "s1", menu_item_id: "m1", date: "2026-05-27" } },
        },
        {
          table: "menu_items",
          result: {
            data: { id: "m1", price: 100, is_available: true, vendor_id: "v1" },
          },
        },
        { table: "orders", result: { data: { id: "ord1" } } }, // existing pending order
        {
          table: "order_items",
          result: { data: null, error: { code: "23514" } },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await addToOrder("v1", "m1", "s1", "2026-05-27", 1, []);
    expect(result).toEqual({ error: "此日期已售完" });
  });
});
