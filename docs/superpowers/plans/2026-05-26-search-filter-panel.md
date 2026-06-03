# Search Filter Panel Implementation Plan

> **Status:** Shipped — archived design doc. The feature described here has since been implemented; kept as a historical record, not a current spec. See the codebase and `README.md` for as-built behavior.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a filter panel popover next to the search bar on user pages — five filter dimensions (open now, date, price, calories, tags) plus sort — stored as URL params and applied at DB level via an extended `hybrid_search` Postgres function.

**Architecture:** URL params are the single source of truth for filter state. `SearchForm` reads active filter count from URL; `FilterPanel` initializes local state from URL params and pushes on apply. `lib/search.ts` passes filter params into an extended `hybrid_search` RPC that filters and sorts at the database level before any result is returned to TypeScript.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres, Vitest, Tailwind CSS 4, lucide-react

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `supabase/migrations/20260526220000_hybrid_search_filters.sql` | Extended DB function |
| Regenerate | `types/supabase.ts` | Updated RPC types |
| Create | `lib/filters.ts` | `SearchFilters` type + parse/serialize/count helpers |
| Create | `lib/filters.test.ts` | Tests for helpers |
| Modify | `lib/search.ts` | Pass filter params to RPC; skip reranker when sort is set |
| Modify | `lib/search.test.ts` | Tests for filter + sort behaviour |
| Create | `app/actions/filter.ts` | `getDateQuotas` Server Action |
| Create | `components/dual-range-slider.tsx` | Reusable dual-handle range input |
| Create | `components/filter-panel.tsx` | Filter popover content (Client Component) |
| Modify | `components/search-form.tsx` | Filter button + panel integration |
| Modify | `components/header.tsx` | Fetch `tag_vocabulary`; pass to `SearchForm` |
| Modify | `app/search/page.tsx` | Parse filter URL params; pass to `searchHomeItems` |

---

## Task 1: DB Migration — Extend `hybrid_search`

**Files:**
- Create: `supabase/migrations/20260526220000_hybrid_search_filters.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260526220000_hybrid_search_filters.sql

-- Remove old 4-param overload so the new signature replaces it cleanly.
DROP FUNCTION IF EXISTS hybrid_search(text, vector, uuid, int);

CREATE FUNCTION hybrid_search(
  p_query           text,
  p_query_embedding vector(512) DEFAULT NULL,
  p_area_id         uuid        DEFAULT NULL,
  p_limit           int         DEFAULT 30,
  -- filter params — all DEFAULT NULL means "no filter applied"
  p_open            boolean     DEFAULT NULL,
  p_price_min       int         DEFAULT NULL,
  p_price_max       int         DEFAULT NULL,
  p_cal_min         int         DEFAULT NULL,
  p_cal_max         int         DEFAULT NULL,
  p_tags            text[]      DEFAULT NULL,
  p_sort            text        DEFAULT NULL,   -- 'price_asc'|'price_desc'|'cal_asc'|NULL=RRF
  p_dates           date[]      DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  name            text,
  description     text,
  price           numeric,
  image_url       text,
  ai_tags         text[],
  ai_description  text,
  tags            text[],
  calories        int,
  protein         numeric,
  sodium          numeric,
  vendor_id       uuid,
  vendor_name     text,
  vendor_is_open  boolean,
  match_score     numeric,
  top_tag_label   text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH keyword AS (
  SELECT mi.id, RANK() OVER (ORDER BY similarity(mi.name, p_query) DESC) AS r
  FROM menu_items mi
  WHERE p_query IS NOT NULL
    AND length(p_query) > 0
    AND similarity(mi.name, p_query) > 0.05
  ORDER BY similarity(mi.name, p_query) DESC
  LIMIT 50
),
semantic AS (
  SELECT mi.id, RANK() OVER (ORDER BY mi.embedding <=> p_query_embedding) AS r
  FROM menu_items mi
  WHERE p_query_embedding IS NOT NULL
    AND mi.embedding IS NOT NULL
  ORDER BY mi.embedding <=> p_query_embedding
  LIMIT 50
),
all_ranked AS (
  SELECT id, r::bigint AS k_rank, NULL::bigint AS s_rank FROM keyword
  UNION ALL
  SELECT id, NULL::bigint AS k_rank, r::bigint AS s_rank FROM semantic
),
fused AS (
  SELECT
    id,
    SUM(
      COALESCE(1.0 / (60 + k_rank), 0)
      + COALESCE(1.0 / (60 + s_rank), 0)
    )::numeric AS rrf
  FROM all_ranked
  GROUP BY id
)
SELECT
  mi.id,
  mi.name,
  mi.description,
  mi.price,
  mi.image_url,
  mi.ai_tags,
  mi.ai_description,
  COALESCE(
    NULLIF(mi.tags, ARRAY[]::text[]),
    ARRAY(
      SELECT tv.label
      FROM unnest(mi.ai_tags) AS t(slug)
      JOIN tag_vocabulary tv ON tv.slug = t.slug
      ORDER BY tv.sort_order
    )
  ) AS tags,
  mi.calories,
  mi.protein,
  mi.sodium,
  mi.vendor_id,
  v.name  AS vendor_name,
  v.is_open AS vendor_is_open,
  f.rrf   AS match_score,
  NULL::text AS top_tag_label
FROM fused f
JOIN menu_items mi ON mi.id = f.id
JOIN vendors    v  ON v.id  = mi.vendor_id
WHERE mi.is_available = true
  AND v.is_active     = true
  AND (p_area_id   IS NULL OR EXISTS (
        SELECT 1 FROM vendor_areas va
        WHERE va.vendor_id = v.id AND va.area_id = p_area_id))
  AND (p_open      IS NULL OR v.is_open         = p_open)
  AND (p_price_min IS NULL OR mi.price          >= p_price_min)
  AND (p_price_max IS NULL OR mi.price          <= p_price_max)
  AND (p_cal_min   IS NULL OR mi.calories       >= p_cal_min)
  AND (p_cal_max   IS NULL OR mi.calories       <= p_cal_max)
  AND (p_tags      IS NULL OR mi.ai_tags        && p_tags)
  AND (p_dates     IS NULL OR EXISTS (
        SELECT 1 FROM daily_slots ds
        WHERE ds.menu_item_id = mi.id
          AND ds.date         = ANY(p_dates)
          AND ds.max_qty      > ds.reserved_qty))
ORDER BY
  CASE p_sort
    WHEN 'price_asc'  THEN -mi.price::float      -- negate so DESC = cheapest first
    WHEN 'price_desc' THEN  mi.price::float
    WHEN 'cal_asc'    THEN -mi.calories::float   -- negate so DESC = lowest cal first
    ELSE f.rrf::float                            -- default: highest RRF score first
  END DESC NULLS LAST,
  mi.name ASC
LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION
  hybrid_search(text, vector, uuid, int, boolean, int, int, int, int, text[], text, date[])
  TO anon, authenticated;
```

