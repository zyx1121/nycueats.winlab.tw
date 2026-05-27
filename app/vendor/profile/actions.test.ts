import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, revalidatePathMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import {
  updateVendorImage,
  updateVendorInfo,
  updateVendorSchedule,
} from "@/app/vendor/profile/actions";
import { createSupabaseMock, roleProfile } from "@/test/supabase-mock";

describe("vendor profile actions", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("rejects an empty vendor name before updating", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [roleProfile("vendor")],
    });
    createClientMock.mockResolvedValue(client);
    const formData = new FormData();
    formData.set("name", "  ");
    formData.set("description", "x");
    formData.set("operating_days", "1,2");

    await expect(updateVendorInfo(formData)).resolves.toEqual({ error: "店家名稱不能為空" });
    expect(mutations).toEqual([]);
  });

  it("updates vendor info with parsed schedule fields", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [roleProfile("vendor"), { table: "vendors", result: { error: null } }],
    });
    createClientMock.mockResolvedValue(client);
    const formData = new FormData();
    formData.set("name", "  好吃店  ");
    formData.set("description", "  ");
    formData.set("is_open", "true");
    formData.set("operating_days", "1,3,5");

    await expect(updateVendorInfo(formData)).resolves.toEqual({ success: true });

    expect(mutations[0]).toEqual({
      table: "vendors",
      op: "update",
      payload: {
        name: "好吃店",
        description: null,
        is_open: true,
        operating_days: [1, 3, 5],
      },
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/vendor/profile");
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
  });

  it("updates schedule and image scoped to the vendor owner", async () => {
    const { client, mutations } = createSupabaseMock({
      user: { id: "u1" },
      expectations: [
        roleProfile("vendor"),
        { table: "vendors", result: { error: null } },
        roleProfile("vendor"),
        { table: "vendors", result: { error: null } },
      ],
    });
    createClientMock.mockResolvedValue(client);

    await expect(updateVendorSchedule(false, [2, 4])).resolves.toEqual({ success: true });
    await expect(updateVendorImage("https://cdn.test/a.jpg")).resolves.toEqual({ success: true });

    expect(mutations).toEqual([
      {
        table: "vendors",
        op: "update",
        payload: { is_open: false, operating_days: [2, 4] },
      },
      { table: "vendors", op: "update", payload: { image_url: "https://cdn.test/a.jpg" } },
    ]);
  });
});
