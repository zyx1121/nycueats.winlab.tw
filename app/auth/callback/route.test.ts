import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { GET } from "@/app/auth/callback/route";

function makeClient(opts: {
  user?: { id: string; user_metadata?: Record<string, string> } | null;
  error?: { message: string } | null;
}) {
  const update = vi.fn(() => builder);
  const builder = {
    update,
    eq: vi.fn(() => builder),
    is: vi.fn(async () => ({ error: null })),
  };
  return {
    client: {
      auth: {
        exchangeCodeForSession: vi.fn(async () => ({
          data: { user: opts.user ?? null },
          error: opts.error ?? null,
        })),
      },
      from: vi.fn(() => builder),
    },
    update,
  };
}

describe("auth callback route", () => {
  beforeEach(() => createClientMock.mockReset());

  it("exchanges the code, fills a missing profile name, and redirects to a safe next path", async () => {
    const { client, update } = makeClient({
      user: { id: "u1", user_metadata: { full_name: "Grant Yeh" } },
    });
    createClientMock.mockResolvedValue(client);

    const res = await GET(new Request("https://example.test/auth/callback?code=abc&next=/vendor"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.test/vendor");
    expect(update).toHaveBeenCalledWith({ name: "Grant Yeh" });
  });

  it("falls back to / when next is an external-protocol-style URL", async () => {
    const { client } = makeClient({ user: { id: "u1", user_metadata: {} } });
    createClientMock.mockResolvedValue(client);

    const res = await GET(
      new Request("https://example.test/auth/callback?code=abc&next=//evil.test"),
    );

    expect(res.headers.get("location")).toBe("https://example.test/");
  });

  it("redirects to login when code exchange fails", async () => {
    const { client } = makeClient({ error: { message: "bad code" } });
    createClientMock.mockResolvedValue(client);

    const res = await GET(new Request("https://example.test/auth/callback?code=bad"));

    expect(res.headers.get("location")).toBe("https://example.test/login?error=auth");
  });
});
