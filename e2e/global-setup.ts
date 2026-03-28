import { chromium } from "@playwright/test";
import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env") });

export default async function globalSetup() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("E2E_EMAIL and E2E_PASSWORD must be set");

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto("http://localhost:3000/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // wait until we leave /login (redirects to / or /?area=...)
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });

  await page.context().storageState({ path: "e2e/.auth/user.json" });
  await browser.close();
}
