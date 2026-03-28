import { test, expect } from "@playwright/test";

test.describe("首頁", () => {
  test("頁面載入成功，顯示 NYCU Eats", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header h1", { hasText: "NYCU Eats" })).toBeVisible();
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
