import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

export default async function VendorOrdersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("owner_id", user.id)
    .single();

  if (!vendor) return <p className="text-muted-foreground">尚未綁定商家帳號。</p>;

  const today = new Date().toISOString().split("T")[0];
  const sevenDaysLater = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const { data: orderItems } = await supabase
    .from("order_items")
    .select(`id, date, qty, unit_price, menu_items!inner(name, vendor_id), orders!inner(status, user_id)`)
    .eq("menu_items.vendor_id", vendor.id)
    .gte("date", today)
    .lte("date", sevenDaysLater)
    .eq("orders.status", "pending")
    .order("date");

  // 按日期分組，再按餐點彙整
  const byDate: Record<string, Record<string, { name: string; count: number; revenue: number }>> = {};
  for (const item of orderItems ?? []) {
    const name = item.menu_items?.name ?? "";
    (byDate[item.date] ??= {})[name] ??= { name, count: 0, revenue: 0 };
    byDate[item.date][name].count += item.qty;
    byDate[item.date][name].revenue += item.qty * item.unit_price;
  }

  const dates = Object.keys(byDate).sort();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">訂單彙整</h1>
      {dates.length === 0 && (
        <p className="text-muted-foreground text-center py-8">未來 7 天無訂單</p>
      )}
      {dates.map((date) => {
        const items = Object.values(byDate[date]);
        const dayTotal = items.reduce((s, i) => s + i.revenue, 0);
        return (
          <div key={date} className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {format(new Date(date), "MM月dd日 EEEE", { locale: zhTW })}
            </p>
            <div className="border rounded-lg divide-y">
              {items.map((item) => (
                <div key={item.name} className="flex items-center justify-between p-4">
                  <p className="font-medium">{item.name}</p>
                  <div className="flex items-center gap-6">
                    <p className="text-sm text-muted-foreground">x{item.count} 份</p>
                    <p className="text-sm font-medium">${item.revenue.toFixed(0)}</p>
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground">當日小計</p>
                <p className="font-bold">${dayTotal.toFixed(0)}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
