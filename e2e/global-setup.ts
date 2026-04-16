import { chromium } from "@playwright/test";
import { config } from "dotenv";
import path from "path";
import fs from "fs";

// Load .env for local dev; CI provides env vars via secrets
config({ path: path.resolve(process.cwd(), ".env") });

export default async function globalSetup() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("E2E_EMAIL and E2E_PASSWORD must be set");

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to login and wait for the form to be ready
  await page.goto("http://localhost:3000/login");
  await page.waitForSelector('input[name="email"]', { timeout: 30000 });

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for either redirect (success) or error message (failure)
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
  } catch {
    // Save screenshot for debugging
    fs.mkdirSync("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/global-setup-failure.png" });
    const content = await page.content();
    console.error("Login failed. Page URL:", page.url());
    console.error("Page content snippet:", content.slice(0, 500));
    throw new Error("Login did not redirect within 30s. Screenshot saved to test-results/global-setup-failure.png");
  }

  const landingPath = new URL(page.url()).pathname;
  if (landingPath.startsWith("/vendor") || landingPath.startsWith("/admin")) {
    const orderCatalogButton = page.getByRole("button", { name: "點餐目錄" });
    await orderCatalogButton.click();
    await page.waitForURL("http://localhost:3000/", { timeout: 30000 });
  }

  await page.context().storageState({ path: "e2e/.auth/user.json" });
  await browser.close();
}