- [ ] **Step 2: Apply migration**

Use the Supabase MCP tool `apply_migration` with the full SQL from the file above.

Expected: migration applies without error.

- [ ] **Step 3: Verify filter works**

Use the Supabase MCP tool `execute_sql` with:

```sql
SELECT name, price FROM hybrid_search('飯', NULL, NULL, 5, NULL, 0, 100) ORDER BY price;
```

Expected: returns only items with `price <= 100`, no error.

- [ ] **Step 4: Regenerate TypeScript types**

Use the Supabase MCP tool `generate_typescript_types`, then write the output to `types/supabase.ts`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260526220000_hybrid_search_filters.sql types/supabase.ts
git commit -m "feat(db): extend hybrid_search with filter + sort params"
```

---

## Task 2: `lib/filters.ts` — Shared Types and Helpers

**Files:**
- Create: `lib/filters.ts`
- Create: `lib/filters.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// lib/filters.test.ts
import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  filtersToSearchParams,
  parseFiltersFromParams,
  type SearchFilters,
} from "./filters";

describe("parseFiltersFromParams", () => {
  it("returns empty object for empty params", () => {
    expect(parseFiltersFromParams({})).toEqual({});
  });

  it("parses open=true", () => {
    expect(parseFiltersFromParams({ open: "true" })).toMatchObject({ open: true });
  });

  it("ignores open=false (same as not filtering)", () => {
    const f = parseFiltersFromParams({ open: "false" });
    expect(f.open).toBeUndefined();
  });

  it("parses price range", () => {
    const f = parseFiltersFromParams({ price_min: "60", price_max: "280" });
    expect(f).toMatchObject({ priceMin: 60, priceMax: 280 });
  });

  it("parses comma-separated tags", () => {
    const f = parseFiltersFromParams({ tags: "spicy,rice" });
    expect(f.tags).toEqual(["spicy", "rice"]);
  });

  it("parses comma-separated dates", () => {
    const f = parseFiltersFromParams({ dates: "2026-05-26,2026-05-27" });
    expect(f.dates).toEqual(["2026-05-26", "2026-05-27"]);
  });

  it("parses sort", () => {
    expect(parseFiltersFromParams({ sort: "price_asc" })).toMatchObject({ sort: "price_asc" });
  });
});

