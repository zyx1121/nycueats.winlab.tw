// rerank-search
//
// Search-time reranker. Takes the candidate set returned by `hybrid_search`
// (embedding + keyword RRF retrieval) and reorders it by how well each item
// matches the user's natural-language intent — including implicit health /
// portion preferences ("我今天想吃輕一點的" → favour light, low-calorie items).
//
// Online LLM call, same posture as `embed-query`. Caller (lib/search.ts) treats
// any failure as best-effort and falls back to the original RRF order.
//
// Required secret: OPENAI_API_KEY
// Optional: OPENAI_RERANK_MODEL (default OPENAI_MODEL, default "gpt-5.4-mini")

import OpenAI from "npm:openai@4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_MODEL =
  Deno.env.get("OPENAI_RERANK_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-5.4-mini";

const MAX_QUERY_CHARS = 500;
const MAX_CANDIDATES = 50;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Candidate {
  id: string;
  name: string;
  description?: string | null;
  tags?: string[];
  calories?: number | null;
  protein?: number | null;
  sodium?: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "missing auth" }, 401);

  let payload: { query?: unknown; candidates?: unknown };
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

  if (!Array.isArray(payload.candidates) || payload.candidates.length === 0) {
    return json({ error: "candidates required" }, 400);
  }
  const candidates = (payload.candidates as Candidate[])
    .filter((c) => c && typeof c.id === "string" && typeof c.name === "string")
    .slice(0, MAX_CANDIDATES);
  if (candidates.length === 0) return json({ error: "no valid candidates" }, 400);

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(query, candidates) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "rerank",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              ranking: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    score: { type: "number" },
                  },
                  required: ["id", "score"],
                },
              },
            },
            required: ["ranking"],
          },
          strict: true,
        },
      },
    });

    const content = completion.choices?.[0]?.message?.content;
    if (!content) return json({ error: "empty completion content" }, 500);

    const parsed = JSON.parse(content) as { ranking?: Array<{ id: string; score: number }> };
    const knownIds = new Set(candidates.map((c) => c.id));
    const ranking = (parsed.ranking ?? []).filter((r) => knownIds.has(r.id));
    return json({ ranking }, 200);
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

const SYSTEM_PROMPT = `你是台灣校園訂餐平台的搜尋重排助手。使用者用自然語言描述今天想吃什麼，你要為每個候選餐點打 0~1 的「意圖契合度」分數（1=非常契合，0=完全不契合）。

評分依據：
- 口味 / 餐點類型是否符合使用者描述。
- 隱含的健康與份量偏好：「輕一點 / 清爽 / 健康」偏好低熱量、低鈉、蔬食或湯品；「吃飽一點 / 重口味」偏好高熱量、高蛋白、份量足的餐點。
- 依語意判斷，不要只因菜名字面與查詢字串相近就給高分。

為傳入的每一個候選 id 都輸出一個分數。`;

function buildUserPrompt(query: string, candidates: Candidate[]): string {
  return JSON.stringify({
    query,
    candidates: candidates.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description ?? null,
      tags: c.tags ?? [],
      calories: c.calories ?? null,
      protein: c.protein ?? null,
      sodium: c.sodium ?? null,
    })),
  });
}
