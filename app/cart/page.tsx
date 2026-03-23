import { RemoveButton } from "@/app/cart/remove-button";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

export default async function CartPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: order } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .single();

  const items = order
    ? (await supabase
        .from("order_items")
        .select("id, date, qty, unit_price, menu_items(id, name, vendor_id, vendors(id, name)), order_item_options(name, price_delta)")
        .eq("order_id", order.id)
        .order("date")
      ).data ?? []
    : [];

  // 按日期分組
  const byDate = items.reduce<Record<string, typeof items>>((acc, item) => {
    (acc[item.date] ??= []).push(item);
    return acc;
  }, {});

  const total = items.reduce((sum, i) => sum + i.unit_price * i.qty, 0);
  const dates = Object.keys(byDate).sort();

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-4">
        <h1 className="text-2xl font-bold">我的預約單</h1>

        {dates.length === 0 && (
          <p className="text-muted-foreground py-16 text-center">預約單是空的</p>
        )}

        {dates.map((date) => (
          <div key={date} className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {format(new Date(date), "MM月dd日 EEEE", { locale: zhTW })}
            </p>
            <div className="border rounded-lg divide-y">
              {byDate[date].map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-medium">{item.menu_items?.name}</p>
                    <p className="text-xs text-muted-foreground">{item.menu_items?.vendors?.name}</p>
                    {item.order_item_options.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {item.order_item_options.map((o) => o.name).join("、")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-sm">x{item.qty}</p>
                    <p className="text-sm font-medium">${(item.unit_price * item.qty).toFixed(0)}</p>
                    <RemoveButton orderItemId={item.id} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {dates.length > 0 && (
          <>
            <Separator />
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">共 {items.length} 項</p>
              <p className="text-lg font-bold">合計 ${total.toFixed(0)}</p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
