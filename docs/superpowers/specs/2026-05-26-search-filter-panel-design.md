# Search Filter Panel — Design Spec

**Date:** 2026-05-26
**Status:** Shipped — archived design doc (implemented; see `app/search/`, `components/filter-panel.tsx`)

---

## Overview

在 header 搜尋欄右側加一個篩選按鈕（漏斗 icon），點開後在按鈕正下方展示 Popover filter panel。只在使用者角色的頁面出現（`navigation.showSearch === true`）。

篩選條件以 URL params 儲存，套用邏輯推入 DB 層（擴充 `hybrid_search` function）。

---

## Filter 選項

| 選項 | URL Param | 型別 | 預設 |
|------|-----------|------|------|
| 現在有開 | `open=true` | boolean | 無（不篩選） |
| 排序方式 | `sort=recommended\|price_asc\|price_desc\|cal_asc` | string | `recommended` |
| 日期 | `dates=2026-05-26,2026-05-27` | 逗號分隔 date | 無 |
| 價格區間 | `price_min=60&price_max=280` | integer | 無 |
| 熱量區間 | `cal_min=0&cal_max=600` | integer | 無 |
| 餐點標籤 | `tags=spicy,rice` | 逗號分隔 slug | 無 |

Badge 數字 = 有填任何值的 param 組數（`open` / `sort≠recommended` / `dates` / `price` / `cal` / `tags` 各算 1）。

---

## 元件架構

```
components/
  search-form.tsx       ← 修改：加 FilterButton 在 search input 右側
  filter-panel.tsx      ← 新增：popover 內容（Client Component）
```

### `search-form.tsx` 變更

- 將搜尋框與篩選按鈕包在同一個 `div`，共用圓角外框，中間加 1px divider
- `filter-btn-wrap` 是獨立定位錨點（`position: relative`），badge 相對於此定位，外層不加 `overflow: hidden`
- Panel 的 `position: absolute` 相對於 `search-form` 的外層容器，`top: 100%`、`left: 0`

### `FilterPanel` props

```ts
interface FilterPanelProps {
  tagVocabulary: { slug: string; label: string; axis: string }[];
  currentFilters: SearchFilters;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
}

interface SearchFilters {
  open?: boolean;
  sort?: 'recommended' | 'price_asc' | 'price_desc' | 'cal_asc';
  dates?: string[];       // 'YYYY-MM-DD'
  priceMin?: number;
  priceMax?: number;
  calMin?: number;
  calMax?: number;
  tags?: string[];        // slugs
}
```

Panel 內部用 local state 暫存使用者操作，按「套用篩選」才呼叫 `onApply`，讓 `SearchForm` 更新 URL。

---

## Tag Vocabulary

6 個 axis，42 個 slug（資料來自 `tag_vocabulary` table）：

| Axis | Labels |
|------|--------|
| taste | 清爽、重口、辣、甜、鹹香、酸 |
| diet | 素食、高蛋白、低卡、低鹽、低糖、健康 |
| cuisine | 台式、中式、日式、韓式、港式、泰式、印度、西式、義式、美式、墨西哥 |
| category | 飯、麵、湯品、沙拉、三明治、飲料、甜點、早餐、便當、火鍋、燒烤、炸物 |
| temperature | 熱食、冷食、冰品 |
| occasion | 加購、飽足、輕食、療癒 |

`tag_vocabulary` 在 `header.tsx`（Server Component）fetch 並透過 props 傳入 `SearchForm` → `FilterPanel`。

---

## 日期 Chip 資料

Panel 開啟時，從 Client 呼叫一個 Server Action 取得未來 7 天各日期是否有任何剩餘名額：

```ts
// app/actions/filter.ts
export async function getDateQuotas(
  areaId?: string   // 從 FilterPanel 的 useSearchParams().get('area') 取得
): Promise<{ date: string; hasQuota: boolean }[]>
```

查詢：
```sql
SELECT date, SUM(max_qty - reserved_qty) > 0 AS has_quota
FROM daily_slots ds
JOIN menu_items mi ON mi.id = ds.menu_item_id
JOIN vendors v ON v.id = mi.vendor_id
WHERE ds.date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6
  AND v.is_active = true
  AND (p_area_id IS NULL OR EXISTS (SELECT 1 FROM vendor_areas va WHERE va.vendor_id = v.id AND va.area_id = p_area_id))
GROUP BY date
ORDER BY date
```

`hasQuota = false` 的日期顯示為 disabled state（半透明，不可點）。

---

## DB 變更：擴充 `hybrid_search`

