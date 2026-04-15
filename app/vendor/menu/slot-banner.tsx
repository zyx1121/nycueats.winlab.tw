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
