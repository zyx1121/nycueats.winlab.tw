import type { OrderSummary } from "@/app/orders/actions";

type OrderRow = {
  id: string;
  status: string;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  date: string;
  qty: number;
  unit_price: number;
  picked_up: boolean;
  order_id: string;
  menu_items: {
    name: string;
    vendors: { name: string } | null;
  } | null;
  order_item_options: { name: string; price_delta: number }[] | null;
};

export function buildOrderSummaries(
  orders: OrderRow[],
  allItems: OrderItemRow[]
): OrderSummary[] {
  const itemsByOrder = new Map<string, OrderItemRow[]>();

  for (const item of allItems) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }

  return orders.map((order) => ({
    id: order.id,
    status: order.status,
    created_at: order.created_at,
    items: (itemsByOrder.get(order.id) ?? []).map((item) => ({
      id: item.id,
      date: item.date,
      qty: item.qty,
      unit_price: item.unit_price,
      picked_up: item.picked_up,
      menu_item_name: item.menu_items?.name ?? "",
      vendor_name: item.menu_items?.vendors?.name ?? "",
      options: item.order_item_options ?? [],
    })),
  }));
}
