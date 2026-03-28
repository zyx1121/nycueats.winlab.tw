import { getDashboardStats, getOrderTrend, getTopVendors, getTopMenuItems } from "./actions";
import { StatCard } from "./stat-card";
import { TrendChart } from "./trend-chart";
import { BarChart } from "./bar-chart";

export default async function AdminPage() {
  const [stats, trend, vendors, menuItems] = await Promise.all([
    getDashboardStats(),
    getOrderTrend(30),
    getTopVendors(5),
    getTopMenuItems(5),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">營運總覽</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="本月訂單"
          value={stats.thisMonth.orders}
          prev={stats.lastMonth.orders}
          format="number"
        />
        <StatCard
          title="本月營收"
          value={stats.thisMonth.revenue}
          prev={stats.lastMonth.revenue}
          format="currency"
        />
        <StatCard
          title="完成率"
          value={stats.completionRate}
          prev={0}
          format="percent"
        />
        <StatCard
          title="取消率"
          value={stats.cancelRate}
          prev={0}
          format="percent"
        />
      </div>

      <TrendChart title="近 30 天訂單趨勢" data={trend} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BarChart title="商家排行（依營收）" items={vendors} />
        <BarChart title="餐點排行（依營收）" items={menuItems} />
      </div>
    </div>
  );
}
