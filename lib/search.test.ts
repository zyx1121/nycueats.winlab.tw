import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));

import { searchHomeItems } from "@/lib/search";

type Ranking = Array<{ id: string; score: number }>;

function row(id: string, name: string) {
  return {
    id,
    name,
    description: null,
    price: 100,
    image_url: null,
    tags: [],
    ai_tags: [],
    ai_description: null,
    calories: 500,
    protein: 20,
    sodium: 800,
    vendor_id: "v1",
    vendor_name: "店家",
    vendor_is_open: true,
    match_score: 0.03,
    top_tag_label: null,
  };
}

function makeClient(opts: {
  embedding?: number[] | null;
  embedError?: boolean;
  rpcData?: ReturnType<typeof row>[] | null;
  rpcError?: boolean;
  ranking?: Ranking;
  rerankError?: boolean;
}) {
  const invoke = vi.fn(async (name: string) => {
    if (name === "embed-query") {
      return opts.embedError
        ? { data: null, error: { message: "no key" } }
        : { data: { embedding: opts.embedding ?? [0.1, 0.2] }, error: null };
    }
    if (name === "rerank-search") {
      return opts.rerankError
        ? { data: null, error: { message: "llm down" } }
        : { data: { ranking: opts.ranking ?? [] }, error: null };
    }
    return { data: null, error: null };
  });

  const rpc = vi.fn(async () =>
    opts.rpcError
      ? { data: null, error: { message: "rpc fail" } }
      : { data: opts.rpcData ?? [], error: null },
  );

  return { client: { functions: { invoke }, rpc }, invoke, rpc };
}

describe("searchHomeItems", () => {
  beforeEach(() => createClientMock.mockReset());

  it("returns [] for a blank query without touching Supabase", async () => {
    const { client, invoke, rpc } = makeClient({});
    createClientMock.mockResolvedValue(client);

    await expect(searchHomeItems("   ")).resolves.toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("over-fetches a candidate pool and reorders by rerank score", async () => {
    const { client, invoke, rpc } = makeClient({
      rpcData: [row("a", "A"), row("b", "B"), row("c", "C")], // RRF order A,B,C
      ranking: [
        { id: "c", score: 0.95 },
        { id: "a", score: 0.4 },
        { id: "b", score: 0.1 },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const result = await searchHomeItems("我今天想吃輕一點的", "area1", 30);
    expect(result.map((i) => i.id)).toEqual(["c", "a", "b"]);

    // hybrid_search asked for the enlarged pool, not just the page size
    expect(rpc).toHaveBeenCalledWith(
      "hybrid_search",
      expect.objectContaining({ p_limit: 40, p_area_id: "area1" }),
    );
    // reranker received the retrieved candidates
    expect(invoke).toHaveBeenCalledWith(
      "rerank-search",
      expect.objectContaining({
        body: expect.objectContaining({ query: "我今天想吃輕一點的" }),
      }),
    );
  });

  it("keeps the RRF order when the reranker fails", async () => {
    const { client } = makeClient({
      rpcData: [row("a", "A"), row("b", "B"), row("c", "C")],
      rerankError: true,
    });
    createClientMock.mockResolvedValue(client);

    const result = await searchHomeItems("牛肉麵");
    expect(result.map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("places rerank-omitted items after scored ones", async () => {
    const { client } = makeClient({
      rpcData: [row("a", "A"), row("b", "B"), row("c", "C")],
      ranking: [{ id: "b", score: 0.8 }], // only b scored
    });
    createClientMock.mockResolvedValue(client);

    const result = await searchHomeItems("清爽");
    expect(result[0].id).toBe("b"); // scored item first
    expect(result.map((i) => i.id).slice(1)).toEqual(["a", "c"]); // others keep order
  });

  it("degrades to keyword-only embedding when embed-query fails", async () => {
    const { client, rpc } = makeClient({
      embedError: true,
      rpcData: [row("a", "A")],
    });
    createClientMock.mockResolvedValue(client);

    await searchHomeItems("拉麵");
    expect(rpc).toHaveBeenCalledWith(
      "hybrid_search",
      expect.objectContaining({ p_query_embedding: null }),
    );
  });

  it("skips the reranker when there is at most one candidate", async () => {
    const { client, invoke } = makeClient({ rpcData: [row("a", "A")] });
    createClientMock.mockResolvedValue(client);

    const result = await searchHomeItems("便當");
    expect(result.map((i) => i.id)).toEqual(["a"]);
    expect(invoke).not.toHaveBeenCalledWith("rerank-search", expect.anything());
  });

  it("returns [] when hybrid_search errors", async () => {
    const { client } = makeClient({ rpcError: true });
    createClientMock.mockResolvedValue(client);
    await expect(searchHomeItems("漢堡")).resolves.toEqual([]);
  });
});
