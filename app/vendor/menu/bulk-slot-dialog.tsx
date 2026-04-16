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
import { useState, useTransition } from "react";
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

  const [overrides, setOverrides] = useState<Record<string, Record<string, number>>>({});
  const [touched, setTouched] = useState<Record<string, Set<string>>>({});

  function getQty(itemId: string, date: string, slotMap: Map<string, Slot>, fallbackQty: number): number {
    return overrides[itemId]?.[date] ?? slotMap.get(date)?.max_qty ?? fallbackQty;
  }

  function handleQtyChange(itemId: string, date: string, value: string) {
    const qty = parseInt(value);
    if (isNaN(qty) || qty < 0) return;
    setOverrides((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], [date]: qty },
    }));
    setTouched((prev) => {
      const next = new Map(Object.entries(prev).map(([k, v]) => [k, new Set(v)]));
      const set = next.get(itemId) ?? new Set<string>();
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
        const firstFuture = dates.find((d) => d > today) ?? dates[0];
        const dateRange = `${format(new Date(firstFuture + "T00:00:00"), "M/d")}–${format(new Date(dates[dates.length - 1] + "T00:00:00"), "M/d")}`;
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
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{item.name}</span>
                    {sales && sales.daysWithData > 0 ? (
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Sparkline data={sales.dailySales} className="text-foreground" />
                        近 {sales.daysWithData} 天平均 {sales.avgPerDay.toFixed(1)} 份/天
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">尚無銷售資料</span>
                    )}
                  </div>

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
                                handleQtyChange(item.id, date, e.target.value)
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
