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

  it("rejects vendors without a store record", async () => {
    const { client } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        { table: "profiles", result: { data: { role: ["vendor"] } } },
        { table: "vendors", result: { data: null } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const res = await GET(request("https://example.test/api/pickup?item=oi1"));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe("找不到商家帳號");
  });

  it("rejects order items that are not confirmed", async () => {
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
              menu_items: { vendor_id: "v1" },
              orders: { status: "pending" },
            },
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const res = await GET(request("https://example.test/api/pickup?item=oi1"));

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("此訂單狀態不允許領餐");
  });

  it("redirects already-picked-up items without mutating", async () => {
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
              picked_up: true,
              order_id: "o1",
              menu_items: { vendor_id: "v1" },
              orders: { status: "confirmed" },
            },
          },
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const res = await GET(request("https://example.test/api/pickup?item=oi1"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/vendor/orders?msg=already-picked-up");
    expect(mutations).toEqual([]);
  });

  it("returns a server error when marking the item picked up fails", async () => {
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
              menu_items: { vendor_id: "v1" },
              orders: { status: "confirmed" },
            },
          },
        },
        { table: "order_items", result: { data: null, error: { message: "update failed" } } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const res = await GET(request("https://example.test/api/pickup?item=oi1"));

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("核銷失敗，請稍後再試");
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

  it("keeps the order open when other items remain unpicked", async () => {
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
        { table: "order_items", result: { data: [{ id: "oi2" }] } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const res = await GET(request("https://example.test/api/pickup?item=oi1"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/vendor/orders?msg=picked-up");
    expect(mutations).toEqual([
      { table: "order_items", op: "update", payload: { picked_up: true } },
    ]);
  });

  it("still redirects when completing the order fails after pickup", async () => {
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
        { table: "orders", result: { data: null, error: { message: "complete failed" } } },
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
