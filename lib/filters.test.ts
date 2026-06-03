// lib/filters.test.ts
import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  filtersToSearchParams,
  parseFiltersFromParams,
  type SearchFilters,
} from "./filters";

describe("parseFiltersFromParams", () => {
  it("returns empty object for empty params", () => {
    expect(parseFiltersFromParams({})).toEqual({});
  });

  it("parses open=true", () => {
    expect(parseFiltersFromParams({ open: "true" })).toMatchObject({ open: true });
  });

  it("ignores open=false (same as not filtering)", () => {
    const f = parseFiltersFromParams({ open: "false" });
    expect(f.open).toBeUndefined();
  });

  it("parses price range", () => {
    const f = parseFiltersFromParams({ price_min: "60", price_max: "280" });
    expect(f).toMatchObject({ priceMin: 60, priceMax: 280 });
  });

  it("parses calorie range", () => {
    const f = parseFiltersFromParams({ cal_min: "100", cal_max: "500" });
    expect(f).toMatchObject({ calMin: 100, calMax: 500 });
  });

  it("parses comma-separated tags", () => {
    const f = parseFiltersFromParams({ tags: "spicy,rice" });
    expect(f.tags).toEqual(["spicy", "rice"]);
  });

  it("parses comma-separated dates", () => {
    const f = parseFiltersFromParams({ dates: "2026-05-26,2026-05-27" });
    expect(f.dates).toEqual(["2026-05-26", "2026-05-27"]);
  });

  it("parses sort", () => {
    expect(parseFiltersFromParams({ sort: "price_asc" })).toMatchObject({ sort: "price_asc" });
  });
});

describe("filtersToSearchParams", () => {
  it("omits undefined fields", () => {
    expect(filtersToSearchParams({})).toEqual({});
  });

  it("omits sort=recommended", () => {
    expect(filtersToSearchParams({ sort: "recommended" })).toEqual({});
  });

  it("round-trips non-default filters", () => {
    const f: SearchFilters = {
      open: true,
      sort: "price_asc",
      priceMin: 60,
      priceMax: 280,
      calMin: 100,
      calMax: 500,
      tags: ["spicy", "rice"],
      dates: ["2026-05-26"],
    };
    const params = filtersToSearchParams(f);
    expect(parseFiltersFromParams(params)).toMatchObject(f);
  });
});

describe("countActiveFilters", () => {
  it("returns 0 for empty filters", () => {
    expect(countActiveFilters({})).toBe(0);
  });

  it("counts each active dimension once", () => {
    expect(countActiveFilters({
      open: true,
      sort: "price_asc",
      dates: ["2026-05-26"],
      priceMin: 60,
      tags: ["spicy"],
    })).toBe(5);
  });

  it("price range counts as 1 even when only min is set", () => {
    expect(countActiveFilters({ priceMin: 50 })).toBe(1);
  });

  it("calorie range counts as 1 even when only max is set", () => {
    expect(countActiveFilters({ calMax: 500 })).toBe(1);
  });

  it("does not count sort=recommended", () => {
    expect(countActiveFilters({ sort: "recommended" })).toBe(0);
  });
});
