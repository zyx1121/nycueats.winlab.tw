# 訂單流程補完 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 補完訂單生命週期 — 結帳確認、取消、訂單紀錄頁（infinite scroll）、領餐 QR code、商家批次/逐筆管理。

**Architecture:** 新增 `order_items.picked_up` 欄位追蹤逐筆領餐。購物車結帳翻 `confirmed`，商家掃 QR 標記領取，全部領完自動 `completed`。訂單紀錄用 offset-based pagination + IntersectionObserver infinite scroll。

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), Supabase (Postgres + RLS), shadcn/ui, `qrcode` (SVG generation), date-fns

**Spec:** `docs/superpowers/specs/2026-03-28-order-flow-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Migrate | Supabase migration | `order_items.picked_up` column |
| Modify | `types/supabase.ts` | Regenerate types |
| Modify | `app/cart/actions.ts` | Add `confirmOrder`, `cancelOrder` |
| Modify | `app/cart/page.tsx` | Add confirm/cancel buttons |
| Create | `app/cart/cart-actions.tsx` | Client component for confirm/cancel |
| Create | `app/orders/page.tsx` | Order history list |
| Create | `app/orders/loading.tsx` | Skeleton loader |
| Create | `app/orders/order-list.tsx` | Client: infinite scroll + order cards |
| Create | `app/orders/actions.ts` | `getOrders` for pagination |
| Create | `app/orders/[id]/page.tsx` | Order detail + QR codes |
| Create | `app/orders/[id]/loading.tsx` | Skeleton loader |
| Create | `app/orders/[id]/qr-code.tsx` | Client: QR code SVG renderer |
| Create | `app/api/pickup/route.ts` | GET handler for QR scan |
| Modify | `app/vendor/orders/page.tsx` | Rewrite: batch + per-item, status filter |
| Create | `app/vendor/orders/actions.ts` | `pickUpOrderItem`, `batchPickUp` |
| Create | `app/vendor/orders/order-detail.tsx` | Client: expandable per-item view |
| Create | `app/vendor/orders/pick-up-button.tsx` | Client: mark picked up buttons |
| Modify | `components/header.tsx` | Add orders link |

---

### Task 1: DB Migration — `order_items.picked_up`

**Files:**
- Migrate: Supabase migration via MCP
- Modify: `types/supabase.ts` (regenerate)

- [ ] **Step 1: Apply migration**

```sql
ALTER TABLE order_items ADD COLUMN picked_up boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Regenerate types**

```bash
npx supabase gen types typescript --project-id xgbxjkvatffsjqmgtmwe > types/supabase.ts
```

- [ ] **Step 3: Verify** `order_items.Row` includes `picked_up: boolean` in `types/supabase.ts`.

- [ ] **Step 4: Commit**

```bash
git add types/supabase.ts
git commit -m "feat(db): add picked_up column to order_items"
```

---

### Task 2: Server Actions — confirmOrder, cancelOrder

**Files:**
- Modify: `app/cart/actions.ts`

- [ ] **Step 1: Add confirmOrder**

```typescript
export async function confirmOrder(orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, user_id")
    .eq("id", orderId)
    .single();

  if (!order || order.user_id !== user.id) return { error: "訂單不存在" };
  if (order.status !== "pending") return { error: "此訂單無法結帳" };

  const { error } = await supabase
    .from("orders")
    .update({ status: "confirmed" })
    .eq("id", orderId);

  if (error) return { error: "結帳失敗" };
  revalidatePath("/cart");
  revalidatePath("/orders");
  return { success: true };
}
```

- [ ] **Step 2: Add cancelOrder**

```typescript
export async function cancelOrder(orderId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, user_id")
    .eq("id", orderId)
    .single();

  if (!order || order.user_id !== user.id) return { error: "訂單不存在" };
  if (order.status !== "pending") return { error: "此訂單無法取消" };

  // DELETE order_items → trigger releases daily_slots.reserved_qty
  await supabase.from("order_items").delete().eq("order_id", orderId);
  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);

  if (error) return { error: "取消失敗" };
  revalidatePath("/cart");
  revalidatePath("/orders");
  return { success: true };
}
```

- [ ] **Step 3: Verify build** — `bun run build`

- [ ] **Step 4: Commit**

