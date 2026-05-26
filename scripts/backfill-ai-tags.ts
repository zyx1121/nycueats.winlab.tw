// Backfill AI tags + description + nutrition for every menu_item lacking them.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     bun run scripts/backfill-ai-tags.ts [--force]
//
// 對應 P2：直接跑 edge function `generate-menu-item-tags`，每批 50 筆。

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FORCE = process.argv.includes("--force");
const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? "10");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const query = supabase.from("menu_items").select("id, name").order("name");
  const { data: items, error } = FORCE
    ? await query
    : await query.is("ai_generated_at", null);

  if (error) {
    console.error("Failed to fetch items:", error.message);
    process.exit(1);
  }
  if (!items || items.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  console.log(`Backfilling ${items.length} items (force=${FORCE})…`);

  let okCount = 0;
  let errCount = 0;
  let skipCount = 0;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${i / BATCH_SIZE + 1}: ${batch.length} items…`);

    const { data, error: invokeError } = await supabase.functions.invoke<{
      results: Array<{ id: string; status: string; error?: string }>;
    }>("generate-menu-item-tags", {
      body: { menu_item_ids: batch.map((b) => b.id), force: FORCE },
    });

    if (invokeError) {
      console.error("  invoke error:", invokeError.message);
      errCount += batch.length;
      continue;
    }
    for (const r of data?.results ?? []) {
      if (r.status === "ok") okCount++;
      else if (r.status === "skipped") skipCount++;
      else {
        errCount++;
        console.error(`  ${r.id} error:`, r.error);
      }
    }
  }

  console.log(`Done. ok=${okCount} skipped=${skipCount} error=${errCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
