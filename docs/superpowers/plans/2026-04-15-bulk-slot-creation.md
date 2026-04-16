# Bulk Slot Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a smart banner and bulk slot dialog to `/vendor/menu` so vendors can create daily slots for all menu items across two calendar weeks in one action.

**Architecture:** Server Component (`page.tsx`) fetches vendor data, menu items with slots, and 7-day sales data, then passes everything to a client-side `SlotBanner` component. The banner shows when any item's farthest slot is ≤ 10 days away. Clicking "建立未來名額" opens a `BulkSlotDialog` with a 14-day grid (2 calendar weeks, Sunday-aligned). Save calls a batch `bulkUpsertSlots` Server Action.

**Tech Stack:** Next.js 16 App Router, Supabase JS client, date-fns v4, shadcn/ui Dialog, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-04-15-bulk-slot-creation-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `app/vendor/menu/sparkline.tsx` | Create | Pure SVG sparkline component (7 data points, ~80×24px) |
| `app/vendor/menu/actions.ts` | Modify | Add `bulkUpsertSlots` Server Action |
| `app/vendor/menu/bulk-slot-confirm-dialog.tsx` | Create | Confirmation dialog listing items using default qty |
| `app/vendor/menu/bulk-slot-dialog.tsx` | Create | Main bulk slot dialog with per-item 14-day grids |
| `app/vendor/menu/slot-banner.tsx` | Create | Client component: warning/success banner + dialog trigger |
| `app/vendor/menu/menu-item-card.tsx` | Modify | Add `slotStatus` prop, render badge |
| `app/vendor/menu/page.tsx` | Modify | Expand data fetching, compute slot statuses, render banner |

---

### Task 1: Sparkline SVG component

**Files:**
- Create: `app/vendor/menu/sparkline.tsx`

- [ ] **Step 1: Create the sparkline component**

```tsx
// app/vendor/menu/sparkline.tsx
"use client";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ data, width = 80, height = 24, className }: SparklineProps) {
  if (data.length === 0) {
    return (
      <svg width={width} height={height} className={className}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeOpacity={0.2} strokeWidth={1.5} />
      </svg>
    );
  }

  const max = Math.max(...data, 1);
  const padding = 2;
  const innerH = height - padding * 2;
  const step = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;

  const points = data
    .map((v, i) => {
      const x = padding + i * step;
      const y = padding + innerH - (v / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className={className}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Verify sparkline renders**

Run: `bunx next dev` (if not running)

Open browser to any page and temporarily import the Sparkline to test. Or just verify no build errors:

Run: `bunx next build --no-lint 2>&1 | head -20`

We'll fully test this when integrating in Task 6.

- [ ] **Step 3: Commit**

```bash
rtk git add app/vendor/menu/sparkline.tsx
rtk git commit -m "feat(vendor): add Sparkline SVG component for sales trend display

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: `bulkUpsertSlots` Server Action

**Files:**
- Modify: `app/vendor/menu/actions.ts`

- [ ] **Step 1: Add the bulkUpsertSlots function**

Add this function at the end of `app/vendor/menu/actions.ts` (before the final blank line):

```ts
export async function bulkUpsertSlots(
  slots: { menu_item_id: string; date: string; max_qty: number }[]
) {
  const { supabase, vendor } = await requireVendor();

  // Verify all menu items belong to this vendor
  const itemIds = [...new Set(slots.map((s) => s.menu_item_id))];
  const { data: ownedItems } = await supabase
    .from("menu_items")
    .select("id")
    .eq("vendor_id", vendor.id)
    .in("id", itemIds);

  const ownedIds = new Set((ownedItems ?? []).map((i) => i.id));
  const validSlots = slots.filter((s) => ownedIds.has(s.menu_item_id));

  if (validSlots.length === 0) return { error: "沒有可建立的名額" };

  const { error } = await supabase
    .from("daily_slots")
    .upsert(
      validSlots.map((s) => ({
        menu_item_id: s.menu_item_id,
        date: s.date,
        max_qty: s.max_qty,
      })),
      { onConflict: "menu_item_id,date" }
    );

  if (error) return { error: error.message };

  revalidatePath("/vendor/menu");
  revalidatePath("/menu", "layout");
  return { success: true, count: validSlots.length };
}
```

- [ ] **Step 2: Verify build**

