# Coding Style Review — 2026-05-26

> **Status:** Archived snapshot (2026-05-26). Point-in-time review — many items have been addressed since (see PRs #129–#132 and `git log`); some may still be open. Verify against current code before acting. **Not a live TODO list.**

## Summary

整體 style 一致性高 — 零 `any` 濫用、零 `for simplicity` antipattern、`'use client'` 使用克制、`useEffect` 只剩兩處合理用例（IntersectionObserver、QR code 生成）。Server Component 優先原則執行得很乾淨。主要扣分在三類重複：(1) shadcn 的兩個 chart 元件 90% 重複只差欄位，(2) 多個 vendor server action 重複 `auth.getUser() → 查 vendors by owner_id` 而沒走 `requireVendor()` helper，(3) 13 個 `as { ... }` 手動 cast supabase join 結果指向同一個型別問題 root cause。另有兩個檔案稍微超過 200 行、一個 dead-code component (`AddMenuItemButton`)、type 引用方式 (`Tables<>` vs `Database["public"]...`) 不統一。

## Critical（破壞規範 / 影響可維護）

### 1. Dead code — `AddMenuItemButton` 從未被 import

`[SOURCE: app/vendor/menu/add-menu-item-button.tsx:16]` 定義了 `AddMenuItemButton`，但 grep 整個 codebase 只有自己宣告處出現一次，`app/vendor/menu/page.tsx:104` 用的是 `<Button size="sm">新增餐點</Button>` 一個靜態 button 沒接任何 handler。這代表：(a) 「新增餐點」按鈕點下去沒反應（功能 bug），(b) 整個 105 行的 `add-menu-item-button.tsx` 是 dead code。要嘛把 `AddMenuItemButton` 接到 page，要嘛兩邊都砍掉。`[SOURCE: app/vendor/menu/page.tsx:104]`

### 2. 兩對 chart 元件 90% 重複

- `app/admin/trend-chart.tsx` 102 行 vs `app/vendor/revenue/revenue-trend-chart.tsx` 101 行 — SVG 邏輯、座標計算、grid line、polyline 幾乎逐行對齊，只差資料型別（`DailyOrderCount` vs `DailyRevenue`）跟 y-axis label format。`[SOURCE: app/admin/trend-chart.tsx:8-101]` `[SOURCE: app/vendor/revenue/revenue-trend-chart.tsx:8-101]`
- `app/admin/bar-chart.tsx` 31 行 vs `app/vendor/revenue/revenue-bar-chart.tsx` 34 行 — 同樣 90% 一致。`[SOURCE: app/admin/bar-chart.tsx:8-30]` `[SOURCE: app/vendor/revenue/revenue-bar-chart.tsx:8-33]`

抽成 `components/chart/trend-chart.tsx` + `components/chart/bar-chart.tsx`，泛型化 data row + 用 prop function 提供 label formatter。維護成本減半。

### 3. Vendor action 重複 `auth.getUser() + select vendors by owner_id`

`lib/auth.ts` 只匯出 `requireRole(role)` 一層 helper，但 vendor 還要再做一次 `select id from vendors where owner_id = user.id`。這段在多處重複：

- `app/vendor/menu/actions.ts:7-16` 已經抽成 `requireVendor()` ✓ `[SOURCE: app/vendor/menu/actions.ts:7]`
- `app/vendor/orders/actions.ts:8-16` 重新手寫一次 `[SOURCE: app/vendor/orders/actions.ts:8-16]`
- `app/vendor/profile/actions.ts:7,29,42` 三個 function 都直接 `requireRole("vendor")` 後用 `eq("owner_id", user.id)` `[SOURCE: app/vendor/profile/actions.ts:7]` `[SOURCE: app/vendor/profile/actions.ts:29]` `[SOURCE: app/vendor/profile/actions.ts:42]`
- `app/vendor/revenue/actions.ts:83-89` `[SOURCE: app/vendor/revenue/actions.ts:83-89]`
- `app/api/pickup/route.ts:24-30` 連 role check 跟 vendor lookup 都重新寫 `[SOURCE: app/api/pickup/route.ts:14-30]`

把 `requireVendor()` 升級到 `lib/auth.ts` 跟 `requireRole` 並列，所有 vendor action 走同一個入口。順便能統一錯誤訊息（現在有「找不到商家」/「找不到商家帳號」/「尚未綁定商家帳號」三種文案）。

## Important（建議改）

### 4. 13 處 `as { ... }` cast supabase join — root cause 是型別生成

`grep -rn "as {.*}" | wc -l` 找到 13 處手動 cast，例：

- `app/cart/actions.ts:17`：`(item.orders as { user_id: string } | null)?.user_id` `[SOURCE: app/cart/actions.ts:17]`
- `app/orders/[id]/page.tsx:51-56`：連三行 cast `[SOURCE: app/orders/[id]/page.tsx:51-56]`
- `app/vendor/orders/page.tsx:61,71,72,74`：四處 cast 在同一個檔 `[SOURCE: app/vendor/orders/page.tsx:61-74]`
- `app/admin/reports/actions.ts:29`：`as { vendor_id: string; vendors: { name: string } } | null` `[SOURCE: app/admin/reports/actions.ts:29]`

這違反 coding-style.md 第 3 條「資料型別完整...不用 any」精神 — `as` cast 等同 escape hatch。原因是 supabase 對 nested join (`menu_items!inner(name, vendors(name))`) 推導出來的型別是 `{ ... } | { ... }[]` union，所以 caller 都用 cast 處理。建議：(a) 提取共用 `OrderItemWithJoins` type 一次，所有地方引用同一個 type；或 (b) 用 supabase 官方 `QueryData<typeof query>` helper 推導 — 不寫 cast。`app/orders/order-summary.ts:9-21` 已示範把 join 結果 alias 成 `OrderItemRow` 的乾淨寫法 `[SOURCE: app/orders/order-summary.ts:9-21]`，整個 codebase 應該都跟它對齊。

### 5. Type 引用語法不統一

兩種寫法混用：

- `Tables<"areas">` — `app/profile/profile-form.tsx:20`、`app/menu/[id]/add-to-order-dialog.tsx:20-23`、`components/area-select.tsx:16` `[SOURCE: app/profile/profile-form.tsx:20]`
- `Database["public"]["Tables"]["areas"]["Row"]` — `app/admin/vendors/[id]/area-editor.tsx:10`、`app/admin/vendors/[id]/vendor-actions.tsx:9` `[SOURCE: app/admin/vendors/[id]/area-editor.tsx:10]` `[SOURCE: app/admin/vendors/[id]/vendor-actions.tsx:9]`

`Tables<>` 寫法乾淨應為 default。把這兩個檔的型別引用改一致。

### 6. 兩個檔案稍微超過 200 行限制

- `app/vendor/menu/bulk-slot-dialog.tsx` — 254 行 `[SOURCE: app/vendor/menu/bulk-slot-dialog.tsx:1-254]`。可拆出 `BulkSlotGrid` 或 cell-rendering function。
- `app/vendor/menu/menu-item-edit-dialog.tsx` — 253 行 `[SOURCE: app/vendor/menu/menu-item-edit-dialog.tsx:1-253]`。同樣可以把「基本資訊 form」「每日名額 grid」拆出。

`components/ui/field.tsx` 238 行、`components/ui/select.tsx` 192 行、`components/ui/dialog.tsx` 168 行屬於 shadcn auto-generated primitives，這條 rule 建議在 coding-style.md 上加註豁免 — 不然每次跑 audit 都會打到。

### 7. `header.tsx` import 寫在檔案底部

`components/header.tsx:86`：`import { AreaSelect } from "./area-select";` 寫在檔案最末，且僅由註解標示 `[SOURCE: components/header.tsx:85-86]`。所有 import 應集中在檔頂。這個 import 在 line 36 就用到 `<AreaSelect ... />` `[SOURCE: components/header.tsx:36]`，現在的順序看起來像故意「為了註解才放底部」。直接搬到 line 6 跟其他 import 一起。

### 8. `alert()` 當錯誤反饋

8 處用 `alert()` 顯示錯誤 — `[SOURCE: app/vendor/menu/bulk-slot-dialog.tsx:149]` `[SOURCE: app/vendor/menu/menu-item-edit-dialog.tsx:84]` `[SOURCE: app/vendor/menu/add-menu-item-button.tsx:35]` `[SOURCE: app/cart/cart-actions.tsx:32]` `[SOURCE: app/cart/cart-actions.tsx:44]` `[SOURCE: components/image-upload.tsx:30]` `[SOURCE: components/image-upload.tsx:35]` `[SOURCE: app/admin/vendors/[id]/vendor-review.tsx:30]`。其他地方都用 inline `<p className="text-destructive">` (`pick-up-button.tsx:26`、`add-to-order-dialog.tsx:214`、`login-form.tsx:50`)，這條 pattern 應一致 — alert 醜且阻塞、無法用 e2e test 自動處理。

## Nit（小改進）

### 9. `app/page.tsx:31` 註解寫了 WHAT 不是 WHY

`// 撈該區域的商家（透過 vendor_areas 關聯）` `[SOURCE: app/page.tsx:31]` — 下一行 query 寫得清楚，這條註解是描述 query 在做什麼。如果一定要留，寫成「為何選 `!inner` join 而不是其他」這種 WHY 才有價值。CLAUDE.md 第 12 條提到「註解寫 WHY 不是 WHAT」。

`app/menu/[id]/add-to-order-dialog.tsx:40,51,56,70,73` 也有類似情況 `[SOURCE: app/menu/[id]/add-to-order-dialog.tsx:40-73]`，但這些算是把 code 段落分區的 section comment，可接受。

### 10. `qty` 數字 parse 失敗只回 `1` / `0` 偷偷吞錯

`app/vendor/menu/option-groups-editor.tsx:123`：`parseInt(e.target.value) || 1` `[SOURCE: app/vendor/menu/option-groups-editor.tsx:123]` — 如果 user 輸入 "abc"，`parseInt` 回 `NaN`，`||` fallback 到 1。但 `parseInt("0")` 也會被 `||` 當 falsy 換成 1，所以「max_select=0」會被悄悄改成 1。同 line 155 的 `parseInt(...) || 0` 因為 fallback 是 0 沒這個問題。改成 `Number.isFinite(n) ? n : 1` 比較精準。

### 11. `useCallback` / `useMemo` 使用克制 — 好

整個 codebase 只有 `components/ui/field.tsx:184` 一處 `useMemo` `[SOURCE: components/ui/field.tsx:184]`，shadcn 原生帶的。沒看到不必要的 `useCallback` / `useMemo` 包裹 — 跟 Loki 偏好的 Minimalism 對齊。

### 12. `try-catch` 完全沒出現 — 好

`grep "try {"` 在 `app/**` 零 match，所有 server action 走「ok/error 物件」回傳。錯誤處理一致、不過度防禦。`[SOURCE: 跑了 grep -rn "try {" app/ 無 output]`

### 13. `revenue-model.ts` 是好範例

`app/vendor/revenue/revenue-model.ts` 159 行純函數、清楚分區（type → helper → builder），無 supabase 依賴 — 對應的 `revenue-model.test.ts` 128 行 cover 得到 `[SOURCE: app/vendor/revenue/revenue-model.ts:1-159]`。這個 pattern 應該推廣到 `app/admin/actions.ts` 那種把 query + 聚合邏輯混在 server action 裡的地方。

## What's good

1. **零 `any` / `as any`** — `grep ": any\|as any\|as unknown"` 完全沒輸出，這在 TypeScript 專案非常難得 `[SOURCE: 跑了 grep -rn ": any" app/ lib/ components/ 無 output]`
2. **零 antipattern markers** — 沒有 `for simplicity` / `TODO` / `FIXME` / `HACK` / `XXX` `[SOURCE: 跑了 grep -rn "for simplicity\|TODO\|FIXME" 無 output]`
3. **`'use client'` 使用克制** — 34 處 client component 都對應到實際需要 interactivity（form、dialog、useTransition）。所有 page.tsx 預設 Server Component
4. **`useEffect` 只剩兩處且合理** — `order-list.tsx:89` 是 IntersectionObserver 無限滾動 `[SOURCE: app/orders/order-list.tsx:89]`，`qr-code.tsx:9` 是 QR code 生成 `[SOURCE: app/orders/[id]/qr-code.tsx:9]`，都不是 fetch antipattern
4. **`requireRole()` helper 抽得乾淨** — `lib/auth.ts:5-19` 一處統一 admin/vendor/user role 檢查 `[SOURCE: lib/auth.ts:5-19]`
5. **`order-summary.ts` / `revenue-model.ts` 純函數分離** — 兩個檔把純資料變換從 server action 抽出來，並配上單元測試 `[SOURCE: app/orders/order-summary.ts]` `[SOURCE: app/vendor/revenue/revenue-model.ts]`
6. **命名英文 / UI 中文** — 整個 codebase 嚴格遵守，變數函式都是英文，只有 UI label 跟 error message 是中文。沒看到 `let xinzeng = ...` 這種混搭
7. **Server Action return 統一格式** — `{ error: string } | { success: true }` 在所有 action 一致
8. **shadcn primitive 不亂改** — `components/ui/*` 都是原樣保留 + class merging，沒有亂在裡面寫業務邏輯
