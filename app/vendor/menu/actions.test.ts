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
  backfillMissingAiTags,
  bulkUpsertSlots,
  deleteOption,
  deleteOptionGroup,
  deleteMenuItem,
  regenerateAiMetadata,
  setDailySlot,
  toggleMenuItem,
  upsertMenuItem,
  upsertOption,
  upsertOptionGroup,
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

  describe("upsertMenuItem", () => {
    it("creates a menu item for the current vendor and schedules AI tagging", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          { table: "menu_items", result: { data: { id: "m1" }, error: null } },
        ],
      });
      createClientMock.mockResolvedValue(client);

      await expect(
        upsertMenuItem({ name: "雞腿飯", price: 120, description: "招牌" }),
      ).resolves.toEqual({ success: true, id: "m1" });

      expect(mutations).toEqual([
        {
          table: "menu_items",
          op: "insert",
          payload: { name: "雞腿飯", price: 120, description: "招牌", vendor_id: "v1" },
        },
      ]);
      expect(afterMock).toHaveBeenCalledOnce();
      expect(revalidatePathMock).toHaveBeenCalledWith("/vendor/menu");
    });

    it("updates an existing item scoped to the current vendor", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [...vendorContext("v1"), { table: "menu_items", result: { error: null } }],
      });
      createClientMock.mockResolvedValue(client);

      await expect(upsertMenuItem({ id: "m1", name: "飯", price: 90 })).resolves.toEqual({
        success: true,
      });

      expect(mutations).toEqual([
        {
          table: "menu_items",
          op: "update",
          payload: { id: "m1", name: "飯", price: 90, vendor_id: "v1" },
        },
      ]);
    });
  });

  describe("toggleMenuItem", () => {
    it("updates availability scoped to the current vendor", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [...vendorContext("v1"), { table: "menu_items", result: { error: null } }],
      });
      createClientMock.mockResolvedValue(client);

      await expect(toggleMenuItem("m1", false)).resolves.toBeUndefined();

      expect(mutations).toEqual([
        { table: "menu_items", op: "update", payload: { is_available: false } },
      ]);
      expect(revalidatePathMock).toHaveBeenCalledWith("/vendor/menu");
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

  describe("backfillMissingAiTags", () => {
    it("returns count 0 without invoking the edge function when nothing is missing", async () => {
      const { client } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [...vendorContext("v1"), { table: "menu_items", result: { data: [] } }],
      });
      createClientMock.mockResolvedValue(client);

      await expect(backfillMissingAiTags()).resolves.toEqual({ success: true, count: 0 });
      expect(client.functions.invoke).not.toHaveBeenCalled();
    });

    it("invokes AI tagging for up to 100 missing items", async () => {
      const { client } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          { table: "menu_items", result: { data: [{ id: "m1" }, { id: "m2" }] } },
        ],
        invokeResult: { data: { results: [{ id: "m1", status: "ok" }] }, error: null },
      });
      createClientMock.mockResolvedValue(client);

      await expect(backfillMissingAiTags()).resolves.toEqual({
        results: [{ id: "m1", status: "ok" }],
        count: 2,
      });
      expect(client.functions.invoke).toHaveBeenCalledWith("generate-menu-item-tags", {
        body: { menu_item_ids: ["m1", "m2"], force: false },
      });
    });
  });

  describe("option groups and options", () => {
    it("upserts an option group after checking menu item ownership", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          { table: "menu_items", result: { data: { id: "m1" } } },
          { table: "item_option_groups", result: { error: null } },
        ],
      });
      createClientMock.mockResolvedValue(client);

      await expect(
        upsertOptionGroup({
          menu_item_id: "m1",
          name: "甜度",
          required: true,
          max_select: 1,
          sort_order: 0,
        }),
      ).resolves.toEqual({ success: true });

      expect(mutations[0]).toEqual({
        table: "item_option_groups",
        op: "insert",
        payload: {
          menu_item_id: "m1",
          name: "甜度",
          required: true,
          max_select: 1,
          sort_order: 0,
        },
      });
    });

    it("deletes an option group only after ownership is verified", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          { table: "item_option_groups", result: { data: { menu_item_id: "m1" } } },
          { table: "menu_items", result: { data: { id: "m1" } } },
          { table: "item_option_groups", result: { error: null } },
        ],
      });
      createClientMock.mockResolvedValue(client);

      await expect(deleteOptionGroup("g1")).resolves.toBeUndefined();
      expect(mutations).toEqual([
        { table: "item_option_groups", op: "delete", payload: undefined },
      ]);
    });

    it("upserts an option after resolving its group ownership", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          { table: "item_option_groups", result: { data: { menu_item_id: "m1" } } },
          { table: "menu_items", result: { data: { id: "m1" } } },
          { table: "item_options", result: { error: null } },
        ],
      });
      createClientMock.mockResolvedValue(client);

      await expect(
        upsertOption({ group_id: "g1", name: "加蛋", price_delta: 15, sort_order: 1 }),
      ).resolves.toEqual({ success: true });

      expect(mutations[0]).toEqual({
        table: "item_options",
        op: "insert",
        payload: { group_id: "g1", name: "加蛋", price_delta: 15, sort_order: 1 },
      });
    });

    it("deletes an option after resolving nested group ownership", async () => {
      const { client, mutations } = createSupabaseMock({
        user: { id: "u1" },
        expectations: [
          ...vendorContext("v1"),
          {
            table: "item_options",
            result: { data: { group_id: "g1", item_option_groups: { menu_item_id: "m1" } } },
          },
          { table: "menu_items", result: { data: { id: "m1" } } },
          { table: "item_options", result: { error: null } },
        ],
      });
      createClientMock.mockResolvedValue(client);

      await expect(deleteOption("o1")).resolves.toBeUndefined();
      expect(mutations).toEqual([{ table: "item_options", op: "delete", payload: undefined }]);
    });
  });
});
