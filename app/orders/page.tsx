import { getOrders } from "@/app/orders/actions";
import { OrderList } from "@/app/orders/order-list";

export default async function OrdersPage() {
  const { orders, hasMore } = await getOrders(0);

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-4">
        <h1 className="text-2xl font-bold">我的訂單</h1>
        <OrderList initial={orders} initialHasMore={hasMore} />
      </div>
    </main>
  );
}
