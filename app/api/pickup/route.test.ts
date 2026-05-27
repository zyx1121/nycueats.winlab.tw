import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, redirectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  redirectMock: vi.fn((url: string) => new Response(null, { status: 307, headers: { location: url } })),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import { GET } from "@/app/api/pickup/route";
import { createSupabaseMock } from "@/test/supabase-mock";

function request(url: string) {
  return { nextUrl: new URL(url) } as never;
}

describe("pickup route", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    redirectMock.mockClear();
  });

  it("rejects requests without an item id", async () => {
    const res = await GET(request("https://example.test/api/pickup"));

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Missing item ID");
  });

  it("redirects unauthenticated users to login", async () => {
    const { client } = createSupabaseMock({ user: null, expectations: [] });
    createClientMock.mockResolvedValue(client);

    const res = await GET(request("https://example.test/api/pickup?item=oi1"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("rejects non-vendor users", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [{ table: "profiles", result: { data: { role: ["user"] } } }],
    });
    createClientMock.mockResolvedValue(client);

    const res = await GET(request("https://example.test/api/pickup?item=oi1"));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe("需要商家權限");
  });

  it("rejects order items from another vendor", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        { table: "profiles", result: { data: { role: ["vendor"] } } },
        { table: "vendors", result: { data: { id: "v1" } } },
        {
          table: "order_items",
          result: {
            data: {
              id: "oi1",
              picked_up: false,
              order_id: "o1",
              menu_items: { vendor_id: "other" },
              orders: { status: "confirmed" },
            },
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const res = await GET(request("https://example.test/api/pickup?item=oi1"));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe("此品項不屬於您的商店");
  });

  it("marks the item picked up and completes the order when no items remain", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        { table: "profiles", result: { data: { role: ["vendor"] } } },
        { table: "vendors", result: { data: { id: "v1" } } },
        {
          table: "order_items",
          result: {
            data: {
              id: "oi1",
              picked_up: false,
              order_id: "o1",
              menu_items: { vendor_id: "v1" },
              orders: { status: "confirmed" },
            },
          },
        },
        { table: "order_items", result: { data: null, error: null } },
        { table: "order_items", result: { data: [] } },
        { table: "orders", result: { data: null, error: null } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const res = await GET(request("https://example.test/api/pickup?item=oi1"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/vendor/orders?msg=picked-up");
    expect(mutations).toEqual([
      { table: "order_items", op: "update", payload: { picked_up: true } },
      { table: "orders", op: "update", payload: { status: "completed" } },
    ]);
  });
});
