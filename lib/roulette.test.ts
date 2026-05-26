import { describe, expect, it } from "vitest";

import { pickRandomItem } from "@/lib/roulette";

describe("pickRandomItem", () => {
  it("returns null for an empty pool", () => {
    expect(pickRandomItem([])).toBeNull();
  });

  it("returns the only item for a single-element pool", () => {
    expect(pickRandomItem(["a"], () => 0.99)).toBe("a");
  });

  it("maps rand() across the index range", () => {
    const items = ["a", "b", "c", "d"];
    expect(pickRandomItem(items, () => 0)).toBe("a");
    expect(pickRandomItem(items, () => 0.5)).toBe("c");
    expect(pickRandomItem(items, () => 0.999)).toBe("d");
  });

  it("never overflows when rand() returns 1", () => {
    const items = ["a", "b", "c"];
    expect(pickRandomItem(items, () => 1)).toBe("c");
  });
});
