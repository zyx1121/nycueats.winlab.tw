import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { CheckCircle, Circle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { QRCodeSVG } from "./qr-code";

const STATUS_LABELS: Record<string, string> = {
  confirmed: "已確認",
  completed: "已完成",
  cancelled: "已取消",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, created_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!order) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select(
      "id, date, qty, unit_price, picked_up, menu_items(name, vendors(name)), order_item_options(name, price_delta)"
    )
    .eq("order_id", order.id)
    .order("date");

  const orderItems = (items ?? []).map((i) => ({
    id: i.id,
    date: i.date,
    qty: i.qty,
    unit_price: i.unit_price,
    picked_up: i.picked_up,
    menu_item_name: (i.menu_items as { name: string } | null)?.name ?? "",
    vendor_name:
      (i.menu_items as { vendors: { name: string } | null } | null)?.vendors
        ?.name ?? "",
    options:
      (i.order_item_options as { name: string; price_delta: number }[]) ?? [],
  }));

  const shortId = order.id.replace(/-/g, "").slice(0, 8);
  const totalItems = orderItems.reduce((sum, i) => sum + i.qty, 0);
  const totalPrice = orderItems.reduce(
    (sum, i) => sum + i.qty * i.unit_price,
    0
  );

  const baseUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">訂單 #{shortId}</h1>
          <p className="text-sm text-muted-foreground">
            狀態：{STATUS_LABELS[order.status] ?? order.status}
          </p>
          <p className="text-sm text-muted-foreground">
            建立時間：
            {format(new Date(order.created_at), "yyyy/MM/dd HH:mm", {
              locale: zhTW,
            })}
          </p>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          {orderItems.map((item) => {
            const itemTotal = item.qty * item.unit_price;
            const showQr =
              order.status === "confirmed" && !item.picked_up;

            return (
              <div
                key={item.id}
                className="border rounded-lg p-4 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2 flex-1">
                    {item.picked_up ? (
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                    )}
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">{item.menu_item_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.vendor_name}
                      </p>
                      {item.options.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          {item.options
                            .map((o) =>
                              o.price_delta !== 0
                                ? `${o.name} (+${o.price_delta})`
                                : o.name
                            )
                            .join("、")}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        取餐日：
                        {format(new Date(item.date), "MM/dd (EEE)", {
                          locale: zhTW,
                        })}
                      </p>
                      <p className="text-sm">
                        x{item.qty} ・ NT${itemTotal}
                      </p>
                    </div>
                  </div>
                  {showQr && (
                    <div className="shrink-0">
                      <QRCodeSVG
                        value={`${baseUrl}/api/pickup?item=${item.id}`}
                        size={120}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">共 {totalItems} 份</span>
          <span className="font-medium">合計 NT${totalPrice}</span>
        </div>
      </div>
    </main>
  );
}
