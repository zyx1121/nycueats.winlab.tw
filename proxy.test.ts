import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClientMock } = vi.hoisted(() => ({ createServerClientMock: vi.fn() }));

vi.mock("@supabase/ssr", () => ({ createServerClient: createServerClientMock }));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

function makeSupabase(user: { id: string } | null, roles: string[] = []) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({ data: { role: roles } })),
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from: vi.fn(() => builder),
  };
}

describe("proxy", () => {
  beforeEach(() => createServerClientMock.mockReset());

  it("redirects unauthenticated protected requests to login", async () => {
    createServerClientMock.mockReturnValue(makeSupabase(null));

    const res = await proxy(new NextRequest("https://example.test/cart"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.test/login");
  });

  it("allows unauthenticated public auth paths", async () => {
    createServerClientMock.mockReturnValue(makeSupabase(null));

    const res = await proxy(new NextRequest("https://example.test/auth/callback"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects logged-in users away from login by default role home", async () => {
    createServerClientMock.mockReturnValue(makeSupabase({ id: "u1" }, ["admin"]));

    const res = await proxy(new NextRequest("https://example.test/login"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://example.test/admin");
  });

  it("writes Supabase cookie updates to the request and response", async () => {
    vi.resetModules();

    vi.doMock("@supabase/ssr", () => ({
      createServerClient: vi.fn((_url, _key, options) => ({
        auth: {
          getUser: vi.fn(async () => {
            expect(options.cookies.getAll()).toEqual([
              { name: "sb-session", value: "old" },
            ]);
            options.cookies.setAll([
              { name: "sb-session", value: "fresh", options: { path: "/" } },
            ]);
            return { data: { user: null } };
          }),
        },
        from: vi.fn(),
      })),
    }));
    const { proxy: isolatedProxy } = await import("@/proxy");
    const request = new NextRequest("https://example.test/auth/callback", {
      headers: { Cookie: "sb-session=old" },
    });

    const res = await isolatedProxy(request);

    expect(request.cookies.get("sb-session")?.value).toBe("fresh");
    expect(res.cookies.get("sb-session")?.value).toBe("fresh");
  });
});
