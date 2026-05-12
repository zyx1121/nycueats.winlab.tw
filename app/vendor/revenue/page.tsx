import Link from "next/link";

import { Button } from "@/components/ui/button";
import { StatCard } from "@/app/admin/stat-card";

import { getVendorRevenueDashboard } from "./actions";
import { RevenueBarChart } from "./revenue-bar-chart";
import { RevenueTrendChart } from "./revenue-trend-chart";
import { getPreviousMonth, parseRevenueMonth } from "./revenue-model";

type SearchParams = Promise<{
  year?: string | string[];
  month?: string | string[];
}>;

function getNextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

function monthHref(year: number, month: number): string {
  return `/vendor/revenue?year=${year}&month=${month}`;
}

function monthLabel(year: number, month: number): string {
  return `${year} 年 ${month} 月`;
}

export default async function VendorRevenuePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { year, month } = parseRevenueMonth(params);
  const previous = getPreviousMonth(year, month);
  const next = getNextMonth(year, month);
  const dashboard = await getVendorRevenueDashboard(year, month);

  if (!dashboard.vendor) {
    return <p className="text-muted-foreground">尚未綁定商家帳號。</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">營業額統計</h1>
          <p className="text-sm text-muted-foreground">{dashboard.vendor.name} · {monthLabel(year, month)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={monthHref(previous.year, previous.month)}>上個月</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/vendor/revenue">本月</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={monthHref(next.year, next.month)}>下個月</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="月營收"
          value={dashboard.stats.thisMonth.revenue}
          prev={dashboard.stats.lastMonth.revenue}
          format="currency"
        />
        <StatCard
          title="訂單數"
          value={dashboard.stats.thisMonth.orders}
          prev={dashboard.stats.lastMonth.orders}
          format="number"
        />
        <StatCard
          title="售出份數"
          value={dashboard.stats.thisMonth.soldQuantity}
          prev={dashboard.stats.lastMonth.soldQuantity}
          format="number"
        />
        <StatCard
          title="平均客單"
          value={
            dashboard.stats.thisMonth.orders > 0
              ? dashboard.stats.thisMonth.revenue / dashboard.stats.thisMonth.orders
              : 0
          }
          prev={
            dashboard.stats.lastMonth.orders > 0
              ? dashboard.stats.lastMonth.revenue / dashboard.stats.lastMonth.orders
              : 0
          }
          format="currency"
        />
      </div>

      <RevenueTrendChart title="近 30 天每日營收" data={dashboard.trend} />

      <RevenueBarChart title={`${monthLabel(year, month)}餐點營收排行`} items={dashboard.topMenuItems} />
    </div>
  );
}