新增 migration 以 `CREATE OR REPLACE FUNCTION` 加入選用 filter params：

```sql
CREATE OR REPLACE FUNCTION hybrid_search(
  p_query           text,
  p_query_embedding vector(512) DEFAULT NULL,
  p_area_id         uuid        DEFAULT NULL,
  p_limit           int         DEFAULT 30,
  -- filter params（全部 DEFAULT NULL = 不篩選）
  p_open            boolean     DEFAULT NULL,
  p_price_min       int         DEFAULT NULL,
  p_price_max       int         DEFAULT NULL,
  p_cal_min         int         DEFAULT NULL,
  p_cal_max         int         DEFAULT NULL,
  p_tags            text[]      DEFAULT NULL,
  p_dates           date[]      DEFAULT NULL,
  p_sort            text        DEFAULT NULL   -- 'price_asc'|'price_desc'|'cal_asc'|NULL=RRF
)
```

在 final SELECT 的 WHERE 區塊追加：

```sql
AND (p_open     IS NULL OR v.is_open = p_open)
AND (p_price_min IS NULL OR mi.price >= p_price_min)
AND (p_price_max IS NULL OR mi.price <= p_price_max)
AND (p_cal_min   IS NULL OR mi.calories >= p_cal_min)
AND (p_cal_max   IS NULL OR mi.calories <= p_cal_max)
AND (p_tags      IS NULL OR mi.ai_tags && p_tags)
AND (p_dates     IS NULL OR EXISTS (
  SELECT 1 FROM daily_slots ds
  WHERE ds.menu_item_id = mi.id
    AND ds.date = ANY(p_dates)
    AND ds.max_qty > ds.reserved_qty
))
```

ORDER BY 區塊改為：

```sql
ORDER BY
  CASE p_sort
    WHEN 'price_asc'  THEN -mi.price::float      -- negate → DESC = cheapest first
    WHEN 'price_desc' THEN  mi.price::float       -- DESC = most expensive first
    WHEN 'cal_asc'    THEN -mi.calories::float    -- negate → DESC = lowest cal first
    ELSE f.rrf                                    -- DESC = highest RRF score first
  END DESC NULLS LAST,
  mi.name ASC
```

`GRANT` 不變（`anon, authenticated`）。

---

## `lib/search.ts` 變更

`searchHomeItems` 增加 `filters?: SearchFilters` 參數，將其展開為 RPC 呼叫的對應欄位：

```ts
export async function searchHomeItems(
  query: string,
  areaId?: string,
  limit = 30,
  filters?: SearchFilters,
): Promise<HomeItem[]>
```

---

## Search Page 變更

`app/search/page.tsx` 從 `searchParams` 解析 filter params，傳入 `searchHomeItems`：

```ts
const filters: SearchFilters = {
  open: params.open === 'true' ? true : undefined,
  sort: (params.sort as SearchFilters['sort']) ?? undefined,
  dates: params.dates?.split(','),
  priceMin: params.price_min ? Number(params.price_min) : undefined,
  priceMax: params.price_max ? Number(params.price_max) : undefined,
  calMin: params.cal_min ? Number(params.cal_min) : undefined,
  calMax: params.cal_max ? Number(params.cal_max) : undefined,
  tags: params.tags?.split(','),
};
```

---

## Panel UI 規格

- **寬度：** `w-[560px]`（約 max-w-xl），右對齊於篩選按鈕
- **Grid：** 上半 2-column（現在有開 / 排序 | 價格 / 熱量），下半 full-width（日期、標籤）
- **日期 chip 三態：** selected（`bg-[oklch(0.205_0_0)]` + 白字）、unselected（灰底）、disabled（半透明，`pointer-events: none`）
- **Footer：** 左側顯示「已選 N 個條件」，右側「套用篩選」按鈕

---

## 不在本次範圍內

- 首頁（`rank_menu_items_for_home`）不套用 filter
- 排序 `cal_asc` 在 `calories IS NULL` 時的餐點排到最後（NULLS LAST 已處理）
- Filter 狀態不跨 session 保留（關頁就清）

---

## 檔案異動摘要

| 動作 | 路徑 |
|------|------|
| 修改 | `components/search-form.tsx` |
| 新增 | `components/filter-panel.tsx` |
| 新增 | `app/actions/filter.ts` |
| 修改 | `lib/search.ts` |
| 修改 | `app/search/page.tsx` |
| 新增 migration | `supabase/migrations/YYYYMMDDHHMMSS_hybrid_search_filters.sql` |
| 修改 | `components/header.tsx`（加 tag_vocabulary fetch + 傳 props） |
