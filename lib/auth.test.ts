import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { requireRole } from "@/lib/auth";

function mockSupabase({ user, role }: { user: { id: string } | null; role: string[] | null }) {
  const single = vi.fn(async () => ({ data: role === null ? null : { role } }));
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from,
    _spies: { single, eq, select, from },
  };
}

describe("requireRole", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("throws when there is no logged-in user", async () => {
    const supabase = mockSupabase({ user: null, role: null });
    createClientMock.mockResolvedValue(supabase);
    await expect(requireRole("admin")).rejects.toThrow("未登入");
  });

  it("throws when the profile is missing", async () => {
    const supabase = mockSupabase({ user: { id: "u1" }, role: null });
    createClientMock.mockResolvedValue(supabase);
    await expect(requireRole("vendor")).rejects.toThrow("權限不足");
  });

  it("throws when the role array does not include the required role", async () => {
    const supabase = mockSupabase({ user: { id: "u1" }, role: ["user"] });
    createClientMock.mockResolvedValue(supabase);
    await expect(requireRole("admin")).rejects.toThrow("權限不足");
  });

  it("returns the user + supabase when the role is granted", async () => {
    const supabase = mockSupabase({ user: { id: "u1" }, role: ["user", "vendor"] });
    createClientMock.mockResolvedValue(supabase);
    const result = await requireRole("vendor");
    expect(result.user.id).toBe("u1");
    expect(result.supabase).toBe(supabase);
  });

  it("matches one role out of a multi-role array (admin grant)", async () => {
    const supabase = mockSupabase({ user: { id: "u1" }, role: ["vendor", "admin"] });
    createClientMock.mockResolvedValue(supabase);
    await expect(requireRole("admin")).resolves.toMatchObject({ user: { id: "u1" } });
  });
});
