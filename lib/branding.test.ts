import { describe, expect, it } from "vitest";

import { ACTIVE_FACTORY_AREAS, APP_BRAND, DEFAULT_FACTORY_AREA_NAME } from "@/lib/branding";

describe("branding", () => {
  it("uses the TSMC Eats product name", () => {
    expect(APP_BRAND.name).toBe("TSMC Eats");
  });

  it("defines the active factory areas", () => {
    expect(ACTIVE_FACTORY_AREAS.map((area) => area.name)).toEqual([
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
      "Fab 22 高雄",
      "Fab 25 嘉義/台南沙崙",
    ]);
  });

  it("defaults users to the Hsinchu factory", () => {
    expect(DEFAULT_FACTORY_AREA_NAME).toBe("Fab 12A");
  });
});
