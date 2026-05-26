# Architecture

**Update this file immediately when architecture changes so agents always have the latest info.**

## Current Architecture (2026-05-26)

### Tech Stack
- Next.js 16 — App Router
- Tailwind CSS 4
- shadcn/ui (Radix UI primitives)
- Supabase — Auth (Google OAuth + Email) + Postgres + RLS + Storage + Edge Functions
- OpenAI API (`gpt-5.4-mini`) — offline AI tag + description + nutrition fill for menu items

### Directory Structure
```
app/
  page.tsx          # Home — factory-filtered vendor grid + recommendation sections
  layout.tsx        # Root layout (Geist Sans, ThemeProvider, Header)
  globals.css       # Tokens (surface/brand/radius/shadow/type scale), light/dark
  cart/             # Employee cart (/cart) + actions, view-model, tests
  orders/[id]/      # Order detail + QR code component
  orders/           # Employee orders list (/orders) + actions, summary, tests
  menu/[id]/        # Vendor menu detail (/menu/[id]) + add-to-order dialog
  profile/          # Employee profile (/profile)
  login/            # Login page (/login) + actions
  auth/callback/    # Supabase OAuth callback
  api/pickup/       # QR code pickup endpoint (route handler)
  vendor/           # /vendor, /vendor/{menu,orders,profile,revenue}
  admin/            # /admin, /admin/{vendors,reports,users}
components/
  ui/               # shadcn/ui primitives
  header.tsx        # Global header (area selector, cart, user avatar)
  area-select.tsx   # Factory filter dropdown
  image-upload.tsx  # Image upload with type/size validation
  login-form.tsx    # Email/password + Google OAuth form
  menu-item-card.tsx # Shared menu item card (user + vendor view)
  recommendation-section.tsx # Horizontal carousel for trending/nutrition/random
lib/
  auth.ts           # requireRole() helper for Server Action guards
  recommendation.ts # Recommendation engine (trending, nutrition, random)
  navigation-rules.ts # Role-based default home + header visibility rules
  supabase/{client,server}.ts  # Browser / SSR clients
  utils.ts
proxy.ts            # Next.js 16 edge middleware (renamed from middleware.ts)
types/
  supabase.ts       # Auto-generated DB types
```

### DB Tables
- `areas` — Factory sites (e.g. 新竹廠)
- `profiles` — User profiles (role: text[])
- `vendors` — Vendor stores
- `vendor_areas` — Vendor-area mapping (many-to-many)
- `menu_items` — Menu items (incl. `ai_tags`, `ai_description`, `ai_generated_at`, `embedding vector(512)` for LLM-derived metadata + semantic search)
- `item_option_groups` — Option groups per menu item
- `item_options` — Individual options within a group
- `daily_slots` — Daily quotas (core slot-limiting mechanism, has CHECK constraint)
- `orders` — Orders
- `order_items` — Order line items
- `order_item_options` — Selected options per order item
- `tag_vocabulary` — Controlled-vocab AI tags (42 slugs × 6 axes); `validate_ai_tags` trigger enforces `menu_items.ai_tags ⊆ tag_vocabulary.slug`
- `user_tag_preferences` — Per-user tag affinity score, accumulated on order confirm
- `user_nutrition_profile` — Per-user running average consumption (calories/protein/sodium/sugar)
- `user_embeddings` — Per-user 512-dim taste vector (mean of confirmed items' embeddings minus 0.3 × skipped items' embeddings); recomputed on every confirm + daily cron
- `menu_item_impressions` — 1 row per user × item × date; powers the "skipped" signal (impressed ≥ 3 days ago and never confirmed)
- `context_embeddings` — Cached embeddings keyed by `{hour_band}_{temp_band}_{rain}` so the same time-of-day × weather bucket doesn't pay OpenAI twice
- `daily_picks` — One Thompson-Sampling surprise pick per user per day (PK: user_id + date); stores chosen menu_item_id + θ + β for traceability
- `personalized_reasons` — Per (user, menu_item) cached LLM recommendation sentence; 24h TTL, lazy-filled on homepage render via the `generate-reasons` edge function

### DB Functions
- `rank_menu_items_for_home(p_area_id, p_limit, p_context_vec)` — SECURITY DEFINER; reads `auth.uid()` internally. raw_user_sim = `0.7 × cos(user_vec) + 0.3 × cos(context_vec)` when both present; either NULL → falls back to the other; both NULL → 0. Three-factor z-score normalised blend with nutrition profile similarity and ln(time-decayed 14-day trend, τ = 3 days). Plus `+0.5` open-vendor bonus. Top `limit × 3` candidate pool then reranked by MMR (λ = 0.7) for diversity. Cold-start (no user vector, no context) degrades to trend + nutrition + open. Returns `match_score` + explainable `top_tag_label`.
- `hybrid_search(p_query, p_query_embedding, p_area_id, p_limit)` — RRF (k=60) of pg_trgm keyword match + pgvector cosine semantic match. `p_query_embedding` 可為 NULL 讓 OpenAI 未配置時降級為 keyword-only。
- `update_user_preferences_on_confirm()` — AFTER UPDATE trigger on orders; fires on `pending → confirmed`; accumulates tag scores + updates nutrition running mean + recomputes user embedding (full re-mean over all confirmed items).
- `rollover_daily_slots()` — SECURITY DEFINER; scheduled via pg_cron `rollover_daily_slots` job (`0 22 * * *` UTC = 06:00 Asia/Taipei). Materialises daily_slots for next 14 days from `menu_items.default_max_qty`, filtered by `vendors.is_active` + `vendors.operating_days` + `menu_items.is_available` + `default_max_qty > 0`. `ON CONFLICT (menu_item_id, date) DO NOTHING` preserves vendor's manual max_qty tweaks.
- `refresh_all_user_embeddings()` — SECURITY DEFINER; scheduled via pg_cron `refresh_user_embeddings` job (`0 2 * * *` UTC = 10:00 Asia/Taipei). Recomputes every user's vector as `confirmed_mean − 0.3 × skipped_mean` so skip signal (impressed ≥ 3 days ago, never confirmed) flows in without per-impression trigger thrashing.
- `compute_daily_picks()` — SECURITY DEFINER; scheduled via pg_cron `compute_daily_picks` job (same window as user-vector refresh). For each user with history, samples one item from the top-30 candidate pool via Beta(1, impressions+1) — closed-form `θ = 1 − (1 − U)^(1/β)`. Already-confirmed items are excluded. Cold-start user (no `user_embeddings` row) → candidates ranked purely by ln(decay_trend), β=1 → uniform random pick.
- `combine_user_vectors(confirmed, skipped, beta)` — IMMUTABLE helper; element-wise `confirmed − β × skipped` since pgvector lacks scalar-multiply. Called once per user per cron run.

