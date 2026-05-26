// generate-reasons
//
// Generates short, personalised recommendation sentences for the homepage.
// Caller passes the items currently shown to the user; for each item missing
// (or with a stale, > 24h cache row), call OpenAI once with the user's top
// tag preferences and the item's metadata. Upsert the result.
//
// Online LLM call, but fire-and-forget from the homepage's after() hook —
// failures degrade silently to no-reason cards.
//
// Required secret: OPENAI_API_KEY
// Optional: OPENAI_REASON_MODEL (default OPENAI_MODEL, default "gpt-5.4-mini")

import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_MODEL =
  Deno.env.get("OPENAI_REASON_MODEL") ?? Deno.env.get("OPENAI_MODEL") ?? "gpt-5.4-mini";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_ITEMS = 20;
const TTL_HOURS = 24;
const CONCURRENT = 5;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ItemIn {
  id: string;
  name: string;
  ai_description?: string | null;
  ai_tags?: string[];
}

interface OutRow {
  id: string;
  reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "missing auth" }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthenticated" }, 401);

  let payload: { items?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!Array.isArray(payload.items)) return json({ error: "items required" }, 400);

  const items = (payload.items as ItemIn[])
    .filter((it) => it && typeof it.id === "string" && typeof it.name === "string")
    .slice(0, MAX_ITEMS);
  if (items.length === 0) return json({ generated: 0 });

  // Find which items already have a fresh cache row.
  const ids = items.map((i) => i.id);
  const { data: existing } = await supabase
    .from("personalized_reasons")
    .select("menu_item_id, generated_at")
    .eq("user_id", user.id)
    .in("menu_item_id", ids);
  const freshCutoff = Date.now() - TTL_HOURS * 60 * 60 * 1000;
  const freshIds = new Set(
    (existing ?? [])
      .filter((r) => new Date(r.generated_at).getTime() >= freshCutoff)
      .map((r) => r.menu_item_id as string),
  );
  const todo = items.filter((it) => !freshIds.has(it.id));
  if (todo.length === 0) return json({ generated: 0, cached: items.length });

  // Pull this user's top tags for prompt context.
  const { data: tagRows } = await supabase
    .from("user_tag_preferences")
    .select("tag_slug, score")
    .order("score", { ascending: false })
    .limit(6);
  const { data: tagLabels } = await supabase
    .from("tag_vocabulary")
    .select("slug, label");
  const labelMap = new Map((tagLabels ?? []).map((t) => [t.slug as string, t.label as string]));
  const topTags = (tagRows ?? [])
    .map((r) => labelMap.get(r.tag_slug as string) ?? (r.tag_slug as string))
    .filter(Boolean);

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const out: OutRow[] = [];

  // Concurrency-limited dispatch.
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length) {
      const idx = cursor++;
      const it = todo[idx];
      try {
        const itemTags = (it.ai_tags ?? [])
          .map((s) => labelMap.get(s) ?? s)
          .filter(Boolean)
          .slice(0, 5);
        const completion = await openai.chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: buildUserPrompt(topTags, it.name, it.ai_description ?? "", itemTags),
            },
          ],
          max_tokens: 80,
        });
        const reason = completion.choices[0]?.message?.content?.trim();
        if (reason) out.push({ id: it.id, reason });
      } catch (e) {
        console.error("generate-reason failed for item", it.id, e);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENT, todo.length) }, worker));

  if (out.length > 0) {
    const rows = out.map((o) => ({
      user_id: user.id,
      menu_item_id: o.id,
      reason: o.reason,
      generated_at: new Date().toISOString(),
    }));
    await supabase
      .from("personalized_reasons")
      .upsert(rows, { onConflict: "user_id,menu_item_id" });
  }

  return json({ generated: out.length, cached: freshIds.size, requested: items.length });
});

const SYSTEM_PROMPT = `你是訂餐 app 的推薦助手。根據用戶過去最常選的口味標籤，為每道菜寫一句 20–35 字的繁體中文推薦語。

規則：
- 用親切、自然的口氣，像朋友推坑
- 不要重複菜名
- 不要用 markdown、emoji、列表
- 不要說「推薦」「建議」這種空話，要扣到具體理由（口味/食材/情境）
- 一句話結尾`;

function buildUserPrompt(
  topTags: string[],
  itemName: string,
  itemDesc: string,
  itemTags: string[],
): string {
  const tagsLine = topTags.length > 0 ? topTags.join("、") : "（尚無口味紀錄）";
  return `用戶過去最愛的口味：${tagsLine}

這道菜：${itemName}
菜的標籤：${itemTags.length > 0 ? itemTags.join("、") : "（無）"}
${itemDesc ? `簡介：${itemDesc}` : ""}

寫一句個性化推薦語。`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
