import { test, expect, type Page } from "@playwright/test";

async function addItemToCart(page: Page) {
  await page.goto("/");
  // Use the vendor grid to avoid clicking recommendation cards
  const vendorGrid = page.locator("main .grid");
  await vendorGrid.locator("a[href^='/menu/']").first().click();
  await expect(page).toHaveURL(/\/menu\/.+/, { timeout: 10000 });

  // Wait for page to be ready
  await page.waitForLoadState("networkidle");

  // Click a menu item that is NOT sold out (no "本週已售完" text)
  const availableItem = page.locator("main .grid button:not(:has-text('本週已售完'))").first();
  await expect(availableItem).toBeVisible({ timeout: 10000 });
  await availableItem.click();

  const dialog = page.locator("[role='dialog']");
  await expect(dialog).toBeVisible({ timeout: 10000 });

  // Open date select and pick first option
  await dialog.locator("button[role='combobox']").first().click();
  const firstOption = page.locator("[role='option']").first();
  await expect(firstOption).toBeVisible({ timeout: 5000 });
  await firstOption.click();

  // Click "加入預約單" button (contains price)
  const addBtn = dialog.locator("button", { hasText: "加入預約單" });
  await expect(addBtn).toBeEnabled({ timeout: 5000 });
  await addBtn.click();

  await expect(dialog).not.toBeVisible({ timeout: 5000 });
}

test.describe.configure({ mode: "serial" });

test.describe("訂單流程", () => {
  test("加入購物車 → 結帳 → 訂單顯示已確認", async ({ page }) => {
    await addItemToCart(page);

    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1", { hasText: "我的預約單" })).toBeVisible();

    // Retry navigation if cart data hasn't propagated yet
    const checkoutBtn = page.locator("button", { hasText: "結帳確認" });
    if (!(await checkoutBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      await page.reload();
      await page.waitForLoadState("networkidle");
    }

    // Click checkout trigger button
    await checkoutBtn.click();

    const confirmDialog = page.locator("[role='dialog']");
    await expect(confirmDialog).toBeVisible();

    await confirmDialog.locator("button", { hasText: "確認結帳" }).click();

    await page.waitForURL("/orders", { timeout: 10000 });
    await expect(page.locator("text=已確認").first()).toBeVisible({ timeout: 10000 });
  });

  test("清空購物車", async ({ page }) => {
    await addItemToCart(page);

    await page.goto("/cart");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1", { hasText: "我的預約單" })).toBeVisible();

    // Retry navigation if cart data hasn't propagated yet
    const clearBtn = page.locator("button", { hasText: "清空購物車" });
    if (!(await clearBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      await page.reload();
      await page.waitForLoadState("networkidle");
    }

    await clearBtn.click();

    const cancelDialog = page.locator("[role='dialog']");
    await expect(cancelDialog).toBeVisible();

    await cancelDialog.locator("button", { hasText: "確定清空" }).click();

    await expect(page.locator("text=預約單是空的")).toBeVisible({ timeout: 5000 });
  });
});
