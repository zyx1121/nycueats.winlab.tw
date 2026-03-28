# NYCU Eats

陽明交大校園訂餐平台 — 員工向合作商家預約外送餐點，解決廠區用餐疲勞問題。

## Tech Stack

- **Next.js 16** — App Router, Server Components
- **Tailwind CSS 4** + **shadcn/ui** (Radix UI)
- **Supabase** — Auth (Google OAuth + Email) · Postgres · RLS · Storage

## 已實作功能

### 員工端
- 依校區（area）篩選合作商家
- 瀏覽商家菜單、每日剩餘名額
- 餐點自訂選項（單選 / 多選，價格加減）
- 購物車管理（依日期分組、移除品項）
- 建立預約訂單（Postgres trigger 原子扣量，防止超賣）
- 個人資料管理（姓名、所屬區域）
- Google OAuth / Email 登入

### 商家端
- 店家資訊編輯（名稱、描述、圖片、營業狀態、營業日）
- 菜單管理（新增 / 編輯 / 刪除 / 上下架）
- 每日限量名額設定（未來 7 天）
- 自訂選項組管理（選項群組 + 個別選項）
- 訂單匯總檢視（依日期彙整數量與金額）
- 圖片上傳（商家頭圖 + 餐點圖片，存 Supabase Storage）

### 基礎建設
- Server / Client Component 分離，Server Actions 處理資料異動
- RLS 控管資料存取
- 每個路由都有 `loading.tsx` skeleton
- 角色系統（user / vendor / admin，一人可多角色）
- 商家路由守衛（role-based layout）
- 管理員後台（商家審核、營運數據 Dashboard、多廠區服務範圍管理）
- 錯誤處理（error.tsx / global-error.tsx / not-found.tsx）
- CI pipeline（GitHub Actions：lint + build + e2e test）
- Playwright e2e 測試（首頁、菜單、訂單流程）

## 尚未實作

| 分類 | 功能 | 對應需求 |
|------|------|----------|
| 員工端 | 餐點推薦引擎（天氣 / 銷量 / 營養） | 基本需求 |
| 領餐 | 配送標籤列印（多種印表機格式） | 基本需求 |
| 帳務 | 月結帳款報表 + 薪資扣款整合 | 進階需求 |

## 開始開發

```bash
bun install
bun run dev
```

開啟 [http://localhost:3000](http://localhost:3000)

環境變數請參考 `.env.example`（需 Supabase 專案設定）。

## 測試

```bash
bun run test        # 跑 e2e 測試（Playwright）
bun run test:ui     # Playwright UI 模式
```

CI 會在每個 PR 自動執行 lint + build + e2e test（見 `.github/workflows/ci.yml`）。

## 目錄結構

```
app/
  (user)/           # 員工端：首頁、菜單、購物車、個人資料
  (vendor)/         # 商家後台：店家資訊、菜單管理、訂單檢視
  (admin)/          # 管理員後台：營運總覽、商家管理
  login/            # 登入頁
  auth/callback/    # Supabase OAuth callback
components/
  ui/               # shadcn/ui 元件
  header.tsx        # 全域 header
lib/
  supabase/         # browser & server client
types/
  supabase.ts       # Supabase 自動生成 DB 型別
```

## 範例帳號

詳見 [EXAMPLES.md](./EXAMPLES.md)，所有範例帳號密碼均為 `password123`。
