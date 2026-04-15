import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { VendorMenuItemCard, type SlotStatus } from "./menu-item-card";
import { SlotBanner } from "./slot-banner";
import type { BulkSlotItem, SalesDataMap } from "./bulk-slot-dialog";

const EXPIRY_THRESHOLD_DAYS = 10;

export default async function VendorMenuPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id, name, operating_days")
    .eq("owner_id", user.id)
    .single();

  if (!vendor) {
    return <p className="text-muted-foreground">尚未綁定商家帳號，請聯絡管理員。</p>;
  }

  const today = new Date().toISOString().split("T")[0];
  const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
  const thresholdDate = new Date(Date.now() + EXPIRY_THRESHOLD_DAYS * 86400000).toISOString().split("T")[0];

  // Fetch all items with their slots (Supabase fetches all embedded rows)
  const { data: items } = await supabase
    .from("menu_items")
    .select("id, name, description, price, is_available, default_max_qty, image_url, calories, protein, sodium, sugar, tags, daily_slots(id, date, max_qty, reserved_qty), item_option_groups(id, name, required, max_select, sort_order, item_options(id, name, price_delta, sort_order))")
    .eq("vendor_id", vendor.id)
    .order("name");

  const allItems = items ?? [];

  // Fetch 7-day sales data
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
  const itemIds = allItems.map((i) => i.id);
  const salesData = await fetchSalesData(supabase, itemIds, sevenDaysAgo);

  // Compute slot status per item
  const slotStatuses = new Map<string, SlotStatus>();
  let expiringCount = 0;

  for (const item of allItems) {
    // Unavailable items can't be ordered; skip slot-expiry check
    if (!item.is_available) {
      slotStatuses.set(item.id, "ok");
      continue;
    }
    const futureSlots = (item.daily_slots ?? []).filter((s) => s.date > today);
    if (futureSlots.length === 0) {
      slotStatuses.set(item.id, "none");
      expiringCount++;
      continue;
    }
    const farthest = futureSlots.reduce((a, b) => (a.date > b.date ? a : b));
    if (farthest.date <= thresholdDate) {
      slotStatuses.set(item.id, "expiring");
      expiringCount++;
    } else {
      slotStatuses.set(item.id, "ok");
    }
  }

  const showBanner = expiringCount > 0;

  // Prepare data for card display (7-day filtered slots)
  const itemsForCards = allItems.map((item) => ({
    ...item,
    daily_slots: (item.daily_slots ?? []).filter(
      (s) => s.date > today && s.date <= sevenDaysLater
    ),
  }));

  // Prepare data for bulk dialog (all slots, only available items)
  const bulkDialogItems: BulkSlotItem[] = allItems
    .filter((i) => i.is_available)
    .map((item) => ({
      id: item.id,
      name: item.name,
      default_max_qty: item.default_max_qty,
      daily_slots: item.daily_slots ?? [],
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{vendor.name} — 菜單管理</h1>
        <Button size="sm">新增餐點</Button>
      </div>

      <SlotBanner
        show={showBanner}
        expiringCount={expiringCount}
        items={bulkDialogItems}
        operatingDays={vendor.operating_days ?? []}
        salesData={salesData}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {itemsForCards.map((item) => (
          <VendorMenuItemCard
            key={item.id}
            item={item}
            slotStatus={slotStatuses.get(item.id) ?? "ok"}
          />
        ))}
        {itemsForCards.length === 0 && (
          <p className="text-muted-foreground text-center py-8">尚無餐點，請新增</p>
        )}
      </div>
    </div>
  );
}

async function fetchSalesData(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemIds: string[],
  sinceDate: string,
): Promise<SalesDataMap> {
  if (itemIds.length === 0) return {};

  const { data: salesRaw } = await supabase
    .from("order_items")
    .select("menu_item_id, date, qty, orders!inner(status)")
    .in("menu_item_id", itemIds)
    .gte("date", sinceDate);

  const validStatuses = new Set(["confirmed", "completed", "picked_up"]);
  const filtered = (salesRaw ?? []).filter(
    (r) => r.orders && validStatuses.has(r.orders.status)
  );

  // Group by menu_item_id → date → total qty
  const byItem = new Map<string, Map<string, number>>();
  for (const row of filtered) {
    const itemMap = byItem.get(row.menu_item_id) ?? new Map();
    itemMap.set(row.date, (itemMap.get(row.date) ?? 0) + row.qty);
    byItem.set(row.menu_item_id, itemMap);
  }

  // Build SalesDataMap: 7 data points (one per day), fill missing days with 0
  const result: SalesDataMap = {};
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86400000).toISOString().split("T")[0]);
  }

  for (const itemId of itemIds) {
    const itemMap = byItem.get(itemId);
    if (!itemMap || itemMap.size === 0) {
      result[itemId] = { dailySales: [0, 0, 0, 0, 0, 0, 0], avgPerDay: 0, daysWithData: 0 };
      continue;
    }
    const dailySales = days.map((d) => itemMap.get(d) ?? 0);
    const daysWithData = dailySales.filter((v) => v > 0).length;
    const total = dailySales.reduce((a, b) => a + b, 0);
    const avgPerDay = daysWithData > 0 ? total / daysWithData : 0;
    result[itemId] = { dailySales, avgPerDay, daysWithData };
  }

  return result;
}
