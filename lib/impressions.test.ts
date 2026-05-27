import { describe, expect, it, vi } from "vitest";

import { recordImpressions } from "@/lib/impressions";

function makeClient() {
  const upsert = vi.fn(async () => ({ error: null }));
  return {
    client: {
      from: vi.fn(() => ({ upsert })),
    },
    upsert,
  };
}

describe("recordImpressions", () => {
  it("does not touch Supabase when there are no items", async () => {
    const { client } = makeClient();

    await recordImpressions(client as never, "u1", []);

    expect(client.from).not.toHaveBeenCalled();
  });

  it("deduplicates item impressions for the current date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T12:00:00Z"));
    const { client, upsert } = makeClient();

    await recordImpressions(client as never, "u1", ["m1", "m2", "m1"]);

    expect(upsert).toHaveBeenCalledWith(
      [
        { user_id: "u1", menu_item_id: "m1", date: "2026-05-27" },
        { user_id: "u1", menu_item_id: "m2", date: "2026-05-27" },
      ],
      { onConflict: "user_id,menu_item_id,date", ignoreDuplicates: true },
    );
  });
});
