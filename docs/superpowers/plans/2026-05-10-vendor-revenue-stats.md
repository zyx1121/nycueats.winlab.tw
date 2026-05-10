# Vendor Revenue Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vendor-only revenue statistics page that shows monthly revenue, order count, sold quantity, daily revenue trend, and top menu items.

**Architecture:** Keep the route under `app/vendor/revenue`. Fetch data in server-side helpers guarded by `requireRole("vendor")`, scope all rows through the current user's vendor, and compute view models with pure functions that can be unit tested. Render the page as a Server Component using async `searchParams` and small SVG/CSS chart components.

**Tech Stack:** Next.js 16 App Router, React Server Components, Supabase JS nested selects with `!inner`, Tailwind CSS 4, Vitest.

---

## File Structure

- Create `app/vendor/revenue/revenue-model.ts`
  - Pure types and functions for date parsing, month ranges, stats aggregation, daily trend aggregation, and menu-item ranking.
- Create `app/vendor/revenue/revenue-model.test.ts`
  - Unit tests for the pure revenue logic.
- Create `app/vendor/revenue/actions.ts`
  - Server-side data loader guarded by `requireRole("vendor")`.
- Create `app/vendor/revenue/page.tsx`
  - Server Component page that reads async `searchParams`, calls the loader, and renders the dashboard.
- Create `app/vendor/revenue/revenue-trend-chart.tsx`
  - SVG line chart for daily revenue.
- Create `app/vendor/revenue/revenue-bar-chart.tsx`
  - Monthly top-menu revenue bar chart.
- Modify `app/vendor/layout.tsx`
  - Add the 「營業額統計」 navigation item.

## Task 1: Revenue Model

**Files:**
- Create: `app/vendor/revenue/revenue-model.ts`
- Test: `app/vendor/revenue/revenue-model.test.ts`

- [ ] **Step 1: Write failing model tests**

Cover:
- Invalid query values fall back to the provided current date.
- Month range uses `YYYY-MM-DD` boundaries.
- Revenue uses `date`, not `created_at`.
- Only `confirmed` and `completed` rows are counted.
- Top menu items are scoped to rows passed in and sorted by revenue.

Run:

```bash
bun run test:unit app/vendor/revenue/revenue-model.test.ts
```

Expected: fail because `revenue-model.ts` does not exist yet.

- [ ] **Step 2: Implement minimal model functions**

Implement:
- `parseRevenueMonth(searchParams, now)`
- `getMonthRange(year, month)`
- `getPreviousMonth(year, month)`
- `buildRevenueStats(rows, year, month)`
- `buildDailyRevenueTrend(rows, days, now)`
- `buildTopMenuItems(rows, year, month, limit)`

Rows should be plain objects with:

```ts
type RevenueRow = {
  date: string;
  qty: number;
  unit_price: number;
  order_id: string;
  order_status: string;
  menu_item_id: string;
  menu_item_name: string;
};
```

- [ ] **Step 3: Verify model tests pass**

Run:

```bash
bun run test:unit app/vendor/revenue/revenue-model.test.ts
```

Expected: pass.

## Task 2: Server Data Loader

**Files:**
- Create: `app/vendor/revenue/actions.ts`

- [ ] **Step 1: Implement vendor scoped loader**

Create `getVendorRevenueDashboard(year, month)`:
- Calls `requireRole("vendor")`
- Reads `vendors.id,name` where `owner_id = user.id`
- Returns `{ vendor: null, ...empty dashboard }` if not bound
- Queries `order_items` with:

```ts
.select("date, qty, unit_price, order_id, menu_item_id, menu_items!inner(name, vendor_id), orders!inner(status)")
.eq("menu_items.vendor_id", vendor.id)
.in("orders.status", ["confirmed", "completed"])
```

Use enough date range to compute selected month, previous month, and near-term trend. Convert Supabase rows into `RevenueRow[]`, then call model functions.

- [ ] **Step 2: Type-check locally**

Run:

```bash
bunx tsc --noEmit
```

Expected: no TypeScript errors.

## Task 3: Page UI

**Files:**
- Create: `app/vendor/revenue/page.tsx`
- Create: `app/vendor/revenue/revenue-trend-chart.tsx`
- Create: `app/vendor/revenue/revenue-bar-chart.tsx`
- Modify: `app/vendor/layout.tsx`

- [ ] **Step 1: Add route and navigation**

Add a fourth vendor nav button:

```tsx
<Link href="/vendor/revenue">
  <Button variant="outline" size="sm">營業額統計</Button>
</Link>
```

Create the page with:

```ts
type SearchParams = Promise<{ year?: string | string[]; month?: string | string[] }>;
```

Await `searchParams`, parse it through `parseRevenueMonth`, and render the dashboard.

- [ ] **Step 2: Add chart components**

Implement simple SVG/CSS components matching existing admin styling:
- bordered card
- `bg-card`
- no chart library
- empty state text: `暫無資料`

- [ ] **Step 3: Add month links**

Render previous/current/next month links using query string:

```txt
/vendor/revenue?year=2026&month=5
```

Keep controls simple and server-rendered.

## Task 4: Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run targeted unit tests**

```bash
bun run test:unit app/vendor/revenue/revenue-model.test.ts
```

- [ ] **Step 2: Run lint**

```bash
bun run lint
```

- [ ] **Step 3: Run type check**

```bash
bunx tsc --noEmit
```

- [ ] **Step 4: Run full unit tests if targeted checks pass**

```bash
bun run test:unit
```

## Task 5: Commit

**Files:**
- Add all implementation and test files from the tasks above.

- [ ] **Step 1: Review diff**

```bash
git diff -- app/vendor/layout.tsx app/vendor/revenue docs/superpowers/plans/2026-05-10-vendor-revenue-stats.md
```

- [ ] **Step 2: Commit implementation**

```bash
git add app/vendor/layout.tsx app/vendor/revenue docs/superpowers/plans/2026-05-10-vendor-revenue-stats.md
git commit -m "feat(vendor): add revenue statistics dashboard"
```
