import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { getHomeItems, getTrendingItems } from "@/lib/recommendation";

type QueryResult = { data?: unknown; error?: { message: string } | null };

function makeThenable(result: QueryResult) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "in", "gte", "eq"] as const) {
    builder[method] = vi.fn(() => builder as never);
  }
  (builder as unknown as { then: (resolve: (value: QueryResult) => void) => Promise<void> }).then =
    (resolve) => Promise.resolve(result).then(resolve);
  return builder;
}

function homeRow(patch: Partial<Record<string, unknown>> = {}) {
  return {
    id: "m1",
    name: "牛肉麵",
    description: null,
    price: 120,
    image_url: null,
    tags: null,
    ai_tags: null,
    ai_description: null,
    calories: 650,
    protein: 32,
    sodium: 900,
    vendor_id: "v1",
    vendor_name: "麵店",
    vendor_is_open: true,
    match_score: 0.88,
    top_tag_label: "高蛋白",
    ...patch,
  };
}

describe("getHomeItems", () => {
  beforeEach(() => createClientMock.mockReset());

  it("calls the ranking RPC with area, limit, and context vector", async () => {
    const rpc = vi.fn(async () => ({ data: [homeRow()], error: null }));
    createClientMock.mockResolvedValue({ rpc });

    const result = await getHomeItems("area-1", 12, [0.1, 0.2]);

    expect(rpc).toHaveBeenCalledWith("rank_menu_items_for_home", {
      p_area_id: "area-1",
      p_limit: 12,
      p_context_vec: [0.1, 0.2],
    });
    expect(result[0]).toMatchObject({
      id: "m1",
      tags: [],
      ai_tags: [],
      vendor_name: "麵店",
      top_tag_label: "高蛋白",
    });
  });

  it("returns [] when the RPC errors or has no data", async () => {
    createClientMock.mockResolvedValue({
      rpc: vi.fn(async () => ({ data: null, error: { message: "rpc fail" } })),
    });

    await expect(getHomeItems()).resolves.toEqual([]);
  });
});

describe("getTrendingItems", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T12:00:00.000Z"));
  });

  it("ranks menu items by recent confirmed quantity and filters add-ons", async () => {
    const orderItemsBuilder = makeThenable({
      data: [
        { menu_item_id: "m2", qty: 2 },
        { menu_item_id: "m1", qty: 1 },
        { menu_item_id: "m2", qty: 3 },
        { menu_item_id: "addon", qty: 10 },
      ],
    });
    const menuItemsBuilder = makeThenable({
      data: [
        { ...homeRow({ id: "m1", name: "飯", ai_tags: ["rice"] }), vendors: { name: "便當店", is_open: true } },
        { ...homeRow({ id: "m2", name: "麵", ai_tags: ["noodle"] }), vendors: { name: "麵店", is_open: false } },
        { ...homeRow({ id: "addon", name: "加蛋", ai_tags: ["addon"] }), vendors: { name: "麵店", is_open: true } },
      ],
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(orderItemsBuilder)
      .mockReturnValueOnce(menuItemsBuilder);
    createClientMock.mockResolvedValue({ from });

    const result = await getTrendingItems(3, "area-1");

    expect(result.map((item) => item.id)).toEqual(["m2", "m1"]);
    expect(result[0]).toMatchObject({ vendor_name: "麵店", vendor_is_open: false });
    expect(orderItemsBuilder.gte).toHaveBeenCalledWith(
      "orders.created_at",
      "2026-05-20T12:00:00.000Z",
    );
    expect(menuItemsBuilder.eq).toHaveBeenCalledWith("vendors.vendor_areas.area_id", "area-1");
  });

  it("returns [] without querying menu items when there are no recent orders", async () => {
    const from = vi.fn().mockReturnValueOnce(makeThenable({ data: [] }));
    createClientMock.mockResolvedValue({ from });

    await expect(getTrendingItems()).resolves.toEqual([]);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
