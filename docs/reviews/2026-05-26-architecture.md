# Architecture Review — 2026-05-26

[METHOD: source-first]

## Summary

整體架構是合理的「Next.js App Router + Supabase RLS 為 source of truth」配置，role 三角色（user/vendor/admin）以 layout guard + Server Action `requireRole()` 兩層強制，DB schema 12 張表 FK 完整、RLS policy 已優化 initplan。學期報告 25% 架構分數視角下，主要兩個結構性扣分點：(1) data-access layer 沒有抽象（30+ 處平鋪 `.from("xxx")`），加新 vendor capability 或寫單元測試都得改 N 個檔；(2) 「fetch profile.role」這個動作在 `proxy.ts` / `lib/auth.ts` / `components/header.tsx` / `app/admin/layout.tsx` / `app/vendor/layout.tsx` / `app/login/actions.ts` 各複製一次，沒有 user context helper。

## Critical（架構級問題）

- **Auth 三軌制不統一，user 路由全靠 proxy.ts 兜底**：admin/vendor 有 layout guard（明確的 deny-by-default），但 user route group（`/`, `/menu/[id]`, `/cart`, `/orders`, `/profile`）沒有 layout，全靠 `proxy.ts:36-38` 的 `!user → /login` redirect 守。Server Action 內又每個單獨 `getUser()` + null check（cart/actions.ts:8, menu/[id]/actions.ts:19, profile/actions.ts:15）。三層守衛沒有單一進入點，加新 user route 容易漏。建議抽 `(user)` route group 配 layout guard，跟 admin/vendor 結構對稱。`[SOURCE: app/admin/layout.tsx:7-17, app/vendor/layout.tsx:7-17, proxy.ts:29-48]`

- **`.claude/rules/architecture.md` 描述跟實際結構不符**：rules 寫 `app/(user)/`、`app/(vendor)/`、`app/(admin)/` route groups，但 `ls app/` 結果是平鋪 `admin/ vendor/ cart/ menu/ orders/ profile/`，沒有 `(...)` route group 包裝。`[SOURCE: ls /app, .claude/rules/architecture.md:15-18]`。架構文件是 agent / 新人第一手 reference，drift 比沒寫還危險。建議要嘛真的引入 route groups，要嘛把 rules 校正為平鋪事實。

- **No data-access layer — 30+ 處直接 `supabase.from("xxx")`**：grep 顯示 31 個檔案有 raw `.from()` query，`profiles` 表查 role 這件事在 7 處重複（proxy.ts:42, lib/auth.ts:11, header.tsx:17, admin/layout.tsx:12, vendor/layout.tsx:12, login/actions.ts:22, api/pickup/route.ts:15）。`vendors.eq("owner_id", user.id).single()` 模式在 vendor/menu/actions.ts:11, vendor/profile/page.tsx:13, vendor/orders/page.tsx:36, vendor/revenue/actions.ts:87, api/pickup/route.ts:26 重複 5 次。`[SOURCE: grep -rn "from(\"profiles\")" /app /lib /proxy.ts, grep -rn "owner_id" /app /lib]`。學期報告角度：這是「方便寫」對「方便擴」的 tradeoff，目前選了前者。加評價系統就要改 5+ 處 vendor lookup。最小成本修法：把 `requireRole("vendor")` 升級為 `requireVendor()` 直接回 `{ user, supabase, vendor }`（pattern 已存在於 `vendor/menu/actions.ts:7-16`，只是 local-scope 沒抽出）。

## Important（結構性改進機會）

- **`profiles.role: text[]` vs `user_roles` table — schema modeling 偏弱**：role 用 Postgres `text[]` 存（types/supabase.ts:346），優點是 join-free、`is_admin()` RPC function 寫起來簡單；缺點是無法 FK 約束 role 值（可能寫入任意字串）、權限變更無 audit trail、加 role-scoped metadata（例：vendor 廠區）困難。考慮現階段需求（三 role 固定、admin/vendor 變更少），text[] 是 deliberate simplicity 不是 missing modeling — 但學期報告若要展示「可擴展性」，提到 `user_roles` 正規化路徑可以加分。`[SOURCE: types/supabase.ts:338-365, supabase/migrations/20260415000000_profiles_update_admin_policy.sql:3-5]`

