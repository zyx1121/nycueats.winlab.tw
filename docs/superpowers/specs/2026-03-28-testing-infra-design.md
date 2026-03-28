# 測試基礎設施 + CI — 設計文件

> Issue #7 | Milestone v1.0.0

## 目標

建立測試基礎設施與 CI pipeline，讓每個 PR 自動跑 lint + build + e2e test。先覆蓋核心流程，後續隨功能開發逐步擴充。

## 技術選擇

- **Playwright** — e2e 測試框架，模擬真實使用者操作
- **GitHub Actions** — CI，PR 觸發自動測試
- **ESLint** — 已有，CI 一起跑
- **TypeScript check** — `bun run build` 包含 type check

## CI Pipeline

```yaml
觸發：PR opened / updated / push to main
步驟：
  1. bun install
  2. bun run lint
  3. bun run build
  4. bun run test（playwright）
```

## package.json scripts

```json
{
  "test": "playwright test",
  "test:ui": "playwright test --ui"
}
```

## Playwright 設定

- `playwright.config.ts` 放專案根目錄
- `webServer` 設定自動啟動 `bun run dev`，等待 localhost:3000
- 只跑 Chromium（CI 速度考量，本地可跑全部）
- 測試檔案放 `e2e/` 目錄
- baseURL: `http://localhost:3000`

## 核心測試案例（最小可交付）

### 1. 首頁載入 (`e2e/home.spec.ts`)
- 頁面載入成功
- 顯示商家列表（至少 1 個商家卡片）
- Header 顯示 NYCU Eats

### 2. 菜單頁 (`e2e/menu.spec.ts`)
- 點擊商家 → 進入菜單頁
- 顯示餐點列表
- 點擊餐點 → 彈出加入預約 dialog

### 3. 訂單流程 (`e2e/order-flow.spec.ts`)
- 登入（email + password）
- 加品項到購物車
- 前往購物車 → 顯示品項
- 結帳確認 → 導向 /orders
- 訂單顯示「已確認」

### 測試帳號

使用現有範例帳號 `morning.bites@nycueats.dev` / `password123`。需要 Supabase email auth 啟用。

## 不在此次範圍

- Server action unit test（後續逐步加）
- 全頁面覆蓋（後續逐步加）
- 視覺回歸測試
- 商家端 e2e（後續加）
