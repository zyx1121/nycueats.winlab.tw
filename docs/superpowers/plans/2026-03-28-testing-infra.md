# 測試基礎設施 + CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Playwright e2e 測試 + GitHub Actions CI，讓每個 PR 自動跑 lint + build + test。

**Architecture:** Playwright 跑 e2e 測試（webServer 自動啟動 dev server），GitHub Actions workflow 在 PR 時觸發完整 pipeline。測試檔放 `e2e/` 目錄。

**Tech Stack:** Playwright, GitHub Actions, bun

**Spec:** `docs/superpowers/specs/2026-03-28-testing-infra-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `playwright.config.ts` | Playwright 設定（baseURL, webServer, projects） |
| Create | `e2e/home.spec.ts` | 首頁載入測試 |
| Create | `e2e/menu.spec.ts` | 菜單頁測試 |
| Create | `e2e/order-flow.spec.ts` | 下單完整流程 e2e |
| Create | `.github/workflows/ci.yml` | GitHub Actions CI pipeline |
| Modify | `package.json` | 新增 test scripts |
| Modify | `.gitignore` | 新增 Playwright 產出忽略 |

---

### Task 1: Install Playwright + Config

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Install Playwright**

```bash
bun add -d @playwright/test
bunx playwright install chromium
```

- [ ] **Step 2: Add test scripts to package.json**

Add to `scripts` in `package.json`:

```json
"test": "playwright test",
"test:ui": "playwright test --ui"
```

- [ ] **Step 3: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 4: Add Playwright outputs to `.gitignore`**

Append to `.gitignore`:

```
# Playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

- [ ] **Step 5: Create `e2e/` directory**

```bash
mkdir -p e2e
```

- [ ] **Step 6: Verify Playwright runs (no tests yet)**

```bash
bun run test
```

