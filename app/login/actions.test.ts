import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, redirectMock, headersMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  redirectMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));

import { signInWithEmail, signInWithGoogle } from "@/app/login/actions";
import { createSupabaseMock } from "@/test/supabase-mock";

describe("login actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    redirectMock.mockReset();
    headersMock.mockReset();
  });

  it("returns an auth error from email sign in", async () => {
    createClientMock.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn(async () => ({ error: { message: "Invalid login" } })),
      },
    });

    await expect(signInWithEmail("a@example.test", "bad")).resolves.toEqual({
      error: "Invalid login",
    });
  });

  it("redirects email sign in by the user's role", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [{ table: "profiles", result: { data: { role: ["vendor"] } } }],
    });
    (client.auth as typeof client.auth & {
      signInWithPassword: ReturnType<typeof vi.fn>;
    }).signInWithPassword = vi.fn(async () => ({ error: null }));
    createClientMock.mockResolvedValue(client);

    await signInWithEmail("v@example.test", "pw");

    expect(redirectMock).toHaveBeenCalledWith("/vendor");
  });

  it("redirects email sign in to home when Supabase returns no user", async () => {
    const { client } = createSupabaseMock({
      user: null,
      expectations: [],
    });
    (client.auth as typeof client.auth & {
      signInWithPassword: ReturnType<typeof vi.fn>;
    }).signInWithPassword = vi.fn(async () => ({ error: null }));
    createClientMock.mockResolvedValue(client);
    redirectMock.mockImplementationOnce((url: string) => {
      throw new Error(`redirect:${url}`);
    });

    await expect(signInWithEmail("u@example.test", "pw")).rejects.toThrow("redirect:/");

    expect(redirectMock).toHaveBeenCalledWith("/");
  });

  it("redirects Google OAuth failures back to login", async () => {
    const signInWithOAuth = vi.fn(async () => ({
      data: { url: null },
      error: { message: "oauth failed" },
    }));
    createClientMock.mockResolvedValue({ auth: { signInWithOAuth } });
    headersMock.mockResolvedValue({ get: vi.fn(() => null) });

    await signInWithGoogle();

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "/auth/callback" },
    });
    expect(redirectMock).toHaveBeenCalledWith("/login?error=auth");
  });

  it("starts Google OAuth with the callback URL from request origin", async () => {
    const signInWithOAuth = vi.fn(async () => ({
      data: { url: "https://accounts.google.test/oauth" },
      error: null,
    }));
    createClientMock.mockResolvedValue({ auth: { signInWithOAuth } });
    headersMock.mockResolvedValue({ get: vi.fn(() => "https://nycueats.test") });

    await signInWithGoogle();

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://nycueats.test/auth/callback" },
    });
    expect(redirectMock).toHaveBeenCalledWith("https://accounts.google.test/oauth");
  });
});
