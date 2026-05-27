import { describe, expect, it } from "vitest";

import { ACTIVE_FACTORY_AREAS, APP_BRAND, DEFAULT_FACTORY_AREA_NAME } from "@/lib/branding";

describe("branding", () => {
  it("uses the TSMC Eats product name", () => {
    expect(APP_BRAND.name).toBe("TSMC Eats");
  });

  it("defines the active factory areas", () => {
    expect(ACTIVE_FACTORY_AREAS.map((area) => area.name)).toEqual([
      "Fab 1",
      "Fab 2",
      "Fab 3",
      "Fab 5",
      "Fab 6",
      "Fab 8",
      "Fab 12A",
      "Fab 12B",
      "Fab 20",
      "Fab 14",
      "Fab 18",
      "Fab 15",
      "Fab 22",
      "Fab 25",
    ]);
  });

  it("maps factories to their formal science park areas", () => {
    expect(Object.fromEntries(ACTIVE_FACTORY_AREAS.map((area) => [area.name, area.city]))).toEqual({
      "Fab 1": "新竹科學園區竹科園區工研院中興園區",
      "Fab 2": "新竹科學園區竹科園區",
      "Fab 3": "新竹科學園區竹科園區",
      "Fab 5": "新竹科學園區竹科園區",
      "Fab 6": "南部科學園區台南園區",
      "Fab 8": "新竹科學園區竹科園區",
      "Fab 12A": "新竹科學園區竹科園區",
      "Fab 12B": "新竹科學園區竹科園區",
      "Fab 20": "新竹科學園區竹科園區",
      "Fab 14": "南部科學園區台南園區",
      "Fab 18": "南部科學園區台南園區",
      "Fab 15": "中部科學園區台中園區",
      "Fab 22": "南部科學園區高雄楠梓園區",
      "Fab 25": "中部科學園區台中園區",
    });
  });

  it("defaults users to the Hsinchu factory", () => {
    expect(DEFAULT_FACTORY_AREA_NAME).toBe("Fab 12A");
  });
});