### Edge Functions
- `generate-menu-item-tags` — Invoked by Server Actions / backfill script. Calls OpenAI with structured outputs enum-constrained to `tag_vocabulary.slug`. Co-fills missing nutrition fields (`NULL`-only, never overrides vendor input). Also generates `embedding` (text-embedding-3-small @ 512 dims) from name + ai_description + tag labels. 60s idempotency, max 100 items/invoke.
- `embed-query` — Search-time helper: embeds query string → returns 512-dim vector for `hybrid_search` RPC.
- `rerank-search` — Search-time reranker: takes `hybrid_search` candidates + 原始 query，用 `gpt-5.4-mini` structured outputs 依「意圖契合度」(含「輕一點」→ 低熱量/低鈉偏好) 給每個候選 0~1 分。Online LLM call，與 `embed-query` 同 posture；caller (`lib/search.ts`) 視失敗為 best-effort 並降級回 RRF 順序。
- `generate-reasons` — Homepage reason generator: takes the items currently shown to the caller + reads their `user_tag_preferences`, calls `gpt-5.4-mini` once per cache-missing item (concurrency 5), upserts into `personalized_reasons` with a 24h TTL. Invoked fire-and-forget via `after()` from `app/page.tsx`; failures degrade silently to no-reason cards (fall back to `ai_description`).

### Recommendation pipeline (offline-only LLM)
1. Vendor inserts menu item → Next 16 `after()` fires `generate-menu-item-tags` edge function → writes `ai_tags` + `ai_description` + `embedding` (+ missing nutrition).
2. User confirms order → `update_preferences_on_order_confirm` trigger updates `user_tag_preferences` + `user_nutrition_profile` + `user_embeddings` (positive signal, immediate).
3. Home server component fetches Open-Meteo current conditions (Next 16 fetch cache 30 min) → maps `{hour_band, temp_band, rain}` to a fixed English phrase → looks up `context_embeddings`; on miss invokes `embed-query` edge function and upserts. The resulting context vector is passed to `rank_menu_items_for_home(area, limit, context_vec)` → semantic cosine + nutrition + time-decayed trend with z-score normalised weights and MMR diversity rerank; no LLM in serving path. Server component also fires `after()` to log impressions (1 row per user × item × date) for the skip signal.
4. Daily 10:00 TPE cron (`refresh_user_embeddings`) bakes skipped-but-not-confirmed items into each user's vector at β = 0.3, closing the negative-feedback loop. Same window, `compute_daily_picks` Thompson-samples one surprise pick per user from a personalised top-30 pool and writes to `daily_picks`; the homepage renders it as a "🎁 今日驚喜" card above the trending carousel.
5. After rendering, homepage's `after()` hook checks `personalized_reasons` cache; items missing or > 24h stale trigger the `generate-reasons` edge function to fill the cache. Next render picks up reasons and renders them in italic text on each card; failures are silent (cards fall back to `ai_description`).
6. Search (`/search?q=...`) → `embed-query` edge function (one OpenAI call) → `hybrid_search` RPC (trgm + pgvector RRF) 過度檢索候選池 (40) → `rerank-search` edge function (LLM rerank by 自然語言意圖) → 取前 `limit`。「今天好熱」走 semantic 路徑找到冰品/飲品；「牛肉麵」走 keyword 路徑命中所有牛肉麵變體；「我今天想吃輕一點的」靠 rerank 依熱量/鈉把清爽餐點往前排。rerank 為 best-effort，失敗時降級回 RRF 順序。

### Roles
- `user` — Employee
- `vendor` — Vendor owner
- `admin` — Welfare committee
- One person can have multiple roles (profiles.role: text[])
- Auth enforced at three layers:
  - `proxy.ts` redirects unauthenticated requests to `/login` and routes
    authenticated users to their default home by role
  - Layout guards in `app/{admin,vendor}/layout.tsx` re-check role
    before rendering protected subtrees
  - Server Actions call `lib/auth.ts` `requireRole()` for mutation-time
    verification

### Slot-Limiting Mechanism
`daily_slots.reserved_qty` is atomically updated by a Postgres trigger. `CHECK (reserved_qty <= max_qty)` prevents overselling.

### Slot rollover (auto-provisioning)
`rollover_daily_slots()` runs nightly (06:00 TPE) and on migration apply. Vendors only need to set `menu_items.default_max_qty` once; pg_cron auto-materialises the next 14 days of daily_slots respecting `vendor.operating_days`. Manual per-date max_qty overrides via the vendor bulk-slot dialog are preserved (`ON CONFLICT DO NOTHING`).
