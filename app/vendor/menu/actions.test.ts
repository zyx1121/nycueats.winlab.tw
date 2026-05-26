import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, revalidatePathMock, afterMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  afterMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/server", () => ({ after: afterMock }));

import {
  bulkUpsertSlots,
  deleteMenuItem,
  regenerateAiMetadata,
  setDailySlot,
} from "@/app/vendor/menu/actions";
import { createSupabaseMock, roleProfile, type FromExpectation } from "@/test/supabase-mock";

/** requireVendor() = requireRole("vendor") + a vendors row lookup. */
function vendorContext(vendorId: string | null): FromExpectation[] {
  return [
    roleProfile("vendor"),
    { table: "vendors", result: { data: vendorId ? { id: vendorId } : null } },
  ];
}

describe("vendor menu actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
    afterMock.mockReset();
  });

  it("rejects a vendor without a store record", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: vendorContext(null),
    });
    createClientMock.mockResolvedValue(client);
    await expect(setDailySlot("m1", "2026-05-27", 20)).rejects.toThrow("找不到商家");
  });

  describe("setDailySlot", () => {
    it("upserts a slot for an item the vendor owns", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          { table: "menu_items", result: { data: { id: "m1" } } }, // ownership check
          { table: "daily_slots", result: { error: null } },
        ],
      });
      createClientMock.mockResolvedValue(client);

      await expect(setDailySlot("m1", "2026-05-27", 20)).resolves.toEqual({ success: true });
      expect(mutations).toEqual([
        {
          table: "daily_slots",
          op: "upsert",
          payload: { menu_item_id: "m1", date: "2026-05-27", max_qty: 20 },
        },
      ]);
      expect(revalidatePathMock).toHaveBeenCalledWith("/vendor/menu");
    });

    it("blocks setting a slot on an item the vendor does not own", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          { table: "menu_items", result: { data: null } }, // not owned
        ],
      });
      createClientMock.mockResolvedValue(client);

      await expect(setDailySlot("m1", "2026-05-27", 20)).rejects.toThrow("權限不足");
      expect(mutations).toEqual([]); // never reached the upsert
    });

    it("surfaces the database error message", async () => {
      const { client } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          { table: "menu_items", result: { data: { id: "m1" } } },
          { table: "daily_slots", result: { error: { message: "quota exceeded" } } },
        ],
      });
      createClientMock.mockResolvedValue(client);

      await expect(setDailySlot("m1", "2026-05-27", 20)).resolves.toEqual({
        error: "quota exceeded",
      });
    });
  });

  describe("bulkUpsertSlots", () => {
    it("only upserts slots for items the vendor owns", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          { table: "menu_items", result: { data: [{ id: "m1" }, { id: "m2" }] } },
          { table: "daily_slots", result: { error: null } },
        ],
      });
      createClientMock.mockResolvedValue(client);

      const result = await bulkUpsertSlots([
        { menu_item_id: "m1", date: "2026-05-27", max_qty: 10 },
        { menu_item_id: "m2", date: "2026-05-27", max_qty: 20 },
        { menu_item_id: "m3", date: "2026-05-27", max_qty: 30 }, // not owned → dropped
      ]);

      expect(result).toEqual({ success: true, count: 2 });
      expect(mutations[0].payload).toEqual([
        { menu_item_id: "m1", date: "2026-05-27", max_qty: 10 },
        { menu_item_id: "m2", date: "2026-05-27", max_qty: 20 },
      ]);
      // multi-area menu cache also revalidated
      expect(revalidatePathMock).toHaveBeenCalledWith("/menu", "layout");
    });

    it("returns an error when none of the slots belong to the vendor", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [...vendorContext("v1"), { table: "menu_items", result: { data: [] } }],
      });
      createClientMock.mockResolvedValue(client);

      await expect(
        bulkUpsertSlots([{ menu_item_id: "x", date: "2026-05-27", max_qty: 5 }]),
      ).resolves.toEqual({ error: "沒有可建立的名額" });
      expect(mutations).toEqual([]);
    });
  });

  describe("deleteMenuItem", () => {
    it("deletes an item scoped to the vendor", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [...vendorContext("v1"), { table: "menu_items", result: { error: null } }],
      });
      createClientMock.mockResolvedValue(client);

      await expect(deleteMenuItem("m1")).resolves.toEqual({ success: true });
      expect(mutations).toEqual([{ table: "menu_items", op: "delete", payload: undefined }]);
    });
  });

  describe("regenerateAiMetadata", () => {
    it("rejects an empty selection", async () => {
      const { client } = createSupabaseMock({
        user: { id: "u1" },
        expectations: vendorContext("v1"),
      });
      createClientMock.mockResolvedValue(client);
      await expect(regenerateAiMetadata([])).resolves.toEqual({ error: "請選擇至少一道餐點" });
    });

    it("rejects when none of the selected items are owned", async () => {
      const { client } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [...vendorContext("v1"), { table: "menu_items", result: { data: [] } }],
      });
      createClientMock.mockResolvedValue(client);
      await expect(regenerateAiMetadata(["m1"])).resolves.toEqual({ error: "權限不足" });
    });

    it("invokes the edge function for owned items", async () => {
      const { client } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          { table: "menu_items", result: { data: [{ id: "m1" }] } },
        ],
        invokeResult: { data: { results: [{ id: "m1", status: "ok" }] }, error: null },
      });
      createClientMock.mockResolvedValue(client);

      await expect(regenerateAiMetadata(["m1"])).resolves.toEqual({
        results: [{ id: "m1", status: "ok" }],
      });
      expect(client.functions.invoke).toHaveBeenCalledWith("generate-menu-item-tags", {
        body: { menu_item_ids: ["m1"], force: true },
      });
    });
  });
});
