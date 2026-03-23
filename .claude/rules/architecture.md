# Architecture

**架構發生改變時立即更新此檔案，確保 agent 永遠有最新資訊。**

## 目前架構（2026-03-23）

### Tech Stack
- Next.js 16 — App Router
- Tailwind CSS 4
- shadcn/ui (Radix UI primitives)
- Supabase — Auth (Google OAuth) + Postgres + RLS

### 目錄結構
```
app/
  (user)/           # 一般用戶路由 (/, /menu/[id], /cart, /orders)
  (vendor)/         # 商家後台 (/vendor, /vendor/menu, /vendor/orders)
  (admin)/          # 管理員後台 (空殼)
  login/            # 登入頁
  auth/callback/    # Supabase OAuth callback
components/
  ui/               # shadcn/ui 元件
  header.tsx        # 全域 header（含區域選擇、購物車、用戶頭像）
lib/
  supabase/
    client.ts       # browser client
    server.ts       # server client (SSR)
  utils.ts
types/
  supabase.ts       # 自動生成的 DB 型別
```

### DB Tables
- `areas` — 區域（新竹光復校區等）
- `profiles` — 用戶資料（role: text[]）
- `vendors` — 商家
- `vendor_areas` — 商家服務區域 (many-to-many)
- `menu_items` — 餐點
- `daily_slots` — 每日名額（限量核心，有 CHECK constraint）
- `orders` — 預約單
- `order_items` — 預約明細

### 角色
- `user` — 一般員工
- `vendor` — 商家老闆
- `admin` — 福委會（後續實作）
- 一人可多角色（profiles.role: text[]）

### 限量機制
`daily_slots.reserved_qty` 由 Postgres trigger 原子更新，`CHECK (reserved_qty <= max_qty)` 防止超量。