- **`proxy.ts` 跟 layout guard 邏輯重疊**：proxy.ts:29-48 已經 `getUser()` + 拿 profile.role 算 default home path，admin/vendor layout 又各自 `getUser()` + 拿 profile.role check 一次。每個 request 至少 2 次 `auth.getUser()` + 2 次 profiles query（layout 還會再加一次 header.tsx 的 profile fetch）。建議：proxy 內把 user + role 塞進 `request.headers`（next.js pattern），下游用 `headers()` 讀，省一輪 DB roundtrip。`[SOURCE: proxy.ts:30-47, app/admin/layout.tsx:7-17, components/header.tsx:11-17]`

- **`api/pickup/route.ts` 是 vendor server action 的重複實作**：route handler 做的事（驗 vendor role → 找 vendor → check ownership → flip picked_up → 若全部 picked_up 就 mark completed）跟 `app/vendor/orders/actions.ts:6-46` 的 `pickUpOrderItem` 邏輯 95% 一樣。QR code scan 走 GET handler 是合理的（瀏覽器直接打開連結），但內部邏輯應該 import 共用 function，不是 copy。`[SOURCE: app/api/pickup/route.ts:5-65, app/vendor/orders/actions.ts:6-46]`

- **Recommendation engine 三函式重複 60% select 字串**：`getTrendingItems` / `getNutritionPicks` / `getRandomPicks` 都重寫一遍 area filter 的 select 字串（`vendors!inner(name, vendor_areas!inner(area_id))`）跟 vendor name unwrap。`[SOURCE: lib/recommendation.ts:39-49, 78-90, 126-135]`。要加第 4 種推薦（README 列的 LLM）就要再 copy 一次。建議抽 `fetchMenuItemsByIds(ids, areaId)` + `mapToRecommendedItem(row)` 兩個 helper。

- **Server-only 純函式跟 server-action 沒分清楚**：`cart-view.ts`、`order-summary.ts`、`revenue-model.ts` 是 pure function（無 `"use server"`、無 DB call），但放在 `app/cart/` / `app/orders/` / `app/vendor/revenue/` 跟 actions.ts 同層。如果這些 file 之後 client 也想用（例：客戶端重新排序），會被 Next.js 的 server boundary 卡住。學期報告角度沒問題（co-location 對小專案是優點），但長期應該 promote 到 `lib/cart/`、`lib/orders/`、`lib/vendor/revenue/`。`[SOURCE: app/cart/cart-view.ts, app/orders/order-summary.ts, app/vendor/revenue/revenue-model.ts]`

- **Shared `MenuItemCard` 是被 user + vendor 同時用的 props-driven 元件**：`components/menu-item-card.tsx:20` 被 `app/menu/[id]/page.tsx`（user 視角）跟 `app/vendor/menu/menu-item-card.tsx:49`（vendor 視角，包了 edit dialog）共用。這是好的 shared abstraction — 圖片暫時隱藏的註解（components/menu-item-card.tsx:41-49）可以清掉。`[SOURCE: components/menu-item-card.tsx:20-52, app/vendor/menu/menu-item-card.tsx:49]`

## Nit（小整理）

- `lib/navigation-rules.ts:7-18` 的 `getHeaderNavigation` 永遠回 `showCart: true, showOrders: true`，目前只有 `showVendorDashboard` / `showAdminDashboard` 跟 role 連動，欄位設計可以再收斂為單一 enum。`[SOURCE: lib/navigation-rules.ts:7-18]`
- `components/header.tsx:86` `import { AreaSelect } from "./area-select"` 寫在檔案底部，違反 ES module 慣例。`[SOURCE: components/header.tsx:84-86]`
- `app/admin/actions.ts` 沒有放在 `app/admin/page.tsx` 旁的子目錄，跟 admin/reports/、admin/users/、admin/vendors/ 的 co-located actions.ts 模式不同調。`[SOURCE: ls /app/admin]`

