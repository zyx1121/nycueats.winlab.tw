# 商家營業額統計 — 設計文件

## Goal

在商家後台新增「營業額統計」頁面，讓商家查看自己店家的月營收與銷售表現。這個頁面概念上接近管理員的營運總覽，但資料範圍只限目前登入商家，不顯示其他商家的營收。

## Scope

- 新增商家後台導覽項目：「營業額統計」
- 新增 `/vendor/revenue` 頁面
- 以供餐日期 `order_items.date` 歸屬月份，不使用訂單建立時間 `orders.created_at`
- 只計入有效訂單狀態：`confirmed`、`completed`
- 排除 `pending`、`cancelled`
- 顯示本月與上月比較、近 30 天趨勢、本月餐點排行
- 支援用 query string 切換統計月份，例如 `/vendor/revenue?year=2026&month=5`

## Non-Goals

- 不新增 DB schema 或 migration
- 不做跨商家排行
- 不做管理員可見的月結報表變更
- 不做 CSV 匯出
- 不處理手續費、平台抽成、退款或稅務欄位

## Data Rules

營收計算來源為 `order_items.qty * order_items.unit_price`。

資料查詢會從目前登入使用者取得 `vendors.owner_id = user.id` 的商家，再查詢該商家底下 `menu_items.vendor_id = vendor.id` 的訂單品項。

月份歸屬使用 `order_items.date`：

- 5 月 30 日下單、6 月 1 日供餐，算 6 月營收
- 6 月 1 日下單、6 月 3 日供餐，算 6 月營收

訂單狀態規則：

- 計入：`confirmed`、`completed`
- 不計入：`pending`、`cancelled`

## Page Design

`/vendor/revenue` 是 Server Component 頁面。頁面上方顯示標題與月份切換控制，主體包含三個區塊：

1. 指標卡片
   - 本月營收
   - 本月訂單數
   - 本月售出份數
   - 營收較上月變化

2. 趨勢圖
   - 顯示近 30 天每日營收
   - 使用供餐日期作為 X 軸資料
   - 沒有資料時顯示「暫無資料」

3. 餐點排行
   - 顯示選定月份內營收最高的餐點
   - 每列顯示餐點名稱、售出份數、營收
   - 排序依營收由高到低

視覺風格沿用管理員後台既有的卡片、細邊框、純 CSS/SVG 圖表，不新增圖表套件。

## Components

新增商家營收專用模組：

- `app/vendor/revenue/page.tsx`
  - 讀取 query string
  - 呼叫資料函式
  - 組合頁面區塊

- `app/vendor/revenue/actions.ts`
  - `getVendorRevenueStats(year, month)`
  - `getVendorRevenueTrend(days)`
  - `getVendorTopMenuItems(year, month, limit)`
  - 所有函式都會檢查商家角色與商家歸屬

- `app/vendor/revenue/revenue-trend-chart.tsx`
  - 顯示每日營收折線圖

- `app/vendor/revenue/revenue-bar-chart.tsx`
  - 顯示餐點營收排行

共用管理員元件可視情況抽出，但優先保持變更範圍小。如果抽共用元件會讓檔案變更過大，商家頁先保留自己的小型圖表元件。

## Access Control

`app/vendor/layout.tsx` 已經檢查使用者是否具有 `vendor` role。營收資料函式仍會再次使用角色檢查，避免只靠 layout 保護。

若使用者沒有綁定商家，頁面顯示：

「尚未綁定商家帳號。」

## Error Handling

- `year` 或 `month` query string 無效時，使用目前年月
- 沒有營收資料時，數字顯示 0，圖表與排行顯示空狀態
- 資料查詢失敗時，不顯示其他商家的資料；頁面以空資料降級呈現

## Testing

測試重點：

- 導覽列出現「營業額統計」並連到 `/vendor/revenue`
- 營收統計只使用 `order_items.date` 篩選月份
- 只計入 `confirmed`、`completed`
- 餐點排行只包含目前商家的餐點
- query string 無效時回到目前年月

優先新增單元測試覆蓋純計算邏輯；頁面整合以現有測試工具能穩定支援的範圍為準。