```bash
git add app/cart/actions.ts
git commit -m "feat(orders): add confirmOrder and cancelOrder server actions"
```

---

### Task 3: Cart Page — Confirm & Cancel UI

**Files:**
- Create: `app/cart/cart-actions.tsx`
- Modify: `app/cart/page.tsx`

- [ ] **Step 1: Create `app/cart/cart-actions.tsx`**

```tsx
"use client";

import { confirmOrder, cancelOrder } from "@/app/cart/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function CartActions({ orderId, total, itemCount }: {
  orderId: string;
  total: number;
  itemCount: number;
}) {
  const router = useRouter();
  const [confirmPending, startConfirm] = useTransition();
  const [cancelPending, startCancel] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  return (
    <div className="flex gap-3">
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="flex-1" disabled={cancelPending}>清空購物車</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確定要清空購物車？</DialogTitle>
            <DialogDescription>所有品項將被移除，已預約的名額會釋放。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>返回</Button>
            <Button
              variant="destructive"
              disabled={cancelPending}
              onClick={() => startCancel(async () => {
                const res = await cancelOrder(orderId);
                if (res.success) { setCancelOpen(false); router.refresh(); }
              })}
            >
              {cancelPending ? "處理中..." : "確定清空"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger asChild>
          <Button className="flex-1" disabled={confirmPending}>
            結帳確認（${total.toFixed(0)}）
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認結帳</DialogTitle>
            <DialogDescription>共 {itemCount} 項，合計 ${total.toFixed(0)}。結帳後無法修改。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>返回</Button>
            <Button
              disabled={confirmPending}
              onClick={() => startConfirm(async () => {
                const res = await confirmOrder(orderId);
                if (res.success) { setConfirmOpen(false); router.push("/orders"); }
              })}
            >
              {confirmPending ? "處理中..." : "確認結帳"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Update `app/cart/page.tsx`**

Add import: `import { CartActions } from "@/app/cart/cart-actions";`

Replace the bottom `{dates.length > 0 && (...)}` block with:

```tsx
{dates.length > 0 && order && (
  <>
    <Separator />
    <div className="flex justify-between items-center">
      <p className="text-sm text-muted-foreground">共 {items.length} 項</p>
      <p className="text-lg font-bold">合計 ${total.toFixed(0)}</p>
    </div>
    <CartActions orderId={order.id} total={total} itemCount={items.length} />
  </>
)}
```

- [ ] **Step 3: Verify build** — `bun run build`

- [ ] **Step 4: Commit**

```bash
git add app/cart/cart-actions.tsx app/cart/page.tsx
git commit -m "feat(cart): add confirm and cancel order UI"
```

---

### Task 4: Orders Page — Infinite Scroll

**Files:**
- Create: `app/orders/actions.ts`
- Create: `app/orders/order-list.tsx`
- Create: `app/orders/page.tsx`
- Create: `app/orders/loading.tsx`

- [ ] **Step 1: Create `app/orders/actions.ts`**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";

export type OrderSummary = {
  id: string;
  status: string;
  created_at: string;
  items: {
    id: string;
    date: string;
    qty: number;
    unit_price: number;
    picked_up: boolean;
    menu_item_name: string;
    vendor_name: string;
    options: { name: string; price_delta: number }[];
  }[];
};

export async function getOrders(page: number, limit: number = 10): Promise<{
  orders: OrderSummary[];
  hasMore: boolean;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { orders: [], hasMore: false };

  const from = page * limit;
  const to = from + limit; // fetch limit+1 to detect hasMore

  const { data: orders } = await supabase
    .from("orders")
    .select("id, status, created_at")
    .eq("user_id", user.id)
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (!orders) return { orders: [], hasMore: false };

  const hasMore = orders.length > limit;
  const pageOrders = hasMore ? orders.slice(0, limit) : orders;

  const result: OrderSummary[] = [];
  for (const order of pageOrders) {
    const { data: items } = await supabase
      .from("order_items")
      .select("id, date, qty, unit_price, picked_up, menu_items(name, vendors(name)), order_item_options(name, price_delta)")
      .eq("order_id", order.id)
      .order("date");

    result.push({
      id: order.id,
      status: order.status,
      created_at: order.created_at,
      items: (items ?? []).map((i) => ({
        id: i.id,
        date: i.date,
        qty: i.qty,
        unit_price: i.unit_price,
        picked_up: i.picked_up,
        menu_item_name: i.menu_items?.name ?? "",
        vendor_name: i.menu_items?.vendors?.name ?? "",
        options: i.order_item_options ?? [],
      })),
    });
  }

  return { orders: result, hasMore };
}
```

