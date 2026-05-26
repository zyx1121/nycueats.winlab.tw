import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  approveVendor,
  reactivateVendor,
  rejectVendor,
  suspendVendor,
  updateVendorAreas,
} from "@/app/admin/vendors/actions";
import { createSupabaseMock, roleProfile } from "@/test/supabase-mock";

describe("admin vendor actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects callers who are not logged in", async () => {
    const { client } = createSupabaseMock({ user: null, expectations: [] });
    createClientMock.mockResolvedValue(client);
    await expect(approveVendor("v1", [])).rejects.toThrow("未登入");
  });

  it("rejects callers without the admin role", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [roleProfile("user", "vendor")],
    });
    createClientMock.mockResolvedValue(client);
    await expect(approveVendor("v1", [])).rejects.toThrow("權限不足");
  });

  it("approves a vendor and assigns the given areas", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        { table: "vendors", result: { error: null } },
        { table: "vendor_areas", result: {} },
        { table: "vendor_areas", result: {} },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(approveVendor("v1", ["a1", "a2"])).resolves.toEqual({ success: true });
    expect(mutations).toEqual([
      { table: "vendors", op: "update", payload: { status: "approved", is_active: true } },
      { table: "vendor_areas", op: "delete", payload: undefined },
      {
        table: "vendor_areas",
        op: "insert",
        payload: [
          { vendor_id: "v1", area_id: "a1" },
          { vendor_id: "v1", area_id: "a2" },
        ],
      },
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/vendors");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/vendors/v1");
  });

  it("approves a vendor with no areas without inserting", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        { table: "vendors", result: { error: null } },
        { table: "vendor_areas", result: {} },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(approveVendor("v1", [])).resolves.toEqual({ success: true });
    expect(mutations.some((m) => m.op === "insert")).toBe(false);
  });

  it("surfaces an error and skips area writes when the update fails", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        { table: "vendors", result: { error: { message: "db down" } } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(approveVendor("v1", ["a1"])).resolves.toEqual({ error: "核准失敗" });
    expect(mutations).toEqual([
      { table: "vendors", op: "update", payload: { status: "approved", is_active: true } },
    ]);
  });

  it("rejects a vendor", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [roleProfile("admin"), { table: "vendors", result: { error: null } }],
    });
    createClientMock.mockResolvedValue(client);

    await expect(rejectVendor("v1")).resolves.toEqual({ success: true });
    expect(mutations).toEqual([
      { table: "vendors", op: "update", payload: { status: "rejected", is_active: false } },
    ]);
  });

  it("suspends an active vendor", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [roleProfile("admin"), { table: "vendors", result: { error: null } }],
    });
    createClientMock.mockResolvedValue(client);

    await expect(suspendVendor("v1")).resolves.toEqual({ success: true });
    expect(mutations[0].payload).toEqual({ status: "suspended", is_active: false });
  });

  it("reactivates a suspended vendor", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [roleProfile("admin"), { table: "vendors", result: { error: null } }],
    });
    createClientMock.mockResolvedValue(client);

    await expect(reactivateVendor("v1")).resolves.toEqual({ success: true });
    expect(mutations[0].payload).toEqual({ status: "approved", is_active: true });
  });

  it("replaces a vendor's areas atomically (delete then insert)", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        { table: "vendor_areas", result: {} },
        { table: "vendor_areas", result: {} },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(updateVendorAreas("v1", ["a3"])).resolves.toEqual({ success: true });
    expect(mutations).toEqual([
      { table: "vendor_areas", op: "delete", payload: undefined },
      { table: "vendor_areas", op: "insert", payload: [{ vendor_id: "v1", area_id: "a3" }] },
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/vendors/v1");
  });
});
