import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, revalidatePathMock, redirectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { signOut, updateProfile } from "@/app/profile/actions";
import { createSupabaseMock } from "@/test/supabase-mock";

describe("profile actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
    redirectMock.mockReset();
  });

  it("signs out and redirects to login", async () => {
    const signOutMock = vi.fn(async () => ({ error: null }));
    createClientMock.mockResolvedValue({ auth: { signOut: signOutMock } });

    await signOut();

    expect(signOutMock).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("rejects profile updates when the user is not logged in", async () => {
    const { client } = createSupabaseMock({ user: null, expectations: [] });
    createClientMock.mockResolvedValue(client);

    await expect(updateProfile(new FormData())).resolves.toEqual({ error: "未登入" });
  });

  it("trims blank profile fields into nulls and revalidates affected pages", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [{ table: "profiles", result: { error: null } }],
    });
    createClientMock.mockResolvedValue(client);
    const formData = new FormData();
    formData.set("name", "   ");
    formData.set("area_id", "");

    await expect(updateProfile(formData)).resolves.toEqual({ success: true });

    expect(mutations).toEqual([
      { table: "profiles", op: "update", payload: { name: null, area_id: null } },
    ]);
    expect(revalidatePathMock).toHaveBeenCalledWith("/profile");
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
  });
});
