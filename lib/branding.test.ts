import { describe, expect, it } from "vitest";

import { ACTIVE_FACTORY_AREAS, APP_BRAND, DEFAULT_FACTORY_AREA_NAME } from "@/lib/branding";

describe("branding", () => {
  it("uses the TSMC Eats product name", () => {
    expect(APP_BRAND.name).toBe("TSMC Eats");
  });

  it("defines the active factory areas", () => {
    expect(ACTIVE_FACTORY_AREAS.map((area) => area.name)).toEqual([
      "新竹廠",
      "台中廠",
      "嘉義廠",
      "台南廠",
      "高雄廠",
    ]);
  });

  it("defaults users to the Hsinchu factory", () => {
    expect(DEFAULT_FACTORY_AREA_NAME).toBe("新竹廠");
  });
});
