import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { OrderDetail } from "@/app/vendor/orders/order-detail";

type ItemDetail = {
  id: string;
  qty: number;
  unit_price: number;
  picked_up: boolean;
  user_name: string;
  options: string;
};

type MenuGroup = {
  name: string;
  count: number;
  revenue: number;
  items: ItemDetail[];
};

export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; msg?: string }>;
}) {
  const { status = "confirmed", msg } = await searchParams;

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
  const sevenDaysLater = new Date(new Date().getTime() + 7 * 86400000).toISOString().split("T")[0];

  const { data: orderItems } = await supabase
    .from("order_items")
    .select(`
      id, date, qty, unit_price, picked_up,
      menu_items!inner(name, vendor_id),
      orders!inner(id, status, user_id),
      order_item_options(name)
    `)
    .eq("menu_items.vendor_id", vendor.id)
    .gte("date", today)
    .lte("date", sevenDaysLater)
    .eq("orders.status", status)
    .order("date");


  // Fetch user names in a second query to avoid complex join issues
  const userIds = [...new Set((orderItems ?? []).map((i) => (i.orders as { user_id: string } | null)?.user_id).filter(Boolean))] as string[];
  const { data: profiles } = userIds.length > 0
    ? await supabase.from("profiles").select("id, name").in("id", userIds)
    : { data: [] };
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.name ?? "匿名"]));

  // Group by date → menu item name
  const byDate: Record<string, Record<string, MenuGroup>> = {};

  for (const item of orderItems ?? []) {
    const menuName = (item.menu_items as { name: string } | null)?.name ?? "";
    const orderData = item.orders as { user_id: string } | null;
    const userName = nameMap.get(orderData?.user_id ?? "") ?? "匿名";
    const options = (item.order_item_options as { name: string }[] | null)
      ?.map((o) => o.name)
      .join("、") ?? "";

    (byDate[item.date] ??= {})[menuName] ??= { name: menuName, count: 0, revenue: 0, items: [] };
    byDate[item.date][menuName].count += item.qty;
    byDate[item.date][menuName].revenue += item.qty * item.unit_price;
    byDate[item.date][menuName].items.push({
      id: item.id,
      qty: item.qty,
      unit_price: item.unit_price,
      picked_up: item.picked_up,
      user_name: userName,
      options,
    });
  }

  const dates = Object.keys(byDate).sort();
  const tabClass = (tab: string) =>
    `px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
      status === tab
        ? "bg-foreground text-background"
        : "text-muted-foreground hover:text-foreground"
    }`;

  const msgLabels: Record<string, string> = {
    "picked-up": "✓ 領餐成功",
    "already-picked-up": "此品項已領取過",
  };

  return (
    <div className="flex flex-col gap-4">
      {msg && msgLabels[msg] && (
        <div className={`text-sm px-4 py-2 rounded-lg ${msg === "picked-up" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
          {msgLabels[msg]}
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">訂單彙整</h1>
        <div className="flex items-center gap-1 border rounded-full p-1">
          <a href="?status=confirmed" className={tabClass("confirmed")}>進行中</a>
          <a href="?status=completed" className={tabClass("completed")}>已完成</a>
        </div>
      </div>

      {dates.length === 0 && (
        <p className="text-muted-foreground text-center py-8">未來 7 天無訂單</p>
      )}

      {dates.map((date) => {
        const groups = Object.values(byDate[date]);
        const dayTotal = groups.reduce((s, g) => s + g.revenue, 0);
        return (
          <div key={date} className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {format(new Date(date), "MM月dd日 EEEE", { locale: zhTW })}
            </p>
            <div className="border rounded-lg divide-y">
              {groups.map((group) => (
                <div key={group.name} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{group.name}</p>
                    <div className="flex items-center gap-6">
                      <p className="text-sm text-muted-foreground">x{group.count} 份</p>
                      <p className="text-sm font-medium">${group.revenue.toFixed(0)}</p>
                    </div>
                  </div>
                  <OrderDetail items={group.items} />
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