Expected: "No tests found" or similar (0 tests, no errors).

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts package.json bun.lockb .gitignore e2e/
git commit -m "chore(test): setup Playwright and test scripts"
```

---

### Task 2: Home Page Test

**Files:**
- Create: `e2e/home.spec.ts`

- [ ] **Step 1: Create `e2e/home.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test.describe("首頁", () => {
  test("頁面載入成功，顯示 NYCU Eats", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1", { hasText: "NYCU Eats" })).toBeVisible();
  });

  test("顯示商家列表", async ({ page }) => {
    await page.goto("/");
    const vendorCards = page.locator("main a[href^='/menu/']");
    await expect(vendorCards.first()).toBeVisible();
    expect(await vendorCards.count()).toBeGreaterThan(0);
  });

  test("Header 有購物車和訂單連結", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("a[href='/cart']")).toBeVisible();
    await expect(page.locator("a[href='/orders']")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test**

```bash
bun run test e2e/home.spec.ts
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/home.spec.ts
git commit -m "test: add home page e2e tests"
```

---

### Task 3: Menu Page Test

**Files:**
- Create: `e2e/menu.spec.ts`

- [ ] **Step 1: Create `e2e/menu.spec.ts`**

```typescript
import { test, expect } from "@playwright/test";

test.describe("菜單頁", () => {
  test("點擊商家進入菜單頁，顯示餐點", async ({ page }) => {
    await page.goto("/");
    // 點第一個商家
    const firstVendor = page.locator("main a[href^='/menu/']").first();
    const vendorName = await firstVendor.locator("p").first().textContent();
    await firstVendor.click();

    // 確認進入菜單頁
    await expect(page).toHaveURL(/\/menu\/.+/);
    await expect(page.locator("h1")).toContainText(vendorName!);

    // 確認有餐點按鈕
    const menuItems = page.locator("main button");
    await expect(menuItems.first()).toBeVisible();
    expect(await menuItems.count()).toBeGreaterThan(0);
  });

  test("點擊餐點彈出加入預約 dialog", async ({ page }) => {
    await page.goto("/");
    await page.locator("main a[href^='/menu/']").first().click();
    await expect(page).toHaveURL(/\/menu\/.+/);

    // 點第一個餐點
    await page.locator("main button").first().click();

    // 確認 dialog 出現，有「選擇日期」和「加入預約單」
    const dialog = page.locator("dialog, [role='dialog']");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("text=選擇日期")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test**

```bash
bun run test e2e/menu.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
git add e2e/menu.spec.ts
git commit -m "test: add menu page e2e tests"
```

---

### Task 4: Order Flow E2E Test

**Files:**
- Create: `e2e/order-flow.spec.ts`

- [ ] **Step 1: Create `e2e/order-flow.spec.ts`**

This test covers the full flow: login → add to cart → checkout → verify order.

```typescript
import { test, expect } from "@playwright/test";

test.describe("訂單流程", () => {
  test.beforeEach(async ({ page }) => {
    // 登入
    await page.goto("/login");
    await page.getByRole("textbox", { name: "Email" }).fill("morning.bites@nycueats.dev");
    await page.getByRole("textbox", { name: "密碼" }).fill("password123");
    await page.getByRole("main").getByRole("button", { name: "登入", exact: true }).click();
    await page.waitForURL("/");
  });

  test("加入購物車 → 結帳 → 訂單顯示已確認", async ({ page }) => {
    // 進入一個有餐點的商家菜單
    await page.locator("main a[href^='/menu/']").first().click();
    await expect(page).toHaveURL(/\/menu\/.+/);

    // 點第一個餐點
    await page.locator("main button").first().click();
    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible();

    // 選日期（點 combobox → 選第一個 option）
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();

    // 加入預約單
    await dialog.getByRole("button", { name: /加入預約單/ }).click();
    await expect(dialog).not.toBeVisible();

    // 前往購物車
    await page.goto("/cart");
    await expect(page.locator("h1", { hasText: "我的預約單" })).toBeVisible();

    // 確認有品項
    const cartItems = page.locator("main .border.rounded-lg");
    await expect(cartItems.first()).toBeVisible();

    // 結帳確認
    await page.getByRole("button", { name: /結帳確認/ }).click();
    const confirmDialog = page.locator("[role='dialog']");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "確認結帳" }).click();

    // 應導向 /orders
    await page.waitForURL("/orders");
    await expect(page.locator("h1", { hasText: "我的訂單" })).toBeVisible();

    // 確認訂單狀態為「已確認」
    await expect(page.locator("text=已確認").first()).toBeVisible();
  });

  test("清空購物車", async ({ page }) => {
    // 先加一個品項
    await page.locator("main a[href^='/menu/']").first().click();
    await expect(page).toHaveURL(/\/menu\/.+/);
    await page.locator("main button").first().click();
    const dialog = page.locator("[role='dialog']");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option").first().click();
    await dialog.getByRole("button", { name: /加入預約單/ }).click();
    await expect(dialog).not.toBeVisible();

    // 前往購物車
    await page.goto("/cart");
    await expect(page.getByRole("button", { name: "清空購物車" })).toBeVisible();

    // 清空
    await page.getByRole("button", { name: "清空購物車" }).click();
    const cancelDialog = page.locator("[role='dialog']");
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.getByRole("button", { name: "確定清空" }).click();

    // 購物車應該變空
    await expect(page.locator("text=預約單是空的")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test**

```bash
bun run test e2e/order-flow.spec.ts
```

Expected: 2 tests pass. Note: these tests depend on Supabase email auth being enabled and test data existing.

- [ ] **Step 3: Commit**

```bash
git add e2e/order-flow.spec.ts
git commit -m "test(orders): add order flow e2e tests"
```

---

### Task 5: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint-and-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

      - name: Build
        run: bun run build
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY }}

  e2e:
    runs-on: ubuntu-latest
    needs: lint-and-build
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install Playwright browsers
        run: bunx playwright install chromium --with-deps

      - name: Run e2e tests
        run: bun run test
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY }}

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

- [ ] **Step 2: Verify YAML syntax**

```bash
cat .github/workflows/ci.yml | head -5
```

Expected: Valid YAML, no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for lint, build, and e2e tests"
```

---

### Task 6: Update README + Docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add testing section to README**

Add after the "開始開發" section:

```markdown
## 測試

```bash
bun run test        # 跑 e2e 測試
bun run test:ui     # Playwright UI 模式
```

CI 會在每個 PR 自動執行 lint + build + e2e test（見 `.github/workflows/ci.yml`）。
```

- [ ] **Step 2: Commit**

```bash
git add README.md docs/
git commit -m "docs: add testing section to README and specs"
```

---

### Task 7: Set GitHub Secrets + Verify CI

- [ ] **Step 1: Add GitHub secrets**

The CI needs Supabase env vars. Add them as GitHub repository secrets:

```bash
gh secret set NEXT_PUBLIC_SUPABASE_URL --body "https://xgbxjkvatffsjqmgtmwe.supabase.co"
gh secret set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY --body "sb_publishable_thxuzUky6jsciXr_7L4nDQ_wpJ7TvqY"
```

- [ ] **Step 2: Push branch and create PR**

```bash
git push -u origin test/ci-and-e2e
gh pr create --title "test: 建立測試基礎設施與 CI pipeline" --milestone "v1.0.0 — 正式交付" --body "$(cat <<'PREOF'
## Summary
- 建立 Playwright e2e 測試框架
- 新增首頁、菜單頁、訂單流程 e2e 測試
- 新增 GitHub Actions CI（lint + build + e2e）

## Test plan
- [ ] `bun run test` 本地通過
- [ ] GitHub Actions CI 通過
- [ ] PR 顯示 check 狀態

Closes #7

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PREOF
"
```

- [ ] **Step 3: Verify CI runs on PR**

Check GitHub Actions tab or:

```bash
gh run list --limit 1
```
