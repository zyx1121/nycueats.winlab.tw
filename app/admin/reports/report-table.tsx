"use client";

import { getMonthlyReport, getVendorMonthlyDetail, type MenuItemReport, type VendorReport } from "@/app/admin/reports/actions";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useState, useTransition } from "react";

export function ReportTable({ initialData, initialYear, initialMonth }: {
  initialData: VendorReport[];
  initialYear: number;
  initialMonth: number;
}) {
  const [data, setData] = useState(initialData);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [isPending, startTransition] = useTransition();
  const [exportingVendorId, setExportingVendorId] = useState<string | null>(null);

  const total = data.reduce((s, v) => s + v.total_revenue, 0);
  const totalOrders = data.reduce((s, v) => s + v.order_count, 0);

  const changeMonth = (newYear: number, newMonth: number) => {
    setYear(newYear);
    setMonth(newMonth);
    startTransition(async () => {
      const result = await getMonthlyReport(newYear, newMonth);
      setData(result);
    });
  };

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1);
    changeMonth(d.getFullYear(), d.getMonth() + 1);
  };

  const nextMonth = () => {
    const d = new Date(year, month, 1);
    changeMonth(d.getFullYear(), d.getMonth() + 1);
  };

  const exportVendorCSV = async (vendor: VendorReport) => {
    setExportingVendorId(vendor.vendor_id);
    try {
      const detail = await getVendorMonthlyDetail(vendor.vendor_id, year, month);
      const header = "餐點名稱,定價,售出份數,取消份數,已領餐份數,未領餐份數,含選項均價,小計";
      const rows = detail.map((item: MenuItemReport) =>
        `${item.menu_item_name},$${item.base_price},${item.sold_qty},${item.cancelled_qty},${item.picked_up_qty},${item.not_picked_up_qty},$${item.avg_unit_price},$${item.subtotal}`
      );
      const totalSold = detail.reduce((s: number, i: MenuItemReport) => s + i.sold_qty, 0);
      const totalCancelled = detail.reduce((s: number, i: MenuItemReport) => s + i.cancelled_qty, 0);
      const totalPickedUp = detail.reduce((s: number, i: MenuItemReport) => s + i.picked_up_qty, 0);
      const totalNotPickedUp = detail.reduce((s: number, i: MenuItemReport) => s + i.not_picked_up_qty, 0);
      const totalSubtotal = detail.reduce((s: number, i: MenuItemReport) => s + i.subtotal, 0);
      const footer = `合計,,${totalSold},${totalCancelled},${totalPickedUp},${totalNotPickedUp},,$${totalSubtotal}`;
      const title = `${vendor.vendor_name} — ${year} 年 ${month} 月月結報表`;
      const csv = [title, "", header, ...rows, footer].join("\n");

      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${vendor.vendor_name}_月結明細_${year}-${String(month).padStart(2, "0")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingVendorId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="text-muted-foreground hover:text-foreground transition-colors">
            ←
          </button>
          <p className="text-lg font-medium">{year} 年 {month} 月</p>
          <button onClick={nextMonth} className="text-muted-foreground hover:text-foreground transition-colors">
            →
          </button>
        </div>
      </div>

      {isPending && <p className="text-sm text-muted-foreground text-center py-4">載入中...</p>}

      {!isPending && data.length === 0 && (
        <p className="text-muted-foreground text-center py-8">本月無訂單</p>
      )}

      {!isPending && data.length > 0 && (
        <div className="border rounded-lg bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 text-sm font-medium">商家名稱</th>
                <th className="text-right p-3 text-sm font-medium">訂單數</th>
                <th className="text-right p-3 text-sm font-medium">總營收</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((v) => (
                <tr key={v.vendor_id} className="border-b last:border-b-0">
                  <td className="p-3 text-sm">{v.vendor_name}</td>
                  <td className="p-3 text-sm text-right text-muted-foreground">{v.order_count}</td>
                  <td className="p-3 text-sm text-right font-medium">${v.total_revenue.toLocaleString()}</td>
                  <td className="p-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => exportVendorCSV(v)}
                      disabled={exportingVendorId === v.vendor_id}
                    >
                      <Download className="size-3" />
                      {exportingVendorId === v.vendor_id ? "匯出中..." : "匯出"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30">
                <td className="p-3 text-sm font-bold">合計</td>
                <td className="p-3 text-sm text-right font-bold">{totalOrders}</td>
                <td className="p-3 text-sm text-right font-bold">${total.toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
