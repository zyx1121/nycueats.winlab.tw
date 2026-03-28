import { test, expect } from "@playwright/test";

test.describe("菜單頁", () => {
  test("點擊商家進入菜單頁，顯示餐點", async ({ page }) => {
    await page.goto("/");
    const firstVendor = page.locator("main a[href^='/menu/']").first();
    const vendorName = await firstVendor.locator("p").first().textContent();
    await firstVendor.click();

    await expect(page).toHaveURL(/\/menu\/.+/);
    await expect(page.locator("main h1")).toContainText(vendorName!);

    const menuItems = page.locator("main button");
    await expect(menuItems.first()).toBeVisible();
    expect(await menuItems.count()).toBeGreaterThan(0);
  });

  test("點擊餐點彈出加入預約 dialog", async ({ page }) => {
    await page.goto("/");
    await page.locator("main a[href^='/menu/']").first().click();
    await expect(page).toHaveURL(/\/menu\/.+/);

    await page.locator("main button").first().click();

    const dialog = page.locator("dialog, [role='dialog']");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("text=選擇日期")).toBeVisible();
  });
});
