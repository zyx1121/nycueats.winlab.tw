// generate-menu-item-tags
//
// Server Action / 後台 / backfill script invoke 進來，
// 用 GPT-5.4-mini 對指定 menu_items 產 ai_tags + ai_description + 缺值的營養指標。
//
// Required Supabase secrets:
//   OPENAI_API_KEY
//   OPENAI_MODEL (optional, default "gpt-5.4-mini")
//
// 預設 SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 由 Edge Runtime 注入。

import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-5.4-mini";
const OPENAI_EMBED_MODEL = Deno.env.get("OPENAI_EMBED_MODEL") ?? "text-embedding-3-small";
const OPENAI_EMBED_DIMS = Number(Deno.env.get("OPENAI_EMBED_DIMS") ?? "512");

const SKIP_WITHIN_MS = 60_000;
const MAX_ITEMS_PER_INVOKE = 100;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestPayload {
  menu_item_ids: string[];
  force?: boolean;
}

interface VocabRow {
  slug: string;
  label: string;
  axis: string;
}

interface MenuItemRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  calories: number | null;
  protein: number | null;
  sodium: number | null;
  sugar: number | null;
  tags: string[];
  ai_generated_at: string | null;
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

  let payload: RequestPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!Array.isArray(payload.menu_item_ids) || payload.menu_item_ids.length === 0) {
    return json({ error: "menu_item_ids required" }, 400);
  }
  if (payload.menu_item_ids.length > MAX_ITEMS_PER_INVOKE) {
    return json({ error: `max ${MAX_ITEMS_PER_INVOKE} items per invoke` }, 400);
  }

  const supabaseCaller = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: vocab, error: vocabError } = await supabaseAdmin
    .from("tag_vocabulary")
    .select("slug, label, axis")
    .order("axis")
    .order("sort_order");
  if (vocabError || !vocab || vocab.length === 0) {
    return json({ error: "vocab unavailable" }, 500);
  }

  const allSlugs = vocab.map((v: VocabRow) => v.slug);

  // RLS check：caller 必須對這些 menu_items 有 SELECT 權限（=vendor owner 或 admin）
  const { data: items, error: itemsError } = await supabaseCaller
    .from("menu_items")
    .select("id, name, description, price, calories, protein, sodium, sugar, tags, ai_generated_at")
    .in("id", payload.menu_item_ids);
  if (itemsError) return json({ error: itemsError.message }, 403);
  if (!items || items.length === 0) return json({ error: "no accessible items" }, 403);

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const systemPrompt = buildSystemPrompt(vocab as VocabRow[]);
  const results: Array<{ id: string; status: "ok" | "skipped" | "error"; error?: string }> = [];

  for (const raw of items as MenuItemRow[]) {
    if (
      !payload.force &&
      raw.ai_generated_at &&
      Date.now() - new Date(raw.ai_generated_at).getTime() < SKIP_WITHIN_MS
    ) {
      results.push({ id: raw.id, status: "skipped" });
      continue;
    }

    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildUserPrompt(raw) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "menu_item_metadata",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                tags: {
                  type: "array",
                  items: { type: "string", enum: allSlugs },
                  minItems: 2,
                  maxItems: 8,
                },
                description: { type: "string" },
                calories: { type: ["integer", "null"] },
                protein: { type: ["number", "null"] },
                sodium: { type: ["number", "null"] },
                sugar: { type: ["number", "null"] },
              },
              required: ["tags", "description", "calories", "protein", "sodium", "sugar"],
            },
            strict: true,
          },
        },
      });

      const content = completion.choices?.[0]?.message?.content;
      if (!content) throw new Error("empty completion content");
      const parsed = JSON.parse(content);

      const uniqueTags = [...new Set<string>(parsed.tags ?? [])];

      // Build embedding from name + description + tag labels (semantic richness)
      const tagLabels = uniqueTags
        .map((slug) => (vocab as VocabRow[]).find((v) => v.slug === slug)?.label ?? slug)
        .join(" ");
      const embedInput = `${raw.name} ${parsed.description ?? ""} ${tagLabels}`.trim();

      let embedding: number[] | null = null;
      try {
        const embedResp = await openai.embeddings.create({
          model: OPENAI_EMBED_MODEL,
          input: embedInput,
          dimensions: OPENAI_EMBED_DIMS,
        });
        embedding = embedResp.data?.[0]?.embedding ?? null;
      } catch (embedErr) {
        // Embedding failure is non-fatal — tags still get written
        console.error(`embedding failed for ${raw.id}:`, embedErr);
      }

      const update: Record<string, unknown> = {
        ai_tags: uniqueTags,
        ai_description: parsed.description,
        ai_generated_at: new Date().toISOString(),
      };
      if (embedding) update.embedding = JSON.stringify(embedding);
      if (raw.calories == null && parsed.calories != null) update.calories = parsed.calories;
      if (raw.protein == null && parsed.protein != null) update.protein = parsed.protein;
      if (raw.sodium == null && parsed.sodium != null) update.sodium = parsed.sodium;
      if (raw.sugar == null && parsed.sugar != null) update.sugar = parsed.sugar;

      const { error: updateError } = await supabaseAdmin
        .from("menu_items")
        .update(update)
        .eq("id", raw.id);
      if (updateError) throw updateError;

      results.push({ id: raw.id, status: "ok" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      results.push({ id: raw.id, status: "error", error: message });
    }
  }

  return json({ results }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function buildSystemPrompt(vocab: VocabRow[]): string {
  const byAxis: Record<string, string[]> = {};
  for (const v of vocab) {
    (byAxis[v.axis] ??= []).push(`${v.slug}(${v.label})`);
  }
  const axes = Object.entries(byAxis)
    .map(([axis, slugs]) => `- ${axis}: ${slugs.join(", ")}`)
    .join("\n");

  return `你是台灣校園訂餐平台的菜單分析助手。任務：給一道餐點，產出：
1. tags：從以下 controlled vocabulary 選 2-8 個 slug，盡量跨多個 axis 涵蓋餐點特性，但每個 axis 至多 2 個。
2. description：一句中文簡介（20-80 字），描述風味/口感/適合場合，不要重複菜名。
3. calories / protein / sodium / sugar：若 existing_nutrition 對應欄位為 null 則估值（以同類餐點常見區間），不為 null 則一律回 null（系統不會覆蓋已填值）。

Controlled vocabulary (slug-中文 label)：
${axes}

僅輸出 slug，不接受中文 label 也不接受 vocab 外的 tag。`;
}

function buildUserPrompt(item: MenuItemRow): string {
  return JSON.stringify({
    name: item.name,
    vendor_description: item.description,
    price: item.price,
    vendor_tags: item.tags,
    existing_nutrition: {
      calories: item.calories,
      protein: item.protein,
      sodium: item.sodium,
      sugar: item.sugar,
    },
  });
}
