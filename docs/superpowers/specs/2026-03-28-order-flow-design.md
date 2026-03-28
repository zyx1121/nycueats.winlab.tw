# 訂單流程補完 — 設計文件

> Issue #2 | Milestone v0.2.0

## 目標

補完訂單生命週期：結帳確認、訂單紀錄、領餐機制。

## 狀態機

```
pending ──→ confirmed ──→ completed
  │
  └──→ cancelled
```

| 狀態 | 意義 | 誰觸發 | 可執行動作 |
|------|------|--------|-----------|
| `pending` | 購物車 | 系統（加品項時自動建立） | 增刪品項、結帳、取消 |
| `confirmed` | 已結帳，鎖定 | 員工按「結帳確認」 | 列印標籤、逐筆領餐 |
| `completed` | 全部領取完畢 | 系統（所有品項 picked_up） | 僅查看 |
| `cancelled` | 已取消 | 員工（僅 pending 可取消） | 僅查看 |

## DB 變更

### Migration: order_items 新增 picked_up 欄位

```sql
ALTER TABLE order_items ADD COLUMN picked_up boolean NOT NULL DEFAULT false;
```

- `picked_up = true` 表示該品項已被領取
- 當同一筆 order 的所有 order_items 都 `picked_up = true` 時，order.status 自動變 `completed`
- 自動完成由 server action 處理（非 trigger），避免複雜度

### 取消訂單的名額釋放

取消 pending order 時，刪除其所有 order_items → 現有 trigger `sync_reserved_qty` 會自動扣回 `reserved_qty`。流程：

1. 確認 order.status = 'pending'
2. DELETE order_items WHERE order_id = ?（trigger 釋放名額）
3. UPDATE orders SET status = 'cancelled'

## 頁面設計

### 1. `/cart` — 購物車（修改）

現有頁面，新增：
- **「結帳確認」按鈕**（底部固定，顯示總金額）
- 點擊後 confirm dialog：「確認結帳？結帳後無法修改」
- 確認 → `confirmOrder()` → 導向 `/orders`
- **「清空購物車」按鈕**（取消整筆 pending order）

### 2. `/orders` — 訂單紀錄（新頁面）

- 顯示所有非 pending 訂單（confirmed / completed / cancelled）
- **Infinite scroll**：每次載入 10 筆，滾到底部載入更多
- 每筆訂單卡片顯示：
  - 訂單編號（id 前 8 碼）
  - 狀態 badge（confirmed=藍 / completed=綠 / cancelled=灰）
  - 建立日期
  - 品項數量、總金額
  - 點擊展開 → 導向 `/orders/[id]`

### 3. `/orders/[id]` — 訂單明細（新頁面）

- 訂單資訊：編號、狀態、建立時間
- 品項列表：品名、選項、數量、單價、領餐狀態
- **QR Code 區域**（僅 confirmed 訂單顯示）：
  - 每個未領取的 order_item 一個 QR code
  - QR 內容：`order_item_id`（UUID）
  - 已領取的品項顯示打勾，不顯示 QR

### 4. `/vendor/orders` — 商家訂單管理（重寫）

#### 批次檢視（預設）
- 依日期分組
- 每個日期：品項名 × 數量、總金額
- 「展開」按鈕 → 顯示逐筆訂單

#### 逐筆檢視（展開後）
- 每筆 order_item：訂購人、品名、選項、數量、領餐狀態
- 「標記已領取」按鈕（單筆）
- 「全部已領取」按鈕（批次，當日全部標記）

#### 篩選
- 狀態篩選：confirmed / completed / 全部
- 日期範圍：預設未來 7 天

#### 列印標籤
- 「列印標籤」按鈕（依日期批次）
- 標籤內容：訂單短編號、品名、選項、數量、訂購人姓名、QR code
- 格式：先用 CSS `@media print` 實作基本版，貼紙機格式後續討論

### 5. Header 導覽更新

- 新增「我的訂單」連結（購物車圖示旁）

## Server Actions

### `confirmOrder(orderId: string)`
1. 驗證 auth + order 屬於該用戶
2. 驗證 status = 'pending'
3. UPDATE orders SET status = 'confirmed'
4. revalidatePath('/cart', '/orders')

### `cancelOrder(orderId: string)`
1. 驗證 auth + order 屬於該用戶
2. 驗證 status = 'pending'
3. DELETE FROM order_items WHERE order_id（trigger 釋放名額）
4. UPDATE orders SET status = 'cancelled'
5. revalidatePath('/cart', '/orders')

### `pickUpOrderItem(orderItemId: string)`
1. 驗證 auth（商家角色）
2. 驗證 order_item 屬於該商家的 menu_item
3. UPDATE order_items SET picked_up = true
4. 檢查同筆 order 是否全部 picked_up → 如果是，UPDATE orders SET status = 'completed'
5. revalidatePath('/vendor/orders', '/orders')

### `batchPickUp(orderItemIds: string[])`
1. 同 pickUpOrderItem 但批次處理
2. 逐筆驗證歸屬後批次更新

### `getOrders(page: number, limit: number = 10)`
1. 驗證 auth
2. SELECT orders + order_items + options，排除 pending
3. ORDER BY created_at DESC
4. OFFSET / LIMIT 分頁
5. 回傳 `{ orders, hasMore }`

## QR Code

- 使用 `qrcode` npm 套件產生 SVG
- 內容：order_item UUID
- 商家端掃碼：可用手機相機或任何 QR scanner app，開啟一個 URL 如 `/api/pickup?item={id}`，自動呼叫 `pickUpOrderItem`

## 不在此次範圍

- 配送標籤的多種印表機格式（記錄於 QUESTIONS.md）
- 通知系統（email / push）
- 商家端掃碼用的原生 camera UI（先用外部 QR scanner app + URL）