## What's good（架構亮點 — 可以放進報告）

- **Server Component / Server Action 分工乾淨**：22 個 page/layout/route 全 Server Component，所有 mutation 走 Server Action（`"use server"`），客戶端只負責 interactivity（24 個 `"use client"` 都是 form/dialog/button level）。沒有 client-side `fetch` + `useEffect` 的 anti-pattern。`[SOURCE: grep "use client" 24 files, app/cart/actions.ts:1, app/menu/[id]/actions.ts:1, .claude/rules/project.md:21]`

- **RLS 是真實的 source of truth，不是裝飾品**：`20260328124225_add_fk_indexes_and_optimize_rls.sql` 22 條 policy 覆蓋所有 12 張表，並用 `(SELECT auth.uid())` 寫法觸發 Postgres initplan optimization 避免 per-row re-evaluation；同時補上 12 個 FK index。Server Action 層的 `requireRole()` 只是 defense-in-depth 第二層，真正的權限執行在 DB。學期報告講「資料模型設計」可以強調這點。`[SOURCE: supabase/migrations/20260328124225_add_fk_indexes_and_optimize_rls.sql:5-139]`

- **Slot-limiting 機制走 DB CHECK constraint + trigger**：`daily_slots.reserved_qty` 由 Postgres trigger 原子更新，`CHECK (reserved_qty <= max_qty)` 直接讓 oversell 變成 INSERT 失敗（`error.code === "23514"` 在 `app/menu/[id]/actions.ts:60` 被翻成「此日期已售完」）。把 race condition 推到 DB level 是正確架構決策。`[SOURCE: .claude/rules/architecture.md:57-58, app/menu/[id]/actions.ts:59-62]`

- **Layout guard 跟 Server Action guard 雙層強制**：admin/vendor 路由先在 layout 擋（admin/layout.tsx:9-17, vendor/layout.tsx:9-17），mutation 再走 `lib/auth.ts:5-19` 的 `requireRole()` 二次驗證 — 即使有人繞過 layout（例如直接打 server action），role 仍會被擋。雙層 design 簡潔。`[SOURCE: lib/auth.ts:5-19, app/admin/layout.tsx:9-17, app/admin/actions.ts:23]`

- **Pure function 從 server-action 抽出 + co-located test**：`cart-view.ts` / `order-summary.ts` / `revenue-model.ts` 把 view-model transform 從 server action 抽成純函式，旁邊配對 `*.test.ts`（cart-view.test.ts, order-summary.test.ts, revenue-model.test.ts）。這是 testability-first 的好範例 — DB query 在 action 裡，純邏輯抽出來測。`[SOURCE: app/cart/cart-view.ts:18-30, app/cart/cart-view.test.ts, app/vendor/revenue/revenue-model.ts:111-117, app/vendor/revenue/revenue-model.test.ts]`

- **shadcn/ui 維持 source-in-repo + co-located route-specific component**：`components/ui/` 是 shared primitive，`components/{header, menu-item-card, recommendation-section}.tsx` 是跨 role 共用元件，route-specific dialog/form（`add-to-order-dialog.tsx`、`bulk-slot-dialog.tsx`、`option-groups-editor.tsx`）co-located 在對應 `app/.../` 目錄。boundary 清楚，沒有「啥都丟 components/」的反模式。`[SOURCE: ls components/ vs ls app/menu/[id]/ vs ls app/vendor/menu/]`

- **加新 role 的擴展點明確**：要新增「廠區管理員」介於 admin / vendor，只需 (1) push role string 到 `profiles.role` text[]、(2) 加 `lib/auth.ts:3` Role union type、(3) `lib/navigation-rules.ts:7` 加 nav config、(4) 新增 `app/<role>/layout.tsx` + page。沒有 hard-coded role 跑遍全 codebase 要改的問題（雖然 fetch profile.role 重複 7 處，但 role check 集中在 `requireRole()` + layout 共 5 處）。`[SOURCE: lib/auth.ts:3, lib/navigation-rules.ts:1-18, types/supabase.ts:346]`
