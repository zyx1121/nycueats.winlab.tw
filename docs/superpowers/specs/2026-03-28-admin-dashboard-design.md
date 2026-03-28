# 管理員後台 — 設計文件

> Issue #8 + #9 | Milestone v0.4.0

## 目標

建立福委會管理後台：商家審核（申請制）、營運數據 Dashboard、多廠區商家服務範圍管理。

## 路由結構

```
app/admin/
  layout.tsx          — role guard（僅 admin 角色可進入）
  page.tsx            — Dashboard（營運數據）
  vendors/
    page.tsx          — 商家列表（tabs: 待審核 / 啟用中 / 已停用）
    [id]/page.tsx     — 商家詳情（審核操作、服務區域管理）
```

## 商家審核流程

### 狀態機

```
pending → approved → suspended
    ↓
  rejected
```

| 狀態 | 意義 | `is_active` |
|------|------|-------------|
| `pending` | 待審核（商家提交申請） | `false` |
| `approved` | 已核准 | `true` |
| `rejected` | 已拒絕 | `false` |
| `suspended` | 暫停合作（管理員手動停用） | `false` |

### 審核操作

- **核准**：設定 `status = 'approved'`, `is_active = true`，同時指定服務區域（寫入 `vendor_areas`）
- **拒絕**：設定 `status = 'rejected'`
- **停用**：已核准的商家可暫停合作，設定 `status = 'suspended'`, `is_active = false`
- **重新啟用**：暫停的商家可恢復，設定 `status = 'approved'`, `is_active = true`

### 商家詳情頁

顯示：商家名稱、描述、圖片、聯絡 Email、申請時間、目前狀態
操作：核准/拒絕（pending 時）、停用/啟用（approved 時）、編輯服務區域（checkbox 勾選 areas）

## Dashboard 指標

### 訂單概覽
- 本月訂單量 vs 上月（數字 + 增減百分比）
- 本月營收 vs 上月
- 領餐完成率（completed / total confirmed+completed）
- 取消率（cancelled / total）

### 圖表
- 訂單量趨勢折線圖（近 30 天，每日一點）
- 熱門商家 Top 5（依訂單量，橫條圖）
- 熱門餐點 Top 5（依訂單量）
- 各商家營收佔比（列表 + 百分比 bar）

### 資料來源
全部從 `orders` + `order_items` + `menu_items` + `vendors` 聚合查詢，不需要額外 table。

## 多廠區管理

- 核准商家時勾選服務區域（從 `areas` 表取得所有啟用的區域）
- 商家詳情頁可隨時修改服務區域
- 操作寫入 `vendor_areas`（先 delete 該商家的所有關聯，再 insert 勾選的）
- 員工端首頁已有 area 篩選，透過 `vendor_areas` join 過濾

## DB 變更

### Migration: vendors 新增 status 欄位

```sql
ALTER TABLE vendors ADD COLUMN status text NOT NULL DEFAULT 'approved';
```

預設 `'approved'` 確保現有商家不受影響。

### RLS Policy

- `vendors` 新增 admin read/update policy：`'admin' = ANY(profiles.role WHERE profiles.id = auth.uid())`
- `vendor_areas` 新增 admin insert/delete policy
- `orders` / `order_items` 新增 admin read policy（Dashboard 查詢用）

### Admin 測試帳號

需要在 Supabase 建立一個 admin 帳號，`profiles.role` 包含 `'admin'`。

## 技術實作

- Dashboard 圖表：純 CSS bar charts（不引入 chart library，保持簡單）
- 趨勢折線圖：用 SVG polyline 手繪（或簡單的 CSS grid bars 代替）
- Server Components 為主，管理操作用 Server Actions
- 服務區域編輯用 Client Component（checkbox 互動）

## 不在此次範圍

- 商家申請表前端（商家自行提交申請的 UI）— 先由管理員在後台手動操作
- 福委會分區管理（記錄在 QUESTIONS.md）
- 通知系統（核准/拒絕通知商家）
