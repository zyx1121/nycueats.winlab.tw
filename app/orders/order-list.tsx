"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import { getOrders, type OrderSummary } from "@/app/orders/actions";

type StatusConfig = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
};

const STATUS: Record<string, StatusConfig> = {
  confirmed: {
    label: "已確認",
    icon: Clock,
    className: "text-blue-600 bg-blue-50",
  },
  completed: {
    label: "已完成",
    icon: CheckCircle,
    className: "text-green-600 bg-green-50",
  },
  cancelled: {
    label: "已取消",
    icon: XCircle,
    className: "text-muted-foreground bg-muted",
  },
};

function OrderCard({ order }: { order: OrderSummary }) {
  const status = STATUS[order.status] ?? STATUS.cancelled;
  const Icon = status.icon;
  const total = order.items.reduce((sum, i) => sum + i.unit_price * i.qty, 0);
  const itemCount = order.items.reduce((sum, i) => sum + i.qty, 0);
  const preview = order.items
    .slice(0, 2)
    .map((i) => i.menu_item_name)
    .join("、");

  return (
    <Link href={`/orders/${order.id}`}>
      <div className="border rounded-lg p-4 flex flex-col gap-2 hover:scale-[1.02] transition-all duration-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-mono text-muted-foreground">
            #{order.id.slice(0, 8)}
          </span>
          <span
            className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}
          >
            <Icon className="w-3 h-3" />
            {status.label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {format(new Date(order.created_at), "yyyy年MM月dd日 HH:mm", {
            locale: zhTW,
          })}
        </p>
        <p className="text-sm">
          {preview}
          {order.items.length > 2 && ` 等 ${order.items.length} 項`}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">共 {itemCount} 份</span>
          <span className="text-sm font-bold">${total.toFixed(0)}</span>
        </div>
      </div>
    </Link>
  );
}

export function OrderList({
  initial,
  initialHasMore,
}: {
  initial: OrderSummary[];
  initialHasMore: boolean;
}) {
  const [orders, setOrders] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const page = useRef(1);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || !hasMore || loading) return;
        setLoading(true);
        const { orders: next, hasMore: more } = await getOrders(page.current);
        page.current += 1;
        setOrders((prev) => [...prev, ...next]);
        setHasMore(more);
        setLoading(false);
      },
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  if (orders.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-16">尚無訂單紀錄</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} />
      ))}
      <div ref={sentinel} />
      {loading && (
        <p className="text-sm text-muted-foreground text-center py-4">載入中…</p>
      )}
    </div>
  );
}
