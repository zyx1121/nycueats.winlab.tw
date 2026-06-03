import { test, expect } from "@playwright/test";

test.describe("首頁", () => {
  test("頁面載入成功，顯示 TSMC Eats", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header h1", { hasText: "TSMC Eats" })).toBeVisible();
  });

  test("顯示餐點列表", async ({ page }) => {
    await page.goto("/");
    const menuLinks = page.locator("main a[href^='/menu/']");
    await expect(menuLinks.first()).toBeVisible({ timeout: 10000 });
    expect(await menuLinks.count()).toBeGreaterThan(0);
  });

  test("Header 顯示目前角色可用的導覽入口", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header h1", { hasText: "TSMC Eats" })).toBeVisible();

    const roleNavLink = page
      .locator("header a[href='/cart'], header a[href='/vendor'], header a[href='/admin']")
      .first();
    await expect(roleNavLink).toBeVisible();

    const href = await roleNavLink.getAttribute("href");
    if (href === "/cart") {
      await expect(page.locator("a[href='/orders']")).toBeVisible();
    } else if (href === "/vendor") {
      await expect(page.getByRole("link", { name: "商家後台" })).toBeVisible();
    } else {
      await expect(page.getByRole("link", { name: "管理後台" })).toBeVisible();
    }
  });
});
