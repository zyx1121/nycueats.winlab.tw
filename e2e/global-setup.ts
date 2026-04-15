import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "path";
import fs from "fs";

// Load .env for local dev; CI provides env vars via secrets
config({ path: path.resolve(process.cwd(), ".env") });

/**
 * Seed daily_slots for all active open vendors so CI always has available menu items.
 * Only seeds dates that match each vendor's operating_days, so the menu page filter passes.
 * Uses the service role key to bypass RLS.
 */
async function seedAvailableSlots() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.warn("[seed] SUPABASE_SERVICE_ROLE_KEY not set — skipping slot seeding");
    return;
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Step 1: get active, open vendors
  const { data: vendors, error: vendorErr } = await admin
    .from("vendors")
    .select("id, operating_days")
    .eq("is_active", true)
    .eq("is_open", true);

  if (vendorErr || !vendors?.length) {
    console.warn("[seed] No active vendors found:", vendorErr?.message);
    return;
  }

  // Step 2: get all available menu items for those vendors
  const vendorIds = vendors.map((v) => v.id);
  const { data: items, error: itemErr } = await admin
    .from("menu_items")
    .select("id, vendor_id")
    .eq("is_available", true)
    .in("vendor_id", vendorIds);

  if (itemErr || !items?.length) {
    console.warn("[seed] No available menu items found:", itemErr?.message);
    return;
  }

  // Build a vendor → operating_days lookup
  const opDaysByVendor = Object.fromEntries(vendors.map((v) => [v.id, v.operating_days ?? []]));

  // Step 3: generate slots only for dates that match operating_days
  const today = new Date();
  const slots: { menu_item_id: string; date: string; max_qty: number; reserved_qty: number }[] = [];

  for (const item of items) {
    const operatingDays: number[] = opDaysByVendor[item.vendor_id] ?? [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dow = d.getDay();
      if (operatingDays.length === 0 || operatingDays.includes(dow)) {
        slots.push({
          menu_item_id: item.id,
          date: d.toISOString().split("T")[0],
          max_qty: 20,
          reserved_qty: 0,
        });
      }
    }
  }

  if (!slots.length) {
    console.warn("[seed] No slots to seed — check vendor operating_days vs upcoming 7 days");
    return;
  }

  const { error: upsertError } = await admin
    .from("daily_slots")
    .upsert(slots, { onConflict: "menu_item_id,date", ignoreDuplicates: false });

  if (upsertError) {
    console.warn("[seed] Failed to upsert daily_slots:", upsertError.message);
  } else {
    console.log(`[seed] Seeded ${slots.length} daily_slots for ${items.length} menu items`);
  }
}

export default async function globalSetup() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("E2E_EMAIL and E2E_PASSWORD must be set");

  // Seed fresh test data before running any tests
  await seedAvailableSlots();

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

  await page.context().storageState({ path: "e2e/.auth/user.json" });
  await browser.close();
}
