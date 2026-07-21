import { expect, test } from "@playwright/test";

test.describe("前端導覽與搜尋結果", () => {
  test("搜尋結果頁依 URL query 顯示標題與餐點卡片", async ({ page }) => {
    await page.goto("/search?q=飯");

    await expect(page.locator("main h1")).toContainText("「飯」的搜尋結果");

    const firstResult = page.locator("main a[href^='/menu/']").first();
    await expect(firstResult).toBeVisible();
    await expect(firstResult).toHaveAttribute("href", /\/menu\/.+#item-.+/);
  });

  test("Header 的商家後台入口導向菜單管理頁", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "商家後台" }).click();

    await expect(page).toHaveURL(/\/vendor\/menu$/);
    await expect(page.getByRole("heading", { level: 1, name: /菜單管理/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "新增餐點" })).toBeVisible();
  });
});