describe("filtersToSearchParams", () => {
  it("omits undefined fields", () => {
    expect(filtersToSearchParams({})).toEqual({});
  });

  it("omits sort=recommended", () => {
    expect(filtersToSearchParams({ sort: "recommended" })).toEqual({});
  });

  it("round-trips non-default filters", () => {
    const f: SearchFilters = {
      open: true,
      sort: "price_asc",
      priceMin: 60,
      priceMax: 280,
      tags: ["spicy", "rice"],
      dates: ["2026-05-26"],
    };
    const params = filtersToSearchParams(f);
    expect(parseFiltersFromParams(params)).toMatchObject(f);
  });
});

describe("countActiveFilters", () => {
  it("returns 0 for empty filters", () => {
    expect(countActiveFilters({})).toBe(0);
  });

  it("counts each active dimension once", () => {
    expect(countActiveFilters({
      open: true,
      sort: "price_asc",
      dates: ["2026-05-26"],
      priceMin: 60,
      tags: ["spicy"],
    })).toBe(5);
  });

  it("price range counts as 1 even when only min is set", () => {
    expect(countActiveFilters({ priceMin: 50 })).toBe(1);
  });

  it("does not count sort=recommended", () => {
    expect(countActiveFilters({ sort: "recommended" })).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bunx vitest run lib/filters.test.ts
```

Expected: `FAIL` — `Cannot find module './filters'`

- [ ] **Step 3: Implement `lib/filters.ts`**

```ts
// lib/filters.ts

export interface SearchFilters {
  open?: boolean;
  sort?: "recommended" | "price_asc" | "price_desc" | "cal_asc";
  dates?: string[];
  priceMin?: number;
  priceMax?: number;
  calMin?: number;
  calMax?: number;
  tags?: string[];
}

export function parseFiltersFromParams(
  params: Record<string, string | string[] | undefined>,
): SearchFilters {
  const get = (k: string): string | undefined => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const f: SearchFilters = {};
  if (get("open") === "true") f.open = true;
  const sort = get("sort") as SearchFilters["sort"];
  if (sort) f.sort = sort;
  const dates = get("dates")?.split(",").filter(Boolean);
  if (dates?.length) f.dates = dates;
  const tags = get("tags")?.split(",").filter(Boolean);
  if (tags?.length) f.tags = tags;
  const priceMin = get("price_min");
  if (priceMin !== undefined) f.priceMin = Number(priceMin);
  const priceMax = get("price_max");
  if (priceMax !== undefined) f.priceMax = Number(priceMax);
  const calMin = get("cal_min");
  if (calMin !== undefined) f.calMin = Number(calMin);
  const calMax = get("cal_max");
  if (calMax !== undefined) f.calMax = Number(calMax);
  return f;
}

export function filtersToSearchParams(f: SearchFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.open) p.open = "true";
  if (f.sort && f.sort !== "recommended") p.sort = f.sort;
  if (f.dates?.length) p.dates = f.dates.join(",");
  if (f.tags?.length) p.tags = f.tags.join(",");
  if (f.priceMin != null) p.price_min = String(f.priceMin);
  if (f.priceMax != null) p.price_max = String(f.priceMax);
  if (f.calMin != null) p.cal_min = String(f.calMin);
  if (f.calMax != null) p.cal_max = String(f.calMax);
  return p;
}

export function countActiveFilters(f: SearchFilters): number {
  let n = 0;
  if (f.open) n++;
  if (f.sort && f.sort !== "recommended") n++;
  if (f.dates?.length) n++;
  if (f.priceMin != null || f.priceMax != null) n++;
  if (f.calMin != null || f.calMax != null) n++;
  if (f.tags?.length) n++;
  return n;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bunx vitest run lib/filters.test.ts
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/filters.ts lib/filters.test.ts
git commit -m "feat(ui): SearchFilters type with parse/serialize/count helpers"
```

---

## Task 3: Update `lib/search.ts` — Pass Filters to RPC

**Files:**
- Modify: `lib/search.ts`
- Modify: `lib/search.test.ts`

- [ ] **Step 1: Add failing tests to `lib/search.test.ts`**

Append these two `it` blocks inside the existing `describe("searchHomeItems")` block:

```ts
  it("passes filter params to the RPC", async () => {
    const { client, rpc } = makeClient({ rpcData: [row("a", "A")] });
    createClientMock.mockResolvedValue(client);

    await searchHomeItems("飯", "area1", 10, {
      open: true,
      priceMin: 60,
      priceMax: 200,
      calMin: 100,
      calMax: 500,
      tags: ["spicy", "rice"],
      dates: ["2026-05-26"],
    });

    expect(rpc).toHaveBeenCalledWith(
      "hybrid_search",
      expect.objectContaining({
        p_open: true,
        p_price_min: 60,
        p_price_max: 200,
        p_cal_min: 100,
        p_cal_max: 500,
        p_tags: ["spicy", "rice"],
        p_dates: ["2026-05-26"],
      }),
    );
  });

  it("skips the reranker when an explicit sort is set", async () => {
    const { client, invoke } = makeClient({
      rpcData: [row("a", "A"), row("b", "B"), row("c", "C")],
    });
    createClientMock.mockResolvedValue(client);

    await searchHomeItems("飯", undefined, 10, { sort: "price_asc" });

    expect(invoke).not.toHaveBeenCalledWith("rerank-search", expect.anything());
  });
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bunx vitest run lib/search.test.ts
```

Expected: last 2 tests fail — `searchHomeItems` doesn't accept a 4th arg yet.

- [ ] **Step 3: Update `lib/search.ts`**

Replace the entire file:

```ts
// lib/search.ts
import type { SearchFilters } from "@/lib/filters";
import type { HomeItem } from "@/lib/recommendation";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const RERANK_POOL = 40;

export async function searchHomeItems(
  query: string,
  areaId?: string,
  limit = 30,
  filters?: SearchFilters,
): Promise<HomeItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();

  let embedding: number[] | null = null;
  try {
    const { data: embedRes, error: embedErr } = await supabase.functions.invoke<{
      embedding: number[];
    }>("embed-query", { body: { query: trimmed } });
    if (!embedErr) embedding = embedRes?.embedding ?? null;
  } catch (e) {
    console.error("embed-query failed; degrading to keyword-only:", e);
  }

  const hasExplicitSort = filters?.sort && filters.sort !== "recommended";
  // When sort is explicit, DB already orders results — no need to over-fetch for reranking.
  const fetchLimit = hasExplicitSort ? limit : Math.max(limit, RERANK_POOL);

  const { data, error } = await supabase.rpc("hybrid_search", {
    p_query: trimmed,
    p_query_embedding: embedding as unknown as string,
    p_area_id: areaId ?? undefined,
    p_limit: fetchLimit,
    p_open: filters?.open ?? undefined,
    p_price_min: filters?.priceMin ?? undefined,
    p_price_max: filters?.priceMax ?? undefined,
    p_cal_min: filters?.calMin ?? undefined,
    p_cal_max: filters?.calMax ?? undefined,
    p_tags: filters?.tags ?? undefined,
    p_sort: hasExplicitSort ? filters!.sort : undefined,
    p_dates: filters?.dates ?? undefined,
  } as Parameters<typeof supabase.rpc>[1]);
  if (error || !data) return [];

  const items: HomeItem[] = data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    price: row.price,
    image_url: row.image_url,
    tags: row.tags ?? [],
    ai_tags: row.ai_tags ?? [],
    ai_description: row.ai_description,
    calories: row.calories,
    protein: row.protein,
    sodium: row.sodium,
    vendor_id: row.vendor_id,
    vendor_name: row.vendor_name,
    vendor_is_open: row.vendor_is_open,
    match_score: row.match_score,
    top_tag_label: row.top_tag_label,
  }));

  if (hasExplicitSort) return items;

  const reranked = await rerankItems(supabase, trimmed, items);
  return (reranked ?? items).slice(0, limit);
}