- [ ] **Step 2: Create `app/orders/order-list.tsx`**

```tsx
"use client";

import { getOrders, type OrderSummary } from "@/app/orders/actions";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { CheckCircle, Clock, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const statusConfig = {
  confirmed: { label: "已確認", icon: Clock, className: "text-blue-600 bg-blue-50" },
  completed: { label: "已完成", icon: CheckCircle, className: "text-green-600 bg-green-50" },
  cancelled: { label: "已取消", icon: XCircle, className: "text-muted-foreground bg-muted" },
} as const;

export function OrderList({ initial, initialHasMore }: {
  initial: OrderSummary[];
  initialHasMore: boolean;
}) {
  const [orders, setOrders] = useState(initial);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    const res = await getOrders(page);
    setOrders((prev) => [...prev, ...res.orders]);
    setHasMore(res.hasMore);
    setPage((p) => p + 1);
    setLoading(false);
  }, [page, loading, hasMore]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  if (orders.length === 0) {
    return <p className="text-muted-foreground text-center py-16">尚無訂單紀錄</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {orders.map((order) => {
        const total = order.items.reduce((s, i) => s + i.unit_price * i.qty, 0);
        const config = statusConfig[order.status as keyof typeof statusConfig];
        const Icon = config?.icon ?? Clock;
        return (
          <Link key={order.id} href={`/orders/${order.id}`}>
            <div className="border rounded-lg p-4 flex flex-col gap-2 hover:scale-[1.02] transition-all duration-200">
              <div className="flex items-center justify-between">
                <p className="text-sm font-mono text-muted-foreground">#{order.id.slice(0, 8)}</p>
                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${config?.className ?? ""}`}>
                  <Icon className="size-3" />
                  {config?.label ?? order.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {format(new Date(order.created_at), "yyyy/MM/dd HH:mm", { locale: zhTW })}
                </p>
                <p className="text-sm">{order.items.length} 項</p>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground truncate max-w-[60%]">
                  {order.items.map((i) => i.menu_item_name).join("、")}
                </p>
                <p className="font-bold">${total.toFixed(0)}</p>
              </div>
            </div>
          </Link>
        );
      })}
      <div ref={sentinel} className="h-1" />
      {loading && <p className="text-sm text-muted-foreground text-center py-4">載入中...</p>}
    </div>
  );
}
```

- [ ] **Step 3: Create `app/orders/page.tsx`**

```tsx
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
```

- [ ] **Step 4: Create `app/orders/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersLoading() {
  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-4">
        <Skeleton className="h-8 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verify build** — `bun run build`

- [ ] **Step 6: Commit**

```bash
git add app/orders/
git commit -m "feat(orders): add order history page with infinite scroll"
```

---

### Task 5: Order Detail Page + QR Code

**Files:**
- Create: `app/orders/[id]/page.tsx`
- Create: `app/orders/[id]/qr-code.tsx`
- Create: `app/orders/[id]/loading.tsx`

- [ ] **Step 1: Install qrcode**

```bash
bun add qrcode @types/qrcode
```

- [ ] **Step 2: Create `app/orders/[id]/qr-code.tsx`**

Note: `dangerouslySetInnerHTML` is safe here — content comes from `qrcode` library, not user input.

```tsx
"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QRCodeSVG({ value, size = 120 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    QRCode.toString(value, { type: "svg", width: size, margin: 1 }).then(setSvg);
  }, [value, size]);

  if (!svg) return <div style={{ width: size, height: size }} className="bg-muted rounded" />;
  // Safe: SVG generated by qrcode library, not user input
  return <div dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

- [ ] **Step 3: Create `app/orders/[id]/page.tsx`**

```tsx
import { QRCodeSVG } from "@/app/orders/[id]/qr-code";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { CheckCircle, Circle } from "lucide-react";
import { notFound } from "next/navigation";

const statusLabel: Record<string, string> = {
  confirmed: "已確認",
  completed: "已完成",
  cancelled: "已取消",
};

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status, created_at, user_id")
    .eq("id", id)
    .single();

  if (!order || order.user_id !== user.id) notFound();

  const { data: items } = await supabase
    .from("order_items")
    .select("id, date, qty, unit_price, picked_up, menu_items(name, vendors(name)), order_item_options(name, price_delta)")
    .eq("order_id", order.id)
    .order("date");

  const total = (items ?? []).reduce((s, i) => s + i.unit_price * i.qty, 0);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">訂單明細</h1>
          <span className="text-sm text-muted-foreground">{statusLabel[order.status] ?? order.status}</span>
        </div>

        <div className="text-sm text-muted-foreground flex flex-col gap-1">
          <p>訂單編號：#{order.id.slice(0, 8)}</p>
          <p>建立時間：{format(new Date(order.created_at), "yyyy/MM/dd HH:mm", { locale: zhTW })}</p>
        </div>

        <Separator />

        <div className="flex flex-col gap-3">
          {(items ?? []).map((item) => (
            <div key={item.id} className="border rounded-lg p-4 flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1 flex-1">
                <div className="flex items-center gap-2">
                  {item.picked_up
                    ? <CheckCircle className="size-4 text-green-600" />
                    : <Circle className="size-4 text-muted-foreground" />}
                  <p className="font-medium">{item.menu_items?.name}</p>
                </div>
                <p className="text-xs text-muted-foreground ml-6">{item.menu_items?.vendors?.name}</p>
                {item.order_item_options.length > 0 && (
                  <p className="text-xs text-muted-foreground ml-6">
                    {item.order_item_options.map((o) => o.name).join("、")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground ml-6">
                  {format(new Date(item.date), "MM/dd EEEE", { locale: zhTW })} · x{item.qty} · ${(item.unit_price * item.qty).toFixed(0)}
                </p>
              </div>
              {order.status === "confirmed" && !item.picked_up && (
                <QRCodeSVG value={`${baseUrl}/api/pickup?item=${item.id}`} size={80} />
              )}
            </div>
          ))}
        </div>

        <Separator />
        <div className="flex justify-between items-center">
          <p className="text-sm text-muted-foreground">共 {items?.length ?? 0} 項</p>
          <p className="text-lg font-bold">合計 ${total.toFixed(0)}</p>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Create `app/orders/[id]/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function OrderDetailLoading() {
  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-60" />
        <Skeleton className="h-4 w-48" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Verify build** — `bun run build`

- [ ] **Step 6: Commit**

```bash
git add app/orders/\[id\]/ package.json bun.lockb
git commit -m "feat(orders): add order detail page with QR codes"
```

---

### Task 6: Pickup API Route

**Files:**
- Create: `app/api/pickup/route.ts`

- [ ] **Step 1: Create `app/api/pickup/route.ts`**

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const itemId = request.nextUrl.searchParams.get("item");
  if (!itemId) return new Response("Missing item ID", { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return redirect("/login");

  // Verify vendor role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role?.includes("vendor")) {
    return new Response("需要商家權限", { status: 403 });
  }

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!vendor) return new Response("找不到商家帳號", { status: 403 });

  const { data: orderItem } = await supabase
    .from("order_items")
    .select("id, picked_up, order_id, menu_items!inner(vendor_id)")
    .eq("id", itemId)
    .single();

  if (!orderItem || orderItem.menu_items?.vendor_id !== vendor.id) {
    return new Response("此品項不屬於您的商店", { status: 403 });
  }

  if (orderItem.picked_up) {
    return redirect("/vendor/orders?msg=already-picked-up");
  }

  await supabase.from("order_items").update({ picked_up: true }).eq("id", itemId);

  // Check if all items in the order are picked up → complete
  const { data: remaining } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderItem.order_id)
    .eq("picked_up", false);

  if (!remaining || remaining.length === 0) {
    await supabase.from("orders").update({ status: "completed" }).eq("id", orderItem.order_id);
  }

  return redirect("/vendor/orders?msg=picked-up");
}
```

- [ ] **Step 2: Verify build** — `bun run build`

- [ ] **Step 3: Commit**

```bash
git add app/api/pickup/
git commit -m "feat(orders): add QR code pickup API route"
```

---

### Task 7: Vendor Orders — Batch + Per-Item View

**Files:**
- Create: `app/vendor/orders/actions.ts`
- Create: `app/vendor/orders/pick-up-button.tsx`
- Create: `app/vendor/orders/order-detail.tsx`
- Modify: `app/vendor/orders/page.tsx`

- [ ] **Step 1: Create `app/vendor/orders/actions.ts`**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function pickUpOrderItem(orderItemId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "請先登入" };

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!vendor) return { error: "找不到商家帳號" };

  const { data: item } = await supabase
    .from("order_items")
    .select("id, order_id, menu_items!inner(vendor_id)")
    .eq("id", orderItemId)
    .single();

  if (!item || item.menu_items?.vendor_id !== vendor.id) return { error: "此品項不屬於您" };

  await supabase.from("order_items").update({ picked_up: true }).eq("id", orderItemId);

  const { data: remaining } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", item.order_id)
    .eq("picked_up", false);

  if (!remaining || remaining.length === 0) {
    await supabase.from("orders").update({ status: "completed" }).eq("id", item.order_id);
  }

  revalidatePath("/vendor/orders");
  return { success: true };
}

export async function batchPickUp(orderItemIds: string[]) {
  const results = await Promise.all(orderItemIds.map(pickUpOrderItem));
  const errors = results.filter((r) => r.error);
  if (errors.length > 0) return { error: `${errors.length} 筆失敗` };
  return { success: true };
}
```

- [ ] **Step 2: Create `app/vendor/orders/pick-up-button.tsx`**

```tsx
"use client";

import { pickUpOrderItem, batchPickUp } from "@/app/vendor/orders/actions";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";

export function PickUpButton({ orderItemId }: { orderItemId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="sm" variant="outline" disabled={isPending}
      onClick={() => startTransition(() => pickUpOrderItem(orderItemId))}
    >
      {isPending ? "處理中..." : "已領取"}
    </Button>
  );
}

export function BatchPickUpButton({ orderItemIds }: { orderItemIds: string[] }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="sm" disabled={isPending || orderItemIds.length === 0}
      onClick={() => startTransition(() => batchPickUp(orderItemIds))}
    >
      {isPending ? "處理中..." : `全部已領取（${orderItemIds.length} 筆）`}
    </Button>
  );
}
```

- [ ] **Step 3: Create `app/vendor/orders/order-detail.tsx`**

```tsx
"use client";

import { PickUpButton, BatchPickUpButton } from "@/app/vendor/orders/pick-up-button";
import { CheckCircle, ChevronDown, Circle } from "lucide-react";
import { useState } from "react";

type OrderItem = {
  id: string;
  qty: number;
  unit_price: number;
  picked_up: boolean;
  user_name: string;
  options: string;
};

export function OrderDetail({ items }: { items: OrderItem[] }) {
  const [open, setOpen] = useState(false);
  const unpickedIds = items.filter((i) => !i.picked_up).map((i) => i.id);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "收合" : "展開明細"}（{items.length} 筆）
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between pl-4 py-2 border-l-2">
              <div className="flex items-center gap-2">
                {item.picked_up
                  ? <CheckCircle className="size-4 text-green-600" />
                  : <Circle className="size-4 text-muted-foreground" />}
                <div>
                  <p className="text-sm">{item.user_name} · x{item.qty}</p>
                  {item.options && <p className="text-xs text-muted-foreground">{item.options}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm">${(item.unit_price * item.qty).toFixed(0)}</p>
                {!item.picked_up && <PickUpButton orderItemId={item.id} />}
              </div>
            </div>
          ))}
          {unpickedIds.length > 0 && (
            <div className="pl-4 pt-2">
              <BatchPickUpButton orderItemIds={unpickedIds} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `app/vendor/orders/page.tsx`**

```tsx
import { OrderDetail } from "@/app/vendor/orders/order-detail";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { redirect } from "next/navigation";

export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;
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

  const statusFilter = filterStatus === "completed" ? "completed" : "confirmed";

  const { data: orderItems } = await supabase
    .from("order_items")
    .select(`
      id, date, qty, unit_price, picked_up,
      menu_items!inner(name, vendor_id),
      orders!inner(id, status, profiles:user_id(name)),
      order_item_options(name)
    `)
    .eq("menu_items.vendor_id", vendor.id)
    .gte("date", today)
    .lte("date", sevenDaysLater)
    .eq("orders.status", statusFilter)
    .order("date");

  type ItemDetail = {
    id: string; qty: number; unit_price: number;
    picked_up: boolean; user_name: string; options: string;
  };
  type MenuEntry = { name: string; count: number; revenue: number; items: ItemDetail[] };

  const byDate: Record<string, Record<string, MenuEntry>> = {};

  for (const item of orderItems ?? []) {
    const name = item.menu_items?.name ?? "";
    const d = byDate[item.date] ??= {};
    const entry = d[name] ??= { name, count: 0, revenue: 0, items: [] };
    entry.count += item.qty;
    entry.revenue += item.qty * item.unit_price;

    const orderData = item.orders as Record<string, unknown> | null;
    const profileData = orderData?.profiles as Record<string, string> | null;

    entry.items.push({
      id: item.id,
      qty: item.qty,
      unit_price: item.unit_price,
      picked_up: item.picked_up,
      user_name: profileData?.name ?? "匿名",
      options: (item.order_item_options ?? []).map((o) => o.name).join("、"),
    });
  }

  const dates = Object.keys(byDate).sort();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">訂單管理</h1>
        <div className="flex gap-2">
          <a
            href="/vendor/orders"
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${statusFilter === "confirmed" ? "bg-primary text-primary-foreground" : ""}`}
          >
            待領取
          </a>
          <a
            href="/vendor/orders?status=completed"
            className={`text-sm px-3 py-1 rounded-full border transition-colors ${statusFilter === "completed" ? "bg-primary text-primary-foreground" : ""}`}
          >
            已完成
          </a>
        </div>
      </div>

      {dates.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          未來 7 天無{statusFilter === "confirmed" ? "待領取" : "已完成"}訂單
        </p>
      )}

      {dates.map((date) => {
        const menuItems = Object.values(byDate[date]);
        const dayTotal = menuItems.reduce((s, i) => s + i.revenue, 0);
        return (
          <div key={date} className="flex flex-col gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {format(new Date(date), "MM月dd日 EEEE", { locale: zhTW })}
            </p>
            <div className="border rounded-lg divide-y">
              {menuItems.map((mi) => (
                <div key={mi.name} className="p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{mi.name}</p>
                    <div className="flex items-center gap-6">
                      <p className="text-sm text-muted-foreground">x{mi.count} 份</p>
                      <p className="text-sm font-medium">${mi.revenue.toFixed(0)}</p>
                    </div>
                  </div>
                  <OrderDetail items={mi.items} />
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
```

- [ ] **Step 5: Verify build** — `bun run build`

- [ ] **Step 6: Commit**

```bash
git add app/vendor/orders/
git commit -m "feat(vendor): rewrite order management with batch and per-item views"
```

---

### Task 8: Header — Add Orders Link

**Files:**
- Modify: `components/header.tsx`

- [ ] **Step 1: Add orders link**

In `components/header.tsx`, change the lucide import:

```tsx
import { ClipboardList, ShoppingBasket } from "lucide-react";
```

Add before the cart `<Link>`:

```tsx
<Link href="/orders">
  <Button variant="outline">
    <ClipboardList className="size-4" />
  </Button>
</Link>
```

- [ ] **Step 2: Verify build** — `bun run build`

- [ ] **Step 3: Commit**

```bash
git add components/header.tsx
git commit -m "feat(ui): add orders link to header"
```

---

### Task 9: Integration Test + Docs

- [ ] **Step 1: Manual integration test**

Start dev server (`bun run dev`) and verify:

1. Add items to cart → cart shows items
2. Click "結帳確認" → dialog → confirm → redirect to `/orders`
3. Order shows "已確認" with QR codes on `/orders/[id]`
4. Visit QR URL as vendor → item marked picked up
5. Vendor orders page shows confirmed orders with expand/collapse
6. "已領取" button works, batch button works
7. Cart is empty after confirm (new pending order on next add)
8. Cancel flow: add items → "清空購物車" → items removed

- [ ] **Step 2: Commit docs**

```bash
git add QUESTIONS.md docs/
git commit -m "docs: add order flow spec, plan, and open questions"
```
