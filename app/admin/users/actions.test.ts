import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { grantVendorRole, revokeVendorRole } from "@/app/admin/users/actions";
import { createSupabaseMock, roleProfile } from "@/test/supabase-mock";

describe("admin user role actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("requires the admin role", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [roleProfile("user")],
    });
    createClientMock.mockResolvedValue(client);
    await expect(grantVendorRole("target")).rejects.toThrow("權限不足");
  });

  it("grants the vendor role to a plain user", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        { table: "profiles", result: { data: { role: ["user"] } } },
        { table: "profiles", result: { error: null } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(grantVendorRole("target")).resolves.toEqual({ success: true });
    expect(mutations).toEqual([
      { table: "profiles", op: "update", payload: { role: ["user", "vendor"] } },
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
  });

  it("is idempotent when the user is already a vendor", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        { table: "profiles", result: { data: { role: ["user", "vendor"] } } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(grantVendorRole("target")).resolves.toEqual({ success: true });
    expect(mutations).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("reports a missing target user on grant", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        { table: "profiles", result: { data: null } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(grantVendorRole("ghost")).resolves.toEqual({ error: "找不到使用者" });
  });

  it("revokes the vendor role while keeping other roles", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        { table: "profiles", result: { data: { role: ["user", "vendor"] } } },
        { table: "profiles", result: { error: null } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(revokeVendorRole("target")).resolves.toEqual({ success: true });
    expect(mutations).toEqual([
      { table: "profiles", op: "update", payload: { role: ["user"] } },
    ]);
  });

  it("reports a missing target user on revoke", async () => {
    const { client } = createSupabaseMock({
      user: { id: "admin1" },
      expectations: [
        roleProfile("admin"),
        { table: "profiles", result: { data: null } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(revokeVendorRole("ghost")).resolves.toEqual({ error: "找不到使用者" });
  });
});
