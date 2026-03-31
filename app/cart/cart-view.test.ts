import { describe, expect, it } from "vitest";

import { buildCartViewModel } from "@/app/cart/cart-view";

describe("buildCartViewModel", () => {
  it("groups items by date, sorts dates, and computes totals", () => {
    const result = buildCartViewModel([
      {
        id: "item-2",
        date: "2026-04-02",
        qty: 1,
        unit_price: 80,
      },
      {
        id: "item-1",
        date: "2026-04-01",
        qty: 2,
        unit_price: 100,
      },
      {
        id: "item-3",
        date: "2026-04-01",
        qty: 3,
        unit_price: 50,
      },
    ]);

    expect(result.dates).toEqual(["2026-04-01", "2026-04-02"]);
    expect(result.byDate["2026-04-01"].map((item) => item.id)).toEqual([
      "item-1",
      "item-3",
    ]);
    expect(result.itemCount).toBe(3);
    expect(result.total).toBe(430);
  });

  it("returns empty structures for an empty cart", () => {
    expect(buildCartViewModel([])).toEqual({
      byDate: {},
      dates: [],
      itemCount: 0,
      total: 0,
    });
  });
});
