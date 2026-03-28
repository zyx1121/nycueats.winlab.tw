import { test, expect } from "@playwright/test";

test.describe("菜單頁", () => {
  test("點擊商家進入菜單頁，顯示餐點", async ({ page }) => {
    await page.goto("/");
    // Use the vendor grid (not recommendation section) to find vendor cards
    const vendorGrid = page.locator("main .grid");
    const firstVendor = vendorGrid.locator("a[href^='/menu/']").first();
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
    const vendorGrid = page.locator("main .grid");
    await vendorGrid.locator("a[href^='/menu/']").first().click();
    await expect(page).toHaveURL(/\/menu\/.+/);

    // Wait for client components to hydrate
    await page.waitForLoadState("networkidle");
    const menuItem = page.locator("main .grid button:not([disabled])").first();
    await expect(menuItem).toBeVisible({ timeout: 10000 });
    await menuItem.click();

    const dialog = page.locator("dialog, [role='dialog']");
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator("text=選擇日期")).toBeVisible();
  });
});
