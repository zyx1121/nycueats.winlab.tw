# 批次名額建立（Bulk Slot Creation）設計文件

## 問題

商家的 `daily_slots` 只在手動開啟編輯 Dialog 並 blur 輸入框時才會寫入 DB。一旦已建立的 slot 日期全部過期，使用者就無法訂餐，直到商家重新手動設定。這造成每週都需要重複操作，容易遺漏。

## 解決方案概述

在 `/vendor/menu` 菜單管理頁面新增一個**智慧 Banner + 批次名額設定 Dialog**，讓商家一次設定所有餐點未來 14 天的名額。

## 設計決策

| 決策 | 選擇 | 原因 |
|------|------|------|
| 觸發方式 | 半自動（Banner + 按鈕） | 商家主動操作，不意外覆蓋已有設定 |
| 實作策略 | Server Action 批次 upsert | 與現有 `setDailySlot` 模式一致，不需新增 DB function |
| 天數範圍 | 14 個日曆天 | 2 排 × 7 天排版整齊，非營業日灰掉，直覺呈現「這週和下週」 |

---

## Banner 元件

### 觸發條件

針對所有 `is_available = true` 的餐點，取其 `daily_slots` 中最遠的日期。若最遠日期距今 ≤ 10 天（或完全沒有未來 slot），則顯示 Banner。

> 使用者需要提前 7 天訂餐，所以 10 天閾值提供 3 天緩衝。

### Banner 內容

```
⚠️  {N} 個餐點的訂餐名額即將用完
    名額到期後使用者將無法訂餐。
                              [建立未來名額]
```

### 成功狀態

儲存完成後，Banner 變為綠色成功訊息（例：「已成功建立 4/16–4/26 的名額」），頁面同時 revalidate。

---

## 餐點卡片 Badge

在 `VendorMenuItemCard` 的餐點名稱旁顯示小標籤：

| 狀態 | Badge | 顏色 |
|------|-------|------|
| slot ≤ 10 天 | `名額將盡` | 橘色（warning） |
| 完全無未來 slot | `無名額` | 紅色（destructive） |
| 名額充足（> 10 天） | 不顯示 | — |

---

## 批次名額設定 Dialog

### 開啟方式

點擊 Banner 上的「建立未來名額」按鈕。

### 結構

全寬 Dialog（`sm:max-w-6xl`），可捲動。頂部顯示一次 tip，接著每個 `is_available = true` 的餐點為一個區塊：

```
┌──────────────────────────────────────────────────────────┐
│  建立未來名額                                       [✕]  │
│                                                          │
│  ℹ️ 黯淡的格子表示尚未設定名額，儲存時將使用預設供應量。     │
│                                                          │
│  ┌─ {餐點名稱} ────────────────────────────────────────┐ │
│  │  📈 ▁▂▃▅▃▂▄  近 7 天平均 8.2 份/天                  │ │
│  │                                                      │ │
│  │    日     一     二     三     四     五     六       │ │
│  │   4/13   4/14   4/15   4/16   4/17   4/18   4/19    │ │
│  │   [10]   [10]   [10]   [10]   [══]   [══]   [10]    │ │
│  │    已8    已5    已3                                  │ │
│  │                                                      │ │
│  │   4/20   4/21   4/22   4/23   4/24   4/25   4/26    │ │
│  │   {10}   {10}   {10}   {10}   [══]   [══]   {10}    │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                          │
│                                    [取消]  [儲存名額]     │
└──────────────────────────────────────────────────────────┘
```

### 格子狀態

| 樣式 | 意義 | 互動 |
|------|------|------|
| `[10]` 正常色 | DB 已有 slot | 可編輯 |
| `{10}` 暗淡色 | DB 無 slot，預填 `default_max_qty` | 可編輯，修改後變正常色 |
| `[══]` 灰底 | 非營業日（不在 `operating_days`）或過去日期 | 禁用 |
| `已訂N` 小字 | 已有訂單數量 | 僅顯示，出現在有 slot 的格子下方 |

### 日期範圍與排列

- 兩排固定以**週日為第一天**，呈現兩個完整日曆週
- 第一排：本週（包含今天所在的那一週，日～六）
- 第二排：下週（日～六）
- **過去日期**：灰底禁用，但仍顯示已設定名額與已訂數量（作為歷史參考）
- **非營業日**：灰底禁用
- 若 `operating_days` 為 null 或空陣列 → 視為全週營業，僅過去日期灰掉

---

## 儲存流程

```
使用者按「儲存名額」
  │
  ├─ 檢查是否有 untouched 的暗淡格子
  │    │
  │    ├─ 有 → 開啟確認 Dialog
  │    │        內容：
  │    │          「以下餐點尚有未設定的日期，
  │    │           儲存時將使用各餐點的預設供應量：
  │    │            - 排骨便當：10 份/天（5 天未設定）
  │    │            - 雞腿便當：8 份/天（5 天未設定）」
  │    │
  │    │        [取消] → 回到編輯畫面，不丟失已編輯內容
  │    │        [確認建立] → 繼續儲存
  │    │
  │    └─ 無 → 直接儲存
  │
  ↓
呼叫 bulkUpsertSlots Server Action
  → supabase.from('daily_slots').upsert(slots[], { onConflict: 'menu_item_id,date' })
  → revalidatePath('/vendor/menu')
  → revalidatePath('/menu', 'layout')  // 使用者端菜單頁也需刷新
  ↓
成功 → 關閉 Dialog，Banner 變為綠色成功訊息，頁面刷新
```

---

## 銷量趨勢

### 資料查詢

```sql
SELECT oi.menu_item_id,
       o.created_at::date AS day,
       SUM(oi.quantity)   AS qty
FROM   order_items oi
JOIN   orders o ON o.id = oi.order_id
WHERE  o.created_at >= NOW() - INTERVAL '7 days'
  AND  o.status IN ('confirmed', 'completed', 'picked_up')
GROUP  BY oi.menu_item_id, day
```

### 顯示邏輯

| 有資料天數 | 顯示 |
|-----------|------|
| 0 天 | 「尚無銷售資料」+ 灰色平坦線 |
| 1–6 天 | 「近 {N} 天平均 {avg} 份/天」+ sparkline（無資料日補 0） |
| 7 天 | 「近 7 天平均 {avg} 份/天」+ sparkline |

### Sparkline

- 純 SVG 內嵌，不引入第三方圖表庫
- 7 個資料點，約 80×24px
- 無資料日補 0

---

## 修改清單

| 檔案 | 操作 | 說明 |
|------|------|------|
| `app/vendor/menu/page.tsx` | 修改 | vendor 查詢加 `operating_days`；加銷量查詢；計算到期狀態；渲染 Banner |
| `app/vendor/menu/actions.ts` | 修改 | 新增 `bulkUpsertSlots` Server Action |
| `app/vendor/menu/bulk-slot-dialog.tsx` | 新增 | 批次名額設定 Dialog |
| `app/vendor/menu/bulk-slot-confirm-dialog.tsx` | 新增 | 儲存確認彈窗 |
| `app/vendor/menu/sparkline.tsx` | 新增 | 純 SVG sparkline 元件 |
| `app/vendor/menu/menu-item-card.tsx` | 修改 | 接收到期狀態 prop，顯示 badge |

### 不修改

- `menu-item-edit-dialog.tsx` — 單一餐點編輯照舊
- DB schema — 不需要 migration，現有 `daily_slots` 結構已足夠
- RLS — 現有 vendor 的 INSERT/UPDATE policy 已涵蓋
