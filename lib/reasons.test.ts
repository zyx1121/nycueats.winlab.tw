import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachReasons, fetchReasonsForItems, triggerReasonGeneration } from "@/lib/reasons";
import type { HomeItem } from "@/lib/recommendation";

function item(id: string): HomeItem {
  return {
    id,
    name: `Item ${id}`,
    description: null,
    price: 100,
    image_url: null,
    tags: [],
    ai_tags: ["light"],
    ai_description: "Good item",
    calories: null,
    protein: null,
    sodium: null,
    vendor_id: "v1",
    vendor_name: "Vendor",
    vendor_is_open: true,
    match_score: 0,
    top_tag_label: null,
  };
}

function makeReasonClient(rows: unknown[] = []) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(async () => ({ data: rows })),
  };
  const invoke = vi.fn(async () => ({ data: {}, error: null }));
  return {
    client: {
      from: vi.fn(() => builder),
      functions: { invoke },
    },
    builder,
    invoke,
  };
}

describe("fetchReasonsForItems", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T12:00:00Z"));
  });

  it("keeps fresh reasons and drops stale cached reasons", async () => {
    const { client } = makeReasonClient([
      { menu_item_id: "fresh", reason: "適合今天", generated_at: "2026-05-27T00:30:00Z" },
      { menu_item_id: "stale", reason: "太舊", generated_at: "2026-05-25T00:00:00Z" },
    ]);

    const result = await fetchReasonsForItems(client as never, "u1", ["fresh", "stale"]);

    expect([...result.entries()]).toEqual([["fresh", "適合今天"]]);
  });

  it("does not query Supabase for an empty item list", async () => {
    const { client } = makeReasonClient();

    await expect(fetchReasonsForItems(client as never, "u1", [])).resolves.toEqual(new Map());
    expect(client.from).not.toHaveBeenCalled();
  });
});

describe("attachReasons", () => {
  it("attaches nullable reasons without changing item order", () => {
    expect(
      attachReasons([item("a"), item("b")], new Map([["b", "推薦理由"]])).map((it) => [
        it.id,
        it.reason,
      ]),
    ).toEqual([
      ["a", null],
      ["b", "推薦理由"],
    ]);
  });
});

describe("triggerReasonGeneration", () => {
  it("sends at most 20 compact items to the edge function", async () => {
    const { client, invoke } = makeReasonClient();
    const items = Array.from({ length: 22 }, (_, index) => item(String(index)));

    await triggerReasonGeneration(client as never, items);

    expect(invoke).toHaveBeenCalledWith("generate-reasons", {
      body: {
        items: expect.arrayContaining([
          { id: "0", name: "Item 0", ai_description: "Good item", ai_tags: ["light"] },
        ]),
      },
    });
    const [, options] = invoke.mock.calls[0] as unknown as [
      string,
      { body: { items: Array<unknown> } },
    ];
    expect(options.body.items).toHaveLength(20);
  });
});