async function rerankItems(
  supabase: SupabaseServerClient,
  query: string,
  items: HomeItem[],
): Promise<HomeItem[] | null> {
  if (items.length <= 1) return null;

  try {
    const candidates = items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.ai_description ?? i.description,
      tags: i.tags,
      calories: i.calories,
      protein: i.protein,
      sodium: i.sodium,
    }));

    const { data, error } = await supabase.functions.invoke<{
      ranking: Array<{ id: string; score: number }>;
    }>("rerank-search", { body: { query, candidates } });

    if (error || !data?.ranking?.length) return null;

    const scoreById = new Map(data.ranking.map((r) => [r.id, r.score]));

    return [...items].sort((a, b) => {
      const sa = scoreById.get(a.id);
      const sb = scoreById.get(b.id);
      if (sa == null && sb == null) return 0;
      if (sa == null) return 1;
      if (sb == null) return -1;
      return sb - sa;
    });
  } catch (e) {
    console.error("rerank-search failed; keeping RRF order:", e);
    return null;
  }
}
```

- [ ] **Step 4: Run all search tests — expect PASS**

```bash
bunx vitest run lib/search.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/search.ts lib/search.test.ts
git commit -m "feat(search): pass filter params to hybrid_search RPC"
```

---

## Task 4: `app/actions/filter.ts` — Date Quota Server Action

**Files:**
- Create: `app/actions/filter.ts`

- [ ] **Step 1: Create the server action**

```ts
// app/actions/filter.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export interface DateQuota {
  date: string;   // 'YYYY-MM-DD'
  hasQuota: boolean;
}

