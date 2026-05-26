// embed-query
//
// Server Action / 客戶端 invoke 進來，把搜尋字串轉成 512-dim embedding
// 給 hybrid_search RPC 用。回傳 array<number>。
//
// 用 OpenAI text-embedding-3-small + Matryoshka dimensions=512。
//
// Required secret: OPENAI_API_KEY
// Optional: OPENAI_EMBED_MODEL (default "text-embedding-3-small")
//           OPENAI_EMBED_DIMS  (default 512)

import OpenAI from "npm:openai@4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_EMBED_MODEL = Deno.env.get("OPENAI_EMBED_MODEL") ?? "text-embedding-3-small";
const OPENAI_EMBED_DIMS = Number(Deno.env.get("OPENAI_EMBED_DIMS") ?? "512");

const MAX_QUERY_CHARS = 500;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "missing auth" }, 401);

  let payload: { query?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const query = typeof payload.query === "string" ? payload.query.trim() : "";
  if (!query) return json({ error: "query required" }, 400);
  if (query.length > MAX_QUERY_CHARS) {
    return json({ error: `query too long (>${MAX_QUERY_CHARS} chars)` }, 400);
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  try {
    const r = await openai.embeddings.create({
      model: OPENAI_EMBED_MODEL,
      input: query,
      dimensions: OPENAI_EMBED_DIMS,
    });
    const embedding = r.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      return json({ error: "no embedding returned" }, 500);
    }
    return json({ embedding }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
