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
  page.tsx          # Home — area-filtered vendor grid + recommendation sections
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
  area-select.tsx   # Area filter dropdown
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
- `areas` — Campus areas (e.g. Hsinchu Guangfu)
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

### DB Functions
- `rank_menu_items_for_home(p_area_id, p_limit)` — SECURITY DEFINER; reads `auth.uid()` internally; returns ranked items with `match_score` (tag_match × 10 + nutrition_sim × 2 + ln(trend+1) × 5 + open_bonus) and explainable `top_tag_label`. Cold-start safe: anonymous / no-history users degrade gracefully to trending + open.
- `hybrid_search(p_query, p_query_embedding, p_area_id, p_limit)` — RRF (k=60) of pg_trgm keyword match + pgvector cosine semantic match. `p_query_embedding` 可為 NULL 讓 OpenAI 未配置時降級為 keyword-only。
- `update_user_preferences_on_confirm()` — AFTER UPDATE trigger on orders; fires on `pending → confirmed`; accumulates tag scores + updates nutrition running mean.

### Edge Functions
- `generate-menu-item-tags` — Invoked by Server Actions / backfill script. Calls OpenAI with structured outputs enum-constrained to `tag_vocabulary.slug`. Co-fills missing nutrition fields (`NULL`-only, never overrides vendor input). Also generates `embedding` (text-embedding-3-small @ 512 dims) from name + ai_description + tag labels. 60s idempotency, max 100 items/invoke.
- `embed-query` — Search-time helper: embeds query string → returns 512-dim vector for `hybrid_search` RPC.

### Recommendation pipeline (offline-only LLM)
1. Vendor inserts menu item → Next 16 `after()` fires `generate-menu-item-tags` edge function → writes `ai_tags` + `ai_description` + `embedding` (+ missing nutrition).
2. User confirms order → `update_preferences_on_order_confirm` trigger updates `user_tag_preferences` + `user_nutrition_profile`.
3. Home page calls `rank_menu_items_for_home` RPC → pure SQL ranking, no LLM in serving path.
4. Search (`/search?q=...`) → `embed-query` edge function (one OpenAI call) → `hybrid_search` RPC (trgm + pgvector RRF) → results。「今天好熱」走 semantic 路徑找到冰品/飲品；「牛肉麵」走 keyword 路徑命中所有牛肉麵變體。

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
