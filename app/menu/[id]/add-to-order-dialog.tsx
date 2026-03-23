"use client";

import { addToOrder } from "@/app/menu/[id]/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables } from "@/types/supabase";
import { format } from "date-fns";
import React, { useState, useTransition } from "react";

type MenuItem = Pick<Tables<"menu_items">, "id" | "name" | "description" | "price">;
type DailySlot = Pick<Tables<"daily_slots">, "id" | "date" | "max_qty" | "reserved_qty">;
type Option = Pick<Tables<"item_options">, "id" | "name" | "price_delta" | "sort_order">;
type OptionGroup = Pick<Tables<"item_option_groups">, "id" | "name" | "required" | "max_select" | "sort_order"> & {
  item_options: Option[];
};

interface Props {
  vendorId: string;
  item: MenuItem;
  slots: DailySlot[];
  optionGroups: OptionGroup[];
  children: React.ReactNode;
  disabled?: boolean;
}

export function AddToOrderDialog({ vendorId, item, slots, optionGroups, children, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<string>("");
  const [qty, setQty] = useState("1");
  // selectedOptions: groupId → Set of optionIds
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const slot = slots.find((s) => s.date === date);
  const remaining = slot ? slot.max_qty - slot.reserved_qty : 0;
  const availableDates = slots.filter((s) => s.max_qty - s.reserved_qty > 0);

  const sortedGroups = [...optionGroups].sort((a, b) => a.sort_order - b.sort_order);

  // 檢查必選群組是否都已選
  const requiredFulfilled = sortedGroups
    .filter((g) => g.required)
    .every((g) => (selections[g.id]?.size ?? 0) >= 1);

  // 計算目前選項的總 price_delta
  const optionsDelta = sortedGroups.reduce((sum, g) => {
    const sel = selections[g.id];
    if (!sel) return sum;
    return sum + g.item_options
      .filter((o) => sel.has(o.id))
      .reduce((s, o) => s + o.price_delta, 0);
  }, 0);
  const totalPrice = (item.price + optionsDelta) * Number(qty);

  function toggleOption(group: OptionGroup, optionId: string) {
    setSelections((prev) => {
      const current = new Set(prev[group.id] ?? []);
      if (group.max_select === 1) {
        // radio: 直接替換
        return { ...prev, [group.id]: new Set([optionId]) };
      }
      // checkbox: toggle，但不超過 max_select
      if (current.has(optionId)) {
        current.delete(optionId);
      } else if (current.size < group.max_select) {
        current.add(optionId);
      }
      return { ...prev, [group.id]: current };
    });
  }

  function handleOpen() {
    setOpen(true);
    setDate("");
    setQty("1");
    setSelections({});
    setErrorMsg(null);
  }

  function handleSubmit() {
    if (!slot) return;
    setErrorMsg(null);

    const selected = sortedGroups.flatMap((g) => {
      const sel = selections[g.id];
      if (!sel) return [];
      return g.item_options
        .filter((o) => sel.has(o.id))
        .map((o) => ({ option_id: o.id, name: o.name, price_delta: o.price_delta }));
    });

    startTransition(async () => {
      const result = await addToOrder(vendorId, item.id, slot.id, date, item.price, Number(qty), selected);
      if (result.error) {
        setErrorMsg(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  const trigger = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ onClick?: () => void; disabled?: boolean }>, {
        onClick: disabled ? undefined : handleOpen,
        disabled,
      })
    : <div onClick={disabled ? undefined : handleOpen}>{children}</div>;

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{item.name}</DialogTitle>
            {item.description && <DialogDescription>{item.description}</DialogDescription>}
          </DialogHeader>

          <FieldGroup>
            {/* 選項群組 */}
            {sortedGroups.map((group) => (
              <div key={group.id} className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {group.name}
                  {group.required
                    ? <span className="text-destructive ml-1">*</span>
                    : <span className="text-muted-foreground text-xs ml-1">（選填）</span>
                  }
                  {group.max_select > 1 && (
                    <span className="text-muted-foreground text-xs ml-1">最多選 {group.max_select}</span>
                  )}
                </p>
                <div className="flex flex-col gap-1">
                  {[...group.item_options]
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((opt) => {
                      const checked = selections[group.id]?.has(opt.id) ?? false;
                      const isRadio = group.max_select === 1;
                      return (
                        <label
                          key={opt.id}
                          className="flex items-center gap-3 p-2 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                          style={{ borderColor: checked ? "currentColor" : undefined }}
                        >
                          <input
                            type={isRadio ? "radio" : "checkbox"}
                            name={`group-${group.id}`}
                            checked={checked}
                            onChange={() => toggleOption(group, opt.id)}
                            className="accent-current"
                          />
                          <span className="flex-1 text-sm">{opt.name}</span>
                          {opt.price_delta !== 0 && (
                            <span className="text-sm text-muted-foreground">
                              {opt.price_delta > 0 ? `+$${opt.price_delta}` : `-$${Math.abs(opt.price_delta)}`}
                            </span>
                          )}
                        </label>
                      );
                    })}
                </div>
              </div>
            ))}

            {/* 日期選擇 */}
            <Field>
              <Select value={date} onValueChange={setDate}>
                <SelectTrigger>
                  <SelectValue placeholder="選擇日期" />
                </SelectTrigger>
                <SelectContent>
                  {availableDates.map((s) => (
                    <SelectItem key={s.id} value={s.date} className="px-3">
                      {format(new Date(s.date), "MM/dd (EEE)")}
                      <span className="ml-2 text-muted-foreground text-xs">剩 {s.max_qty - s.reserved_qty} 份</span>
                    </SelectItem>
                  ))}
                  {availableDates.length === 0 && (
                    <SelectItem value="_none" disabled className="px-3">本週已全數售完</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Field>

            {/* 數量選擇 */}
            {date && remaining > 0 && (
              <Field>
                <Select value={qty} onValueChange={setQty}>
                  <SelectTrigger>
                    <SelectValue placeholder="數量" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: Math.min(remaining, 10) }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)} className="px-3">
                        {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
          </FieldGroup>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">取消</Button>
            </DialogClose>
            <Button
              type="button"
              disabled={!date || remaining <= 0 || !requiredFulfilled || isPending}
              onClick={handleSubmit}
              className="flex-1"
            >
              {isPending ? "加入中…" : `加入預約單 $${totalPrice}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
