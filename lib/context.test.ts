import { beforeEach, describe, expect, it, vi } from "vitest";

import { contextKey, getContextEmbedding, getCurrentContext } from "@/lib/context";

type QueryResult = { data?: unknown; error?: { message: string } | null };

function makeContextClient(opts: {
  cached?: unknown;
  embedding?: number[] | null;
  invokeError?: boolean;
}) {
  const upsert = vi.fn(() => Promise.resolve({ error: null }));
  const maybeSingle = vi.fn(async () => ({ data: opts.cached ? { embedding: opts.cached } : null }));
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle,
    upsert,
  };
  const invoke = vi.fn(async (): Promise<QueryResult> => {
    if (opts.invokeError) return { data: null, error: { message: "edge down" } };
    return { data: opts.embedding ? { embedding: opts.embedding } : null, error: null };
  });

  return {
    client: {
      from: vi.fn(() => builder),
      functions: { invoke },
    },
    builder,
    invoke,
    upsert,
  };
}

describe("getCurrentContext", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("maps weather API data to hour, temperature, and rain bands", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          current: { temperature_2m: 31, precipitation: 0.2, time: "2026-05-27T12:30" },
        }),
      })),
    );

    await expect(getCurrentContext()).resolves.toEqual({
      hourBand: "noon",
      tempBand: "hot",
      rainy: true,
    });
  });

  it("returns null when weather fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));

    await expect(getCurrentContext()).resolves.toBeNull();
  });
});

describe("contextKey", () => {
  it("builds the embedding cache key", () => {
    expect(contextKey({ hourBand: "evening", tempBand: "mild", rainy: false })).toBe(
      "evening_mild_dry",
    );
  });
});

describe("getContextEmbedding", () => {
  it("uses cached string embeddings without invoking the edge function", async () => {
    const { client, invoke } = makeContextClient({ cached: "[0.1,0.2]" });

    await expect(
      getContextEmbedding(client as never, { hourBand: "morning", tempBand: "cold", rainy: true }),
    ).resolves.toEqual([0.1, 0.2]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes embed-query and caches the result on a cache miss", async () => {
    const { client, invoke, upsert } = makeContextClient({ embedding: [0.3, 0.4] });

    await expect(
      getContextEmbedding(client as never, { hourBand: "noon", tempBand: "hot", rainy: false }),
    ).resolves.toEqual([0.3, 0.4]);
    expect(invoke).toHaveBeenCalledWith("embed-query", {
      body: { query: "scorching hot noon, cold drinks ice light meal" },
    });
    expect(upsert).toHaveBeenCalledWith(
      { key: "noon_hot_dry", embedding: [0.3, 0.4] },
      { onConflict: "key" },
    );
  });

  it("returns null when embedding generation fails", async () => {
    const { client } = makeContextClient({ invokeError: true });

    await expect(
      getContextEmbedding(client as never, { hourBand: "night", tempBand: "hot", rainy: true }),
    ).resolves.toBeNull();
  });
});