Run: `bunx next build --no-lint 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
rtk git add app/vendor/menu/actions.ts
rtk git commit -m "feat(vendor): add bulkUpsertSlots Server Action for batch slot creation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Confirmation dialog

**Files:**
- Create: `app/vendor/menu/bulk-slot-confirm-dialog.tsx`

- [ ] **Step 1: Create the confirmation dialog**

This dialog lists items that still have untouched (default) slots and asks the vendor to confirm.

```tsx
// app/vendor/menu/bulk-slot-confirm-dialog.tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export interface UntouchedItem {
  name: string;
  defaultMaxQty: number;
  untouchedCount: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: UntouchedItem[];
  onConfirm: () => void;
  isPending: boolean;
}

export function BulkSlotConfirmDialog({
  open,
  onOpenChange,
  items,
  onConfirm,
  isPending,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>確認建立名額</DialogTitle>
          <DialogDescription>
            以下餐點尚有未設定的日期，儲存時將使用各餐點的預設供應量：
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1.5 text-sm">
          {items.map((item) => (
            <li key={item.name} className="flex justify-between">
              <span>{item.name}</span>
              <span className="text-muted-foreground">
                {item.defaultMaxQty} 份/天（{item.untouchedCount} 天未設定）
              </span>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button onClick={onConfirm} disabled={isPending}>
            {isPending ? "建立中…" : "確認建立"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add app/vendor/menu/bulk-slot-confirm-dialog.tsx
rtk git commit -m "feat(vendor): add BulkSlotConfirmDialog for default-slot confirmation

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Bulk slot dialog

**Files:**
- Create: `app/vendor/menu/bulk-slot-dialog.tsx`

This is the main dialog. It shows all menu items with sparklines and 14-day grids.

- [ ] **Step 1: Create shared types at the top of the file**

```tsx
// app/vendor/menu/bulk-slot-dialog.tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { startOfWeek, addDays, format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { useRef, useState, useTransition } from "react";
import { bulkUpsertSlots } from "./actions";
import { BulkSlotConfirmDialog, type UntouchedItem } from "./bulk-slot-confirm-dialog";
import { Sparkline } from "./sparkline";

type Slot = { id: string; date: string; max_qty: number; reserved_qty: number };

export type BulkSlotItem = {
  id: string;
  name: string;
  default_max_qty: number;
  daily_slots: Slot[];
};

export type SalesDataMap = Record<
  string,
  { dailySales: number[]; avgPerDay: number; daysWithData: number }
>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: BulkSlotItem[];
  operatingDays: number[];
  salesData: SalesDataMap;
  onSuccess: (message: string) => void;
}
```

- [ ] **Step 2: Implement date grid generation and cell state logic**

Continue in the same file, add the helper functions and main component:

```tsx
const DAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

function generateDates(): string[] {
  const today = new Date();
  const sunday = startOfWeek(today, { weekStartsOn: 0 });
  return Array.from({ length: 14 }, (_, i) =>
    addDays(sunday, i).toISOString().split("T")[0]
  );
}

type CellState = "existing" | "untouched" | "touched" | "disabled";

function getCellState(
  date: string,
  today: string,
  operatingDays: number[],
  slotMap: Map<string, Slot>,
  touchedSet: Set<string>,
): CellState {
  const dayOfWeek = new Date(date + "T00:00:00").getDay();
  if (date <= today) return "disabled";
  if (operatingDays.length > 0 && !operatingDays.includes(dayOfWeek)) return "disabled";
  if (slotMap.has(date)) return touchedSet.has(date) ? "touched" : "existing";
  return touchedSet.has(date) ? "touched" : "untouched";
}
```

- [ ] **Step 3: Implement the BulkSlotDialog component body**

Continue in the same file:

```tsx
export function BulkSlotDialog({
  open,
  onOpenChange,
  items,
  operatingDays,
  salesData,
  onSuccess,
}: Props) {
  const dates = generateDates();
  const today = new Date().toISOString().split("T")[0];
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Per-item, per-date qty overrides: itemId -> date -> qty
  const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({});
  // Track which cells user has manually edited
  const [touched, setTouched] = useState<Record<string, Set<string>>>({});

  function getQty(itemId: string, date: string, slotMap: Map<string, Slot>, defaultQty: number): number {
    return overrides[itemId]?.[date] ?? slotMap.get(date)?.max_qty ?? defaultQty;
  }

  function handleQtyChange(itemId: string, date: string, value: string, defaultQty: number) {
    const qty = parseInt(value);
    if (isNaN(qty) || qty < 0) return;
    setOverrides((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [date]: qty },
    }));
    setTouched((prev) => {
      const next = new Map(Object.entries(prev).map(([k, v]) => [k, new Set(v)]));
      const set = next.get(itemId) ?? new Set();
      set.add(date);
      next.set(itemId, set);
      return Object.fromEntries(next);
    });
  }

  function collectSlots(): { menu_item_id: string; date: string; max_qty: number }[] {
    const slots: { menu_item_id: string; date: string; max_qty: number }[] = [];
    for (const item of items) {
      const slotMap = new Map(item.daily_slots.map((s) => [s.date, s]));
      for (const date of dates) {
        const state = getCellState(date, today, operatingDays, slotMap, touched[item.id] ?? new Set());
        if (state === "disabled") continue;
        const qty = getQty(item.id, date, slotMap, item.default_max_qty);
        slots.push({ menu_item_id: item.id, date, max_qty: qty });
      }
    }
    return slots;
  }

  function getUntouchedItems(): UntouchedItem[] {
    const result: UntouchedItem[] = [];
    for (const item of items) {
      const slotMap = new Map(item.daily_slots.map((s) => [s.date, s]));
      let count = 0;
      for (const date of dates) {
        const state = getCellState(date, today, operatingDays, slotMap, touched[item.id] ?? new Set());
        if (state === "untouched") count++;
      }
      if (count > 0) {
        result.push({ name: item.name, defaultMaxQty: item.default_max_qty, untouchedCount: count });
      }
    }
    return result;
  }

  function handleSave() {
    const untouched = getUntouchedItems();
    if (untouched.length > 0) {
      setConfirmOpen(true);
      return;
    }
    doSave();
  }

  function doSave() {
    const slots = collectSlots();
    startTransition(async () => {
      const result = await bulkUpsertSlots(slots);
      setConfirmOpen(false);
      if (result.error) {
        alert(result.error);
      } else {
        const dateRange = `${format(new Date(dates.find((d) => d > today) ?? dates[0]), "M/d")}–${format(new Date(dates[dates.length - 1]), "M/d")}`;
        onSuccess(`已成功建立 ${dateRange} 的名額（共 ${result.count} 筆）`);
        onOpenChange(false);
      }
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-6xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>建立未來名額</DialogTitle>
            <DialogDescription>
              ℹ️ 黯淡的格子表示尚未設定名額，儲存時將使用預設供應量。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-6">
            {items.map((item) => {
              const slotMap = new Map(item.daily_slots.map((s) => [s.date, s]));
              const sales = salesData[item.id];
              const touchedSet = touched[item.id] ?? new Set<string>();

              return (
                <div key={item.id} className="border rounded-lg p-4 flex flex-col gap-3">
                  {/* Header: name + sparkline + avg */}
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{item.name}</span>
                    {sales ? (
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkline data={sales.dailySales} className="text-foreground" />
                        {sales.daysWithData === 0
                          ? "尚無銷售資料"
                          : `近 ${sales.daysWithData} 天平均 ${sales.avgPerDay.toFixed(1)} 份/天`}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">尚無銷售資料</span>
                    )}
                  </div>

                  {/* 14-day grid: 2 rows of 7 */}
                  {[0, 7].map((offset) => (
                    <div key={offset} className="grid grid-cols-7 gap-2">
                      {dates.slice(offset, offset + 7).map((date) => {
                        const state = getCellState(date, today, operatingDays, slotMap, touchedSet);
                        const slot = slotMap.get(date);
                        const dayOfWeek = new Date(date + "T00:00:00").getDay();
                        const isDisabled = state === "disabled";
                        const isUntouched = state === "untouched";
                        const displayQty = getQty(item.id, date, slotMap, item.default_max_qty);

                        return (
                          <div key={date} className="flex flex-col gap-1 items-center">
                            <p className="text-xs text-muted-foreground">
                              {DAY_LABELS[dayOfWeek]} {format(new Date(date + "T00:00:00"), "M/d")}
                            </p>
                            <Input
                              type="number"
                              min={0}
                              value={displayQty}
                              disabled={isDisabled}
                              className={`w-full text-center px-1 ${
                                isDisabled
                                  ? "bg-muted text-muted-foreground opacity-50"
                                  : isUntouched
                                    ? "text-muted-foreground border-dashed"
                                    : ""
                              }`}
                              onChange={(e) =>
                                handleQtyChange(item.id, date, e.target.value, item.default_max_qty)
                              }
                            />
                            {slot && slot.reserved_qty > 0 && (
                              <p className="text-xs text-muted-foreground">已訂 {slot.reserved_qty}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "儲存中…" : "儲存名額"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkSlotConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        items={getUntouchedItems()}
        onConfirm={doSave}
        isPending={isPending}
      />
    </>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `bunx next build --no-lint 2>&1 | tail -10`

Expected: Build succeeds. If `zhTW` import from `date-fns/locale` causes issues, remove it — the `format` call with `"M/d"` doesn't need a locale.

- [ ] **Step 5: Commit**

```bash
rtk git add app/vendor/menu/bulk-slot-dialog.tsx
rtk git commit -m "feat(vendor): add BulkSlotDialog with 14-day grid and sales sparklines

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Slot banner client component

**Files:**
- Create: `app/vendor/menu/slot-banner.tsx`

- [ ] **Step 1: Create the SlotBanner component**

This is a Client Component that shows the warning/success banner and controls the dialog.

```tsx
// app/vendor/menu/slot-banner.tsx
"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { BulkSlotDialog, type BulkSlotItem, type SalesDataMap } from "./bulk-slot-dialog";

interface Props {
  show: boolean;
  expiringCount: number;
  items: BulkSlotItem[];
  operatingDays: number[];
  salesData: SalesDataMap;
}

export function SlotBanner({ show, expiringCount, items, operatingDays, salesData }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!show && !successMessage) return null;

  return (
    <>
      {successMessage ? (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
          <span className="text-lg shrink-0">✅</span>
          <div className="flex-1">
            <p className="font-medium text-green-800 dark:text-green-200">{successMessage}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSuccessMessage(null)}
            className="shrink-0 text-green-700"
          >
            關閉
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
          <span className="text-lg shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              {expiringCount} 個餐點的訂餐名額即將用完
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              名額到期後使用者將無法訂餐。
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setDialogOpen(true)}
            className="shrink-0 bg-amber-700 hover:bg-amber-800 text-white"
          >
            建立未來名額
          </Button>
        </div>
      )}

      <BulkSlotDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        items={items}
        operatingDays={operatingDays}
        salesData={salesData}
        onSuccess={setSuccessMessage}
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add app/vendor/menu/slot-banner.tsx
rtk git commit -m "feat(vendor): add SlotBanner with warning/success states and dialog trigger

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Menu item card badge

**Files:**
- Modify: `app/vendor/menu/menu-item-card.tsx`

- [ ] **Step 1: Add slotStatus prop and render badge**

The current `VendorMenuItemCard` component at `app/vendor/menu/menu-item-card.tsx` passes a `status` prop to the shared `MenuItemCard`. Add a `slotStatus` prop and render an additional badge.

Replace the entire file content with:

```tsx
// app/vendor/menu/menu-item-card.tsx
"use client";

import { MenuItemCard } from "@/components/menu-item-card";
import { useState } from "react";
import { MenuItemEditDialog } from "./menu-item-edit-dialog";

type Item = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  default_max_qty: number;
  image_url: string | null;
  calories: number | null;
  protein: number | null;
  sodium: number | null;
  sugar: number | null;
  tags: string[];
  daily_slots: { id: string; date: string; max_qty: number; reserved_qty: number }[];
  item_option_groups: {
    id: string; name: string; required: boolean; max_select: number; sort_order: number;
    item_options: { id: string; name: string; price_delta: number; sort_order: number }[];
  }[];
};

export type SlotStatus = "expiring" | "none" | "ok";

export function VendorMenuItemCard({ item, slotStatus }: { item: Item; slotStatus: SlotStatus }) {
  const [editOpen, setEditOpen] = useState(false);

  const badge = (
    <div className="flex flex-wrap gap-1.5">
      {!item.is_available && (
        <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">已下架</span>
      )}
      {slotStatus === "none" && (
        <span className="text-xs text-red-600 border border-red-200 bg-red-50 rounded-full px-2 py-0.5 dark:text-red-400 dark:border-red-900 dark:bg-red-950">無名額</span>
      )}
      {slotStatus === "expiring" && (
        <span className="text-xs text-amber-600 border border-amber-200 bg-amber-50 rounded-full px-2 py-0.5 dark:text-amber-400 dark:border-amber-900 dark:bg-amber-950">名額將盡</span>
      )}
    </div>
  );

  return (
    <>
      <MenuItemEditDialog item={item} open={editOpen} onOpenChange={setEditOpen} />
      <MenuItemCard
        item={item}
        onClick={() => setEditOpen(true)}
        status={badge}
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add app/vendor/menu/menu-item-card.tsx
rtk git commit -m "feat(vendor): add slot status badge (名額將盡/無名額) to menu item cards

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 7: page.tsx — data fetching, slot status, banner integration

**Files:**
- Modify: `app/vendor/menu/page.tsx`

This is the main integration task. The page needs to:
1. Add `operating_days` to vendor query
2. Fetch 7-day sales data
3. Compute slot status per item
4. Render the SlotBanner
5. Pass `slotStatus` to each card

- [ ] **Step 1: Rewrite page.tsx with all new data fetching and integration**

Replace the entire file content of `app/vendor/menu/page.tsx`:

```tsx
// app/vendor/menu/page.tsx
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
  const availableItems = allItems.filter((i) => i.is_available);
  let expiringCount = 0;

  for (const item of allItems) {
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
  const bulkDialogItems: BulkSlotItem[] = availableItems.map((item) => ({
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
    (r) => validStatuses.has((r.orders as unknown as { status: string }).status)
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
```

- [ ] **Step 2: Verify build**

Run: `npx next build --no-lint 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 3: Manual verification**

Start dev server: `npx next dev`

1. Log in as vendor (`uncle.bento@nycueats.dev` / `password123`)
2. Navigate to `/vendor/menu`
3. **Banner**: If any items have slots expiring within 10 days, the amber banner should appear
4. **Card badges**: Items with expiring/no slots show orange "名額將盡" or red "無名額" badges
5. Click **「建立未來名額」**:
   - Dialog opens with all available items
   - Each item shows sparkline + average (or "尚無銷售資料")
   - 14-day grid: 2 rows × 7, Sunday-aligned
   - Past dates are greyed/disabled but show existing data
   - Non-operating days are greyed/disabled
   - Untouched future cells show dashed border with default qty
6. Edit some cells, click **「儲存名額」**:
   - If any untouched cells remain → confirmation dialog appears listing each item's default qty and count
   - Click 「取消」→ returns to edit view (no data loss)
   - Click 「確認建立」→ saves, dialog closes, banner turns green with success message
7. Reload page: banner should be gone (if all items now have sufficient slots)

- [ ] **Step 4: Commit**

```bash
rtk git add app/vendor/menu/page.tsx
rtk git commit -m "feat(vendor): integrate slot banner, sales data, and status badges in menu page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

### Spec coverage

| Spec requirement | Task |
|-----------------|------|
| Banner trigger (≤ 10 days) | Task 7: `EXPIRY_THRESHOLD_DAYS = 10`, computed in page.tsx |
| Banner content (warning + count) | Task 5: SlotBanner warning state |
| Banner success state (green) | Task 5: SlotBanner success state |
| Card badge (名額將盡 / 無名額) | Task 6: VendorMenuItemCard slotStatus prop |
| Dialog structure (full-width, scrollable) | Task 4: `sm:max-w-6xl max-h-[90dvh] overflow-y-auto` |
| Tip at dialog top | Task 4: DialogDescription with ℹ️ |
| 14 calendar days, Sunday-aligned | Task 4: `startOfWeek(today, { weekStartsOn: 0 })` + 14 days |
| Past dates greyed, show historical data | Task 4: `getCellState` returns "disabled" for `date <= today`, Input shows existing slot data |
| Non-operating days greyed | Task 4: `getCellState` checks `operatingDays` |
| Untouched cells dashed/dim | Task 4: `border-dashed text-muted-foreground` class |
| Confirmation dialog with per-item defaults | Task 3: BulkSlotConfirmDialog lists each item |
| Cancel → back to edit (no data loss) | Task 3+4: `setConfirmOpen(false)`, state preserved |
| Sparkline + average | Task 1 (component) + Task 4+7 (integration) |
| Sales display logic (0 / 1-6 / 7 days) | Task 7: `fetchSalesData` computes `daysWithData` |
| bulkUpsertSlots Server Action | Task 2 |
| revalidate vendor + user paths | Task 2: both paths revalidated |
| operating_days null → all days open | Task 4: `operatingDays.length > 0 && !operatingDays.includes(...)` |

### Placeholder scan

No TBD, TODO, or "implement later" found. All steps contain complete code.

### Type consistency

- `BulkSlotItem` defined in `bulk-slot-dialog.tsx`, exported and used in `slot-banner.tsx` and `page.tsx` ✓
- `SalesDataMap` defined in `bulk-slot-dialog.tsx`, exported and used in `slot-banner.tsx` and `page.tsx` ✓
- `SlotStatus` defined in `menu-item-card.tsx`, exported and used in `page.tsx` ✓
- `UntouchedItem` defined in `bulk-slot-confirm-dialog.tsx`, exported and used in `bulk-slot-dialog.tsx` ✓
- `bulkUpsertSlots` signature matches usage: `{ menu_item_id, date, max_qty }[]` ✓
