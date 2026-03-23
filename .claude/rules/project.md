# Project Rules

## Stack 版本
- **Next.js 16** (App Router) — 有 breaking changes，實作前先查 `node_modules/next/dist/docs/`
- **Tailwind CSS 4** — 設定方式與 v3 不同
- **Supabase** — Auth + Postgres + RLS
- **shadcn/ui** — 元件以 source code 形式存在 `components/ui/`

## 查文件規則

**任何以下技術的實作，必須先用 context7 取得最新文件：**
- Next.js → `context7: next.js`
- Tailwind CSS → `context7: tailwindcss`
- Supabase → `context7: supabase`
- shadcn/ui → `context7: shadcn/ui`
- Radix UI → `context7: radix-ui`

不可依賴訓練資料中的 API — 版本可能已不同。

## 重要約定
- 請求 APIs 用 async/await Server Actions 或 Route Handlers，不用 useEffect 直接 fetch
- Supabase client：`lib/supabase/client.ts`（browser），`lib/supabase/server.ts`（server/SSR）
- 環境變數從 `.env.local` 讀取，不 hardcode
- DB 型別從 `types/supabase.ts` 引用，由 `supabase gen types` 生成