export async function getDateQuotas(): Promise<DateQuota[]> {
  const supabase = await createClient();

  const today = new Date();
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  const { data } = await supabase
    .from("daily_slots")
    .select("date, max_qty, reserved_qty")
    .gte("date", dates[0])
    .lte("date", dates[6]);

  // Group by date: a date hasQuota if any slot has remaining capacity.
  const byDate = new Map<string, boolean>();
  for (const row of data ?? []) {
    const d = row.date as string;
    if ((row.max_qty ?? 0) > (row.reserved_qty ?? 0)) {
      byDate.set(d, true);
    } else if (!byDate.has(d)) {
      byDate.set(d, false);
    }
  }

  return dates.map((date) => ({ date, hasQuota: byDate.get(date) ?? false }));
}
```

- [ ] **Step 2: Commit**

```bash
git add app/actions/filter.ts
git commit -m "feat(ui): getDateQuotas server action for filter panel"
```

---

## Task 5: `components/dual-range-slider.tsx`

**Files:**
- Create: `components/dual-range-slider.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/dual-range-slider.tsx
"use client";

interface Props {
  min: number;
  max: number;
  low: number;
  high: number;
  step?: number;
  onLowChange: (v: number) => void;
  onHighChange: (v: number) => void;
}

export function DualRangeSlider({
  min, max, low, high, step = 1,
  onLowChange, onHighChange,
}: Props) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <div className="relative h-5 w-full select-none">
      {/* Track background */}
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border">
        {/* Active fill between thumbs */}
        <div
          className="absolute h-full rounded-full bg-foreground"
          style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
        />
      </div>

      {/* Low thumb — transparent range input; pointer-events active only when needed */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={low}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v <= high - step) onLowChange(v);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent
                   [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:appearance-auto
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:border-2
                   [&::-webkit-slider-thumb]:border-foreground
                   [&::-webkit-slider-thumb]:bg-card
                   [&::-webkit-slider-runnable-track]:bg-transparent"
        style={{ zIndex: low > max - (max - min) * 0.1 ? 5 : 3 }}
      />

      {/* High thumb */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={high}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v >= low + step) onHighChange(v);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent
                   [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:appearance-auto
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:border-2
                   [&::-webkit-slider-thumb]:border-foreground
                   [&::-webkit-slider-thumb]:bg-card
                   [&::-webkit-slider-runnable-track]:bg-transparent"
        style={{ zIndex: 4 }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/dual-range-slider.tsx
git commit -m "feat(ui): DualRangeSlider component"
```

---

## Task 6: `components/filter-panel.tsx`

**Files:**
- Create: `components/filter-panel.tsx`

Tag vocabulary axis display names (for section headers inside the panel):

| axis key | Display |
|----------|---------|
| `taste` | 口味 |
| `diet` | 飲食偏好 |
| `cuisine` | 料理風格 |
| `category` | 品項類型 |
| `temperature` | 溫度 |
| `occasion` | 場合 |

- [ ] **Step 1: Create `components/filter-panel.tsx`**

```tsx
// components/filter-panel.tsx
"use client";

import { DualRangeSlider } from "@/components/dual-range-slider";
import { getDateQuotas, type DateQuota } from "@/app/actions/filter";
import {
  countActiveFilters,
  filtersToSearchParams,
  parseFiltersFromParams,
  type SearchFilters,
} from "@/lib/filters";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

const AXIS_LABELS: Record<string, string> = {
  taste: "口味",
  diet: "飲食偏好",
  cuisine: "料理風格",
  category: "品項類型",
  temperature: "溫度",
  occasion: "場合",
};

const SORT_OPTIONS = [
  { value: "recommended", label: "推薦（預設）" },
  { value: "price_asc",   label: "價格：低 → 高" },
  { value: "price_desc",  label: "價格：高 → 低" },
  { value: "cal_asc",     label: "熱量：低 → 高" },
] as const;

interface TagEntry { slug: string; label: string; axis: string }

interface Props {
  tagVocabulary: TagEntry[];
  onClose: () => void;
}

export function FilterPanel({ tagVocabulary, onClose }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  // Initialise local state from current URL params
  const initial = parseFiltersFromParams(Object.fromEntries(searchParams.entries()));
  const [open,     setOpen]     = useState(initial.open ?? false);
  const [sort,     setSort]     = useState<SearchFilters["sort"]>(initial.sort ?? "recommended");
  const [priceMin, setPriceMin] = useState(initial.priceMin ?? 0);
  const [priceMax, setPriceMax] = useState(initial.priceMax ?? 500);
  const [calMin,   setCalMin]   = useState(initial.calMin   ?? 0);
  const [calMax,   setCalMax]   = useState(initial.calMax   ?? 1000);
  const [selDates, setSelDates] = useState<string[]>(initial.dates ?? []);
  const [selTags,  setSelTags]  = useState<string[]>(initial.tags  ?? []);
  const [quotas,   setQuotas]   = useState<DateQuota[]>([]);

  useEffect(() => {
    getDateQuotas().then(setQuotas);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  function toggleDate(date: string) {
    setSelDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date],
    );
  }

  function toggleTag(slug: string) {
    setSelTags((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  function buildFilters(): SearchFilters {
    return {
      open:     open || undefined,
      sort:     sort !== "recommended" ? sort : undefined,
      dates:    selDates.length ? selDates : undefined,
      priceMin: priceMin > 0   ? priceMin : undefined,
      priceMax: priceMax < 500 ? priceMax : undefined,
      calMin:   calMin   > 0   ? calMin   : undefined,
      calMax:   calMax   < 1000 ? calMax  : undefined,
      tags:     selTags.length ? selTags  : undefined,
    };
  }

  function handleApply() {
    const q = searchParams.get("q") ?? "";
    const area = searchParams.get("area");
    const filterParams = filtersToSearchParams(buildFilters());
    const all = new URLSearchParams({ ...(q ? { q } : {}), ...(area ? { area } : {}), ...filterParams });
    startTransition(() => {
      router.push(`/search?${all.toString()}`);
      onClose();
    });
  }

  function handleClear() {
    setOpen(false); setSort("recommended");
    setPriceMin(0); setPriceMax(500);
    setCalMin(0);   setCalMax(1000);
    setSelDates([]); setSelTags([]);
  }

  const activeCount = countActiveFilters(buildFilters());

  // Group tags by axis, preserving insertion order from tag_vocabulary
  const byAxis = tagVocabulary.reduce<Record<string, TagEntry[]>>((acc, t) => {
    (acc[t.axis] ??= []).push(t);
    return acc;
  }, {});

  // Day chip label: today/tomorrow/day-after or day-of-week abbreviation
  const DOW = ["日", "一", "二", "三", "四", "五", "六"];
  function chipLabel(dateStr: string, idx: number) {
    if (idx === 0) return "今";
    if (idx === 1) return "明";
    if (idx === 2) return "後";
    return DOW[new Date(dateStr).getDay()];
  }
  function chipDate(dateStr: string) {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  return (
    <div
      ref={panelRef}
      className="absolute left-0 top-full z-50 mt-2 w-[560px] overflow-hidden rounded-2xl border bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_2px_6px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.10)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-[14px] font-semibold">篩選條件</span>
        <button onClick={handleClear} className="text-[12px] text-brand hover:text-brand-hover">
          清除全部
        </button>
      </div>

      {/* 現在有開 + 排序 — 2-column */}
      <div className="grid grid-cols-2 border-b">
        <div className="p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">現在有開</p>
          <div className="flex items-center justify-between">
            <span className="text-[13px]">只顯示營業中商家</span>
            <button
              onClick={() => setOpen((v) => !v)}
              className={`relative h-[22px] w-[38px] rounded-full transition-colors ${open ? "bg-brand" : "bg-border"}`}
            >
              <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-card shadow transition-[left] ${open ? "left-[19px]" : "left-[3px]"}`} />
            </button>
          </div>
        </div>

        <div className="border-l p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">排序方式</p>
          <div className="flex flex-col gap-[7px]">
            {SORT_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-[13px]">
                <span
                  className={`flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    sort === opt.value ? "border-foreground" : "border-border"
                  }`}
                >
                  {sort === opt.value && <span className="h-[7px] w-[7px] rounded-full bg-foreground" />}
                </span>
                <input
                  type="radio"
                  className="sr-only"
                  checked={sort === opt.value}
                  onChange={() => setSort(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 價格 + 熱量 — 2-column */}
      <div className="grid grid-cols-2 border-b">
        <div className="p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">價格區間</p>
          <DualRangeSlider min={0} max={500} step={10} low={priceMin} high={priceMax} onLowChange={setPriceMin} onHighChange={setPriceMax} />
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>${priceMin}</span><span>${priceMax}</span>
          </div>
        </div>
        <div className="border-l p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">熱量區間（kcal）</p>
          <DualRangeSlider min={0} max={1000} step={50} low={calMin} high={calMax} onLowChange={setCalMin} onHighChange={setCalMax} />
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
            <span>{calMin} kcal</span><span>{calMax} kcal</span>
          </div>
        </div>
      </div>

      {/* 日期 — full width */}
      <div className="border-b p-4">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">日期</p>
        <div className="flex gap-1.5">
          {quotas.map((q, i) => {
            const selected = selDates.includes(q.date);
            const disabled = !q.hasQuota;
            return (
              <button
                key={q.date}
                disabled={disabled}
                onClick={() => toggleDate(q.date)}
                className={`flex flex-1 flex-col items-center rounded-[10px] border py-1.5 text-center transition-colors
                  ${disabled ? "cursor-not-allowed border-border/50 opacity-40" : "cursor-pointer"}
                  ${selected && !disabled ? "border-foreground bg-foreground text-card" : "border-border bg-surface-canvas"}`}
              >
                <span className="text-[12px] font-semibold">{chipLabel(q.date, i)}</span>
                <span className="text-[10px] opacity-70">{chipDate(q.date)}</span>
              </button>
            );
          })}
          {/* Skeleton chips while loading */}
          {quotas.length === 0 &&
            Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-10 flex-1 animate-pulse rounded-[10px] bg-surface-loader" />
            ))}
        </div>
      </div>

      {/* 餐點標籤 — full width */}
      <div className="p-4">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">餐點標籤</p>
        <div className="flex flex-col gap-2.5">
          {Object.entries(byAxis).map(([axis, tags]) => (
            <div key={axis}>
              <p className="mb-1 text-[11px] text-muted-foreground">{AXIS_LABELS[axis] ?? axis}</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <button
                    key={t.slug}
                    onClick={() => toggleTag(t.slug)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors
                      ${selTags.includes(t.slug)
                        ? "border-foreground bg-foreground text-card"
                        : "border-border bg-surface-canvas hover:border-foreground/40"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-3">
        <span className="text-[12px] text-muted-foreground">
          {activeCount > 0 ? `已選 ${activeCount} 個條件` : "尚未設定條件"}
        </span>
        <button
          onClick={handleApply}
          disabled={isPending}
          className="rounded-[8px] bg-foreground px-5 py-2 text-[13px] font-medium text-card disabled:opacity-50"
        >
          套用篩選
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/filter-panel.tsx
git commit -m "feat(ui): FilterPanel popover component"
```

---

## Task 7: Update `components/search-form.tsx` and `components/header.tsx`

**Files:**
- Modify: `components/search-form.tsx`
- Modify: `components/header.tsx`

- [ ] **Step 1: Update `components/header.tsx`**

Add `tag_vocabulary` to the parallel fetches, and pass it to `SearchForm`.

Replace the `Promise.all` and its result destructuring:

```tsx
// Old:
const [{ data: areas }, { data: { user } }, { data: itemNames }] = await Promise.all([
  supabase.from("areas").select("id, name, city").eq("is_active", true).order("city"),
  supabase.auth.getUser(),
  supabase.from("menu_items").select("name").eq("is_available", true).limit(60),
]);
```

```tsx
// New:
const [{ data: areas }, { data: { user } }, { data: itemNames }, { data: tagVocab }] = await Promise.all([
  supabase.from("areas").select("id, name, city").eq("is_active", true).order("city"),
  supabase.auth.getUser(),
  supabase.from("menu_items").select("name").eq("is_available", true).limit(60),
  supabase.from("tag_vocabulary").select("slug, label, axis").order("sort_order"),
]);
```

And update the `SearchForm` usage in the JSX:

```tsx
// Old:
{navigation.showSearch && <SearchForm placeholderItems={placeholderItems} />}

// New:
{navigation.showSearch && (
  <SearchForm
    placeholderItems={placeholderItems}
    tagVocabulary={tagVocab ?? []}
  />
)}
```

- [ ] **Step 2: Replace `components/search-form.tsx`**

```tsx
// components/search-form.tsx
"use client";

import { FilterPanel } from "@/components/filter-panel";
import { countActiveFilters, parseFiltersFromParams } from "@/lib/filters";
import { Input } from "@/components/ui/input";
import { ListFilter, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

interface TagEntry { slug: string; label: string; axis: string }

interface Props {
  placeholderItems?: string[];
  tagVocabulary: TagEntry[];
}

const FALLBACK_PLACEHOLDERS = ["今天好熱", "高蛋白", "牛肉麵", "輕食", "辣"];
const CYCLE_MS = 2500;

export function SearchForm({ placeholderItems, tagVocabulary }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initialQ);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  const pool = placeholderItems?.length ? placeholderItems : FALLBACK_PLACEHOLDERS;

  useEffect(() => {
    if (pool.length <= 1) return;
    const id = setInterval(() => setPlaceholderIdx((i) => (i + 1) % pool.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [pool.length]);

  const activeFilterCount = countActiveFilters(
    parseFiltersFromParams(Object.fromEntries(searchParams.entries())),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    const area = searchParams.get("area");
    const url = `/search?q=${encodeURIComponent(q)}${area ? `&area=${area}` : ""}`;
    startTransition(() => router.push(url));
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Search + Filter pill */}
      <div className="flex items-center rounded-[14px] border border-border">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-[13px] text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={pool[placeholderIdx] ?? "搜尋餐點"}
            className="h-9 w-44 rounded-l-[14px] rounded-r-none border-0 pl-8 pr-3 shadow-none md:w-56"
            disabled={isPending}
          />
        </form>

        {/* Divider */}
        <div className="h-5 w-px bg-border" />

        {/* Filter button + badge */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="flex h-9 items-center gap-[5px] rounded-r-[14px] px-3 text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <ListFilter className="size-[13px]" />
            篩選
          </button>
          {activeFilterCount > 0 && (
            <span className="pointer-events-none absolute -right-[7px] -top-[7px] flex h-[17px] w-[17px] items-center justify-center rounded-full border-2 border-card bg-brand text-[9px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
      </div>

      {/* Filter panel popover */}
      {filterOpen && (
        <FilterPanel
          tagVocabulary={tagVocabulary}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors on the modified files.

- [ ] **Step 4: Commit**

```bash
git add components/search-form.tsx components/header.tsx
git commit -m "feat(ui): filter button + popover in search form"
```

---

## Task 8: Update `app/search/page.tsx` — Parse Filter Params

**Files:**
- Modify: `app/search/page.tsx`

- [ ] **Step 1: Replace `app/search/page.tsx`**

```tsx
// app/search/page.tsx
import { HomeItemCard } from "@/components/home-item-card";
import { parseFiltersFromParams } from "@/lib/filters";
import { searchHomeItems } from "@/lib/search";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;

  const q     = typeof params.q    === "string" ? params.q.trim()    : "";
  const area  = typeof params.area === "string" ? params.area        : undefined;
  const filters = parseFiltersFromParams(params);

  const items = q ? await searchHomeItems(q, area, 30, filters) : [];

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="w-full p-4 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading font-semibold">
            {q ? `「${q}」的搜尋結果` : "搜尋"}
          </h1>
          {q && (
            <p className="text-meta text-muted-foreground">{items.length} 道餐點</p>
          )}
        </div>

        {!q ? (
          <p className="text-muted-foreground">請從上方輸入想吃的東西。</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center">
            找不到符合的餐點，試試其他關鍵字或調整篩選條件。
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <HomeItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run full unit test suite**

```bash
bunx vitest run
```

Expected: all existing tests + new tests pass.

- [ ] **Step 3: Run TypeScript check**

```bash
bunx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/search/page.tsx
git commit -m "feat(search): parse filter URL params and pass to searchHomeItems"
```

---

## Done

All tasks complete. Open the app as a user, click the filter icon next to the search bar, set some filters, and confirm:
1. The badge shows the correct active count
2. Results on `/search` reflect the applied filters
3. Clearing filters removes the badge and returns unfiltered results
