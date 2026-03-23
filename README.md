# NYCU Eats

陽明交大校園訂餐平台，供員工向合作廠商預約訂餐。

## Tech Stack

- **Next.js 16** — App Router
- **Tailwind CSS 4** + **shadcn/ui**
- **Supabase** — Auth (Google OAuth + Email) · Postgres · RLS · Storage

## 功能

- 依校區瀏覽合作廠商與菜單
- 每日限量預約（Postgres trigger 防止超量）
- 餐點自訂選項（加購、口味等）
- 購物車與訂單管理
- 廠商後台：店家資訊、菜單管理、訂單檢視

## 開始開發

```bash
bun install
bun run dev
```

開啟 [http://localhost:3000](http://localhost:3000)

環境變數請參考 `.env.example`（需 Supabase 專案設定）。

## 目錄結構

```
app/
  (user)/     # 一般用戶：首頁、菜單、購物車
  (vendor)/   # 廠商後台：店家資訊、菜單、訂單
  login/      # 登入頁
  auth/       # Supabase OAuth callback
components/
  ui/         # shadcn/ui 元件
lib/
  supabase/   # browser & server client
types/
  supabase.ts # 自動生成的 DB 型別
```

## 範例帳號

詳見 [EXAMPLES.md](./EXAMPLES.md)，所有範例帳號密碼均為 `password123`。
