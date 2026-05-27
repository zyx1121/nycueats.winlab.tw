import { describe, expect, it, vi } from "vitest";

import { getDailyPick } from "@/lib/daily-pick";

type QueryResult = { data?: unknown };

function makeThenable(result: QueryResult) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq"] as const) builder[method] = vi.fn(() => builder as never);
  builder.maybeSingle = vi.fn(async () => result);
  return builder;
}

function makeClient(results: QueryResult[]) {
  const builders = results.map(makeThenable);
  return {
    client: {
      from: vi.fn(() => {
        const builder = builders.shift();
        if (!builder) throw new Error("Unexpected query");
        return builder;
      }),
    },
  };
}

describe("getDailyPick", () => {
  it("returns null when no daily pick exists", async () => {
    const { client } = makeClient([{ data: null }]);

    await expect(getDailyPick(client as never, "u1")).resolves.toBeNull();
  });

  it("returns null for unavailable items or inactive vendors", async () => {
    const { client } = makeClient([
      { data: { menu_item_id: "m1" } },
      {
        data: {
          id: "m1",
          is_available: true,
          vendors: { name: "店家", is_open: true, is_active: false },
        },
      },
    ]);

    await expect(getDailyPick(client as never, "u1")).resolves.toBeNull();
  });

  it("normalizes an active daily pick into a home item", async () => {
    const { client } = makeClient([
      { data: { menu_item_id: "m1" } },
      {
        data: {
          id: "m1",
          name: "今日餐",
          description: null,
          price: 100,
          image_url: null,
          tags: null,
          ai_tags: null,
          ai_description: null,
          calories: 500,
          protein: 20,
          sodium: 700,
          vendor_id: "v1",
          is_available: true,
          vendors: { name: "店家", is_open: true, is_active: true },
        },
      },
    ]);

    await expect(getDailyPick(client as never, "u1")).resolves.toMatchObject({
      id: "m1",
      tags: [],
      ai_tags: [],
      vendor_name: "店家",
      vendor_is_open: true,
    });
  });
});
