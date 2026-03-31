export type CartViewItem = {
  id: string;
  date: string;
  qty: number;
  unit_price: number;
  menu_items?: {
    name?: string | null;
    vendors?: {
      name?: string | null;
    } | null;
  } | null;
  order_item_options: {
    name: string;
    price_delta: number;
  }[];
};

export function buildCartViewModel(items: CartViewItem[]) {
  const byDate = items.reduce<Record<string, CartViewItem[]>>((acc, item) => {
    (acc[item.date] ??= []).push(item);
    return acc;
  }, {});

  return {
    byDate,
    dates: Object.keys(byDate).sort(),
    itemCount: items.length,
    total: items.reduce((sum, item) => sum + item.unit_price * item.qty, 0),
  };
}
