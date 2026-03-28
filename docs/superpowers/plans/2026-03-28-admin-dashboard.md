# 管理員後台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立福委會管理後台 — 商家審核（申請制）、營運數據 Dashboard、多廠區商家服務範圍管理。

**Architecture:** 新增 `vendors.status` 欄位管理審核狀態。Admin layout 用 role guard 保護。Dashboard 用 SQL 聚合查詢產生指標，純 CSS/SVG 繪製圖表。服務區域在商家詳情頁用 checkbox 管理。

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), Supabase (Postgres + RLS), shadcn/ui, date-fns

**Spec:** `docs/superpowers/specs/2026-03-28-admin-dashboard-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Migrate | Supabase migration | `vendors.status` column + admin RLS policies |
| Modify | `types/supabase.ts` | Regenerate types |
| Create | `app/admin/layout.tsx` | Admin role guard + nav |
| Create | `app/admin/page.tsx` | Dashboard — stats + charts |
| Create | `app/admin/actions.ts` | Dashboard data queries |
| Create | `app/admin/stat-card.tsx` | Reusable stat card component |
| Create | `app/admin/bar-chart.tsx` | Simple CSS bar chart component |
| Create | `app/admin/trend-chart.tsx` | SVG line chart for order trends |
| Create | `app/admin/loading.tsx` | Skeleton loader |
| Create | `app/admin/vendors/page.tsx` | Vendor list with status tabs |
| Create | `app/admin/vendors/actions.ts` | Vendor management actions |
| Create | `app/admin/vendors/loading.tsx` | Skeleton loader |
| Create | `app/admin/vendors/[id]/page.tsx` | Vendor detail + review + areas |
| Create | `app/admin/vendors/[id]/vendor-review.tsx` | Client: review actions UI |
| Create | `app/admin/vendors/[id]/area-editor.tsx` | Client: area checkbox editor |
| Create | `app/admin/vendors/[id]/loading.tsx` | Skeleton loader |
| Modify | `components/header.tsx` | Add admin link |
| Modify | `README.md` | Sync features |

---

### Task 1: DB Migration — vendors.status + Admin RLS

**Files:**
- Migrate: Supabase migration
- Modify: `types/supabase.ts`

- [ ] **Step 1: Apply migration — add status column**

```sql
ALTER TABLE vendors ADD COLUMN status text NOT NULL DEFAULT 'approved';
```

- [ ] **Step 2: Apply migration — admin RLS policies**

Create a helper function and policies for admin access:

```sql
-- Helper function to check admin role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND 'admin' = ANY(role)
  );
$$;

-- Admin can read all vendors
CREATE POLICY vendors_read_admin ON vendors FOR SELECT USING (is_admin());

-- Admin can update vendors (status, is_active)
CREATE POLICY vendors_update_admin ON vendors FOR UPDATE USING (is_admin());

-- Admin can manage vendor_areas
CREATE POLICY vendor_areas_insert_admin ON vendor_areas FOR INSERT WITH CHECK (is_admin());
CREATE POLICY vendor_areas_delete_admin ON vendor_areas FOR DELETE USING (is_admin());
CREATE POLICY vendor_areas_read_admin ON vendor_areas FOR SELECT USING (is_admin());

-- Admin can read all orders (for dashboard)
CREATE POLICY orders_read_admin ON orders FOR SELECT USING (is_admin());

-- Admin can read all order_items (for dashboard)
CREATE POLICY order_items_read_admin ON order_items FOR SELECT USING (is_admin());

-- Admin can read all profiles (for user names)
CREATE POLICY profiles_read_admin ON profiles FOR SELECT USING (is_admin());
```

- [ ] **Step 3: Create admin test account**

```sql
-- Give an existing user admin role (use morning.bites for testing)
UPDATE profiles SET role = array_append(role, 'admin')
WHERE email = 'morning.bites@nycueats.dev'
AND NOT ('admin' = ANY(role));
```

- [ ] **Step 4: Regenerate types**

Use Supabase MCP `generate_typescript_types` and write to `types/supabase.ts`.

- [ ] **Step 5: Commit**

```bash
git add types/supabase.ts
git commit -m "feat(db): add vendor status column and admin RLS policies"
```

---

### Task 2: Admin Layout + Header Link

**Files:**
- Create: `app/admin/layout.tsx`
- Modify: `components/header.tsx`

- [ ] **Step 1: Create `app/admin/layout.tsx`**

Follow the same pattern as `app/vendor/layout.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role.includes("admin")) redirect("/");

  return (
    <div className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-4">
        <nav className="flex gap-2">
          <Link href="/admin">
            <Button variant="outline" size="sm">營運總覽</Button>
          </Link>
          <Link href="/admin/vendors">
            <Button variant="outline" size="sm">商家管理</Button>
          </Link>
        </nav>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add admin link to header**

In `components/header.tsx`, after the vendor link block, add an admin link:

```tsx
{isAdmin && (
  <Link href="/admin">
    <Button variant="outline" size="sm">管理後台</Button>
  </Link>
)}
```

Add `isAdmin` check: `const isAdmin = profile?.role?.includes("admin") ?? false;`

- [ ] **Step 3: Verify build** — `bun run build`

- [ ] **Step 4: Commit**

```bash
git add app/admin/layout.tsx components/header.tsx
git commit -m "feat(admin): add admin layout with role guard and header link"
```

---

### Task 3: Dashboard — Stats + Charts

**Files:**
- Create: `app/admin/actions.ts`
- Create: `app/admin/stat-card.tsx`
- Create: `app/admin/bar-chart.tsx`
- Create: `app/admin/trend-chart.tsx`
- Create: `app/admin/page.tsx`
- Create: `app/admin/loading.tsx`

- [ ] **Step 1: Create `app/admin/actions.ts`**

Server actions that query dashboard data:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";

export type DashboardStats = {
  thisMonthOrders: number;
  lastMonthOrders: number;
  thisMonthRevenue: number;
  lastMonthRevenue: number;
  completionRate: number;  // completed / (confirmed + completed)
  cancelRate: number;      // cancelled / total non-pending
};

export type DailyOrderCount = { date: string; count: number };

export type RankedItem = { name: string; count: number; revenue: number };

export async function getDashboardStats(): Promise<DashboardStats> {
  const supabase = await createClient();

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

  // This month orders
  const { count: thisMonthOrders } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .neq("status", "pending")
    .gte("created_at", thisMonthStart);

  // Last month orders
  const { count: lastMonthOrders } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .neq("status", "pending")
    .gte("created_at", lastMonthStart)
    .lte("created_at", lastMonthEnd);

  // Revenue: sum from order_items joined with orders
  const { data: thisMonthItems } = await supabase
    .from("order_items")
    .select("qty, unit_price, orders!inner(status, created_at)")
    .neq("orders.status", "pending")
    .gte("orders.created_at", thisMonthStart);

  const thisMonthRevenue = (thisMonthItems ?? []).reduce(
    (sum, i) => sum + i.qty * i.unit_price, 0
  );

  const { data: lastMonthItems } = await supabase
    .from("order_items")
    .select("qty, unit_price, orders!inner(status, created_at)")
    .neq("orders.status", "pending")
    .gte("orders.created_at", lastMonthStart)
    .lte("orders.created_at", lastMonthEnd);

  const lastMonthRevenue = (lastMonthItems ?? []).reduce(
    (sum, i) => sum + i.qty * i.unit_price, 0
  );

  // Completion & cancel rates
  const { data: allOrders } = await supabase
    .from("orders")
    .select("status")
    .neq("status", "pending");

  const total = allOrders?.length ?? 0;
  const completed = allOrders?.filter((o) => o.status === "completed").length ?? 0;
  const confirmed = allOrders?.filter((o) => o.status === "confirmed").length ?? 0;
  const cancelled = allOrders?.filter((o) => o.status === "cancelled").length ?? 0;

  return {
    thisMonthOrders: thisMonthOrders ?? 0,
    lastMonthOrders: lastMonthOrders ?? 0,
    thisMonthRevenue,
    lastMonthRevenue,
    completionRate: completed + confirmed > 0 ? completed / (completed + confirmed) : 0,
    cancelRate: total > 0 ? cancelled / total : 0,
  };
}

export async function getOrderTrend(days: number = 30): Promise<DailyOrderCount[]> {
  const supabase = await createClient();
  const startDate = new Date(new Date().getTime() - days * 86400000).toISOString().split("T")[0];

  const { data: orders } = await supabase
    .from("orders")
    .select("created_at")
    .neq("status", "pending")
    .gte("created_at", startDate);

  const byDate: Record<string, number> = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(new Date().getTime() - (days - 1 - i) * 86400000).toISOString().split("T")[0];
    byDate[d] = 0;
  }
  for (const o of orders ?? []) {
    const d = o.created_at.split("T")[0];
    if (byDate[d] !== undefined) byDate[d]++;
  }

  return Object.entries(byDate).map(([date, count]) => ({ date, count }));
}

export async function getTopVendors(limit: number = 5): Promise<RankedItem[]> {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("order_items")
    .select("qty, unit_price, menu_items!inner(vendor_id, vendors!inner(name)), orders!inner(status)")
    .neq("orders.status", "pending");

  const map: Record<string, RankedItem> = {};
  for (const i of items ?? []) {
    const name = (i.menu_items as { vendors: { name: string } })?.vendors?.name ?? "";
    map[name] ??= { name, count: 0, revenue: 0 };
    map[name].count += i.qty;
    map[name].revenue += i.qty * i.unit_price;
  }

  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, limit);
}

export async function getTopMenuItems(limit: number = 5): Promise<RankedItem[]> {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("order_items")
    .select("qty, unit_price, menu_items!inner(name), orders!inner(status)")
    .neq("orders.status", "pending");

  const map: Record<string, RankedItem> = {};
  for (const i of items ?? []) {
    const name = (i.menu_items as { name: string })?.name ?? "";
    map[name] ??= { name, count: 0, revenue: 0 };
    map[name].count += i.qty;
    map[name].revenue += i.qty * i.unit_price;
  }

  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, limit);
}
```

- [ ] **Step 2: Create `app/admin/stat-card.tsx`**

Server component for displaying a metric with comparison:

```tsx
export function StatCard({ title, value, prev, format = "number" }: {
  title: string;
  value: number;
  prev: number;
  format?: "number" | "currency" | "percent";
}) {
  const formatted = format === "currency"
    ? `$${value.toLocaleString()}`
    : format === "percent"
      ? `${(value * 100).toFixed(1)}%`
      : value.toLocaleString();

  const diff = prev > 0 ? ((value - prev) / prev) * 100 : 0;
  const diffText = diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;

  return (
    <div className="border rounded-lg p-4 flex flex-col gap-1">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold">{formatted}</p>
      {prev > 0 && (
        <p className={`text-xs ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
          {diffText} vs 上月
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `app/admin/bar-chart.tsx`**

Simple CSS horizontal bar chart:

```tsx
import type { RankedItem } from "@/app/admin/actions";

export function BarChart({ items, title }: { items: RankedItem[]; title: string }) {
  const max = Math.max(...items.map((i) => i.count), 1);

  return (
    <div className="border rounded-lg p-4 flex flex-col gap-3">
      <p className="font-medium">{title}</p>
      {items.length === 0 && <p className="text-sm text-muted-foreground">尚無資料</p>}
      {items.map((item) => (
        <div key={item.name} className="flex flex-col gap-1">
          <div className="flex justify-between text-sm">
            <span>{item.name}</span>
            <span className="text-muted-foreground">{item.count} 份 · ${item.revenue.toLocaleString()}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-foreground rounded-full"
              style={{ width: `${(item.count / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `app/admin/trend-chart.tsx`**

SVG polyline chart for daily order trend:

```tsx
import type { DailyOrderCount } from "@/app/admin/actions";

export function TrendChart({ data, title }: { data: DailyOrderCount[]; title: string }) {
  if (data.length === 0) return null;

  const max = Math.max(...data.map((d) => d.count), 1);
  const width = 600;
  const height = 200;
  const padding = 20;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - (d.count / max) * (height - 2 * padding);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="border rounded-lg p-4 flex flex-col gap-3">
      <p className="font-medium">{title}</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = height - padding - ratio * (height - 2 * padding);
          return (
            <line key={ratio} x1={padding} y1={y} x2={width - padding} y2={y}
              stroke="currentColor" strokeOpacity={0.1} />
          );
        })}
        {/* Line */}
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
        {/* Dots */}
        {data.map((d, i) => {
          const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
          const y = height - padding - (d.count / max) * (height - 2 * padding);
          return <circle key={i} cx={x} cy={y} r="3" fill="currentColor" />;
        })}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `app/admin/page.tsx`**

```tsx
import { getDashboardStats, getOrderTrend, getTopVendors, getTopMenuItems } from "@/app/admin/actions";
import { StatCard } from "@/app/admin/stat-card";
import { BarChart } from "@/app/admin/bar-chart";
import { TrendChart } from "@/app/admin/trend-chart";

export default async function AdminDashboardPage() {
  const [stats, trend, topVendors, topItems] = await Promise.all([
    getDashboardStats(),
    getOrderTrend(30),
    getTopVendors(5),
    getTopMenuItems(5),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">營運總覽</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="本月訂單" value={stats.thisMonthOrders} prev={stats.lastMonthOrders} />
        <StatCard title="本月營收" value={stats.thisMonthRevenue} prev={stats.lastMonthRevenue} format="currency" />
        <StatCard title="領餐完成率" value={stats.completionRate} prev={0} format="percent" />
        <StatCard title="取消率" value={stats.cancelRate} prev={0} format="percent" />
      </div>

      <TrendChart data={trend} title="近 30 天訂單趨勢" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BarChart items={topVendors} title="熱門商家 Top 5" />
        <BarChart items={topItems} title="熱門餐點 Top 5" />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `app/admin/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-lg" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify build** — `bun run build`

- [ ] **Step 8: Commit**

```bash
git add app/admin/
git commit -m "feat(admin): add dashboard with stats, trend chart, and rankings"
```

---

### Task 4: Vendor List Page

**Files:**
- Create: `app/admin/vendors/page.tsx`
- Create: `app/admin/vendors/loading.tsx`

- [ ] **Step 1: Create `app/admin/vendors/page.tsx`**

Shows vendor list with status tabs (pending / approved / suspended / rejected):

```tsx
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "待審核", className: "text-yellow-600 bg-yellow-50" },
  approved: { label: "已核准", className: "text-green-600 bg-green-50" },
  rejected: { label: "已拒絕", className: "text-red-600 bg-red-50" },
  suspended: { label: "已停用", className: "text-muted-foreground bg-muted" },
};

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus = "pending" } = await searchParams;
  const supabase = await createClient();

  const { data: vendors } = await supabase
    .from("vendors")
    .select("id, name, description, image_url, tags, is_active, status, created_at, owner_id, profiles:owner_id(email)")
    .eq("status", filterStatus)
    .order("created_at", { ascending: false });

  const tabs = ["pending", "approved", "suspended", "rejected"] as const;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">商家管理</h1>

      <div className="flex items-center gap-1 border rounded-full p-1 w-fit">
        {tabs.map((tab) => (
          <a
            key={tab}
            href={`/admin/vendors?status=${tab}`}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filterStatus === tab
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {statusConfig[tab].label}
          </a>
        ))}
      </div>

      {(!vendors || vendors.length === 0) && (
        <p className="text-muted-foreground text-center py-8">
          無{statusConfig[filterStatus]?.label ?? ""}商家
        </p>
      )}

      <div className="flex flex-col gap-3">
        {(vendors ?? []).map((vendor) => {
          const config = statusConfig[vendor.status] ?? statusConfig.pending;
          const email = (vendor.profiles as { email: string } | null)?.email ?? "";
          return (
            <Link key={vendor.id} href={`/admin/vendors/${vendor.id}`}>
              <div className="border rounded-lg p-4 flex items-center justify-between hover:scale-[1.02] transition-all duration-200">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{vendor.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${config.className}`}>
                      {config.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{vendor.description}</p>
                  <p className="text-xs text-muted-foreground">{email}</p>
                </div>
                <div className="flex gap-1">
                  {(vendor.tags ?? []).map((tag: string) => (
                    <span key={tag} className="text-xs border rounded-full px-2 py-0.5">{tag}</span>
                  ))}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `app/admin/vendors/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function VendorsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-10 w-80 rounded-full" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify build** — `bun run build`

- [ ] **Step 4: Commit**

```bash
git add app/admin/vendors/
git commit -m "feat(admin): add vendor list page with status tabs"
```

---

### Task 5: Vendor Detail + Review + Area Editor

**Files:**
- Create: `app/admin/vendors/actions.ts`
- Create: `app/admin/vendors/[id]/page.tsx`
- Create: `app/admin/vendors/[id]/vendor-review.tsx`
- Create: `app/admin/vendors/[id]/area-editor.tsx`
- Create: `app/admin/vendors/[id]/loading.tsx`

- [ ] **Step 1: Create `app/admin/vendors/actions.ts`**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function approveVendor(vendorId: string, areaIds: string[]) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("vendors")
    .update({ status: "approved", is_active: true })
    .eq("id", vendorId);

  if (error) return { error: "核准失敗" };

  // Set service areas
  await supabase.from("vendor_areas").delete().eq("vendor_id", vendorId);
  if (areaIds.length > 0) {
    await supabase.from("vendor_areas").insert(
      areaIds.map((area_id) => ({ vendor_id: vendorId, area_id }))
    );
  }

  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorId}`);
  return { success: true };
}

export async function rejectVendor(vendorId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("vendors")
    .update({ status: "rejected", is_active: false })
    .eq("id", vendorId);

  if (error) return { error: "拒絕失敗" };
  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorId}`);
  return { success: true };
}

export async function suspendVendor(vendorId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("vendors")
    .update({ status: "suspended", is_active: false })
    .eq("id", vendorId);

  if (error) return { error: "停用失敗" };
  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorId}`);
  return { success: true };
}

export async function reactivateVendor(vendorId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("vendors")
    .update({ status: "approved", is_active: true })
    .eq("id", vendorId);

  if (error) return { error: "啟用失敗" };
  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorId}`);
  return { success: true };
}

export async function updateVendorAreas(vendorId: string, areaIds: string[]) {
  const supabase = await createClient();

  await supabase.from("vendor_areas").delete().eq("vendor_id", vendorId);
  if (areaIds.length > 0) {
    await supabase.from("vendor_areas").insert(
      areaIds.map((area_id) => ({ vendor_id: vendorId, area_id }))
    );
  }

  revalidatePath(`/admin/vendors/${vendorId}`);
  return { success: true };
}
```

- [ ] **Step 2: Create `app/admin/vendors/[id]/vendor-review.tsx`**

Client component for review action buttons:

```tsx
"use client";

import { approveVendor, rejectVendor, suspendVendor, reactivateVendor } from "@/app/admin/vendors/actions";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function VendorReview({ vendorId, status, selectedAreas }: {
  vendorId: string;
  status: string;
  selectedAreas: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handle = (action: () => Promise<{ success?: boolean; error?: string }>) => {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  };

  if (status === "pending") {
    return (
      <div className="flex gap-3">
        <Button
          variant="destructive"
          disabled={isPending}
          onClick={() => handle(() => rejectVendor(vendorId))}
        >
          拒絕
        </Button>
        <Button
          disabled={isPending || selectedAreas.length === 0}
          onClick={() => handle(() => approveVendor(vendorId, selectedAreas))}
        >
          {isPending ? "處理中..." : "核准"}
        </Button>
      </div>
    );
  }

  if (status === "approved") {
    return (
      <Button
        variant="destructive"
        disabled={isPending}
        onClick={() => handle(() => suspendVendor(vendorId))}
      >
        停用商家
      </Button>
    );
  }

  if (status === "suspended") {
    return (
      <Button
        disabled={isPending}
        onClick={() => handle(() => reactivateVendor(vendorId))}
      >
        重新啟用
      </Button>
    );
  }

  return null;
}
```

- [ ] **Step 3: Create `app/admin/vendors/[id]/area-editor.tsx`**

Client component for area checkbox selection:

```tsx
"use client";

import { updateVendorAreas } from "@/app/admin/vendors/actions";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Area = { id: string; name: string; city: string };

export function AreaEditor({
  vendorId,
  areas,
  currentAreaIds,
  isPending: externalPending,
  onSelectionChange,
}: {
  vendorId: string;
  areas: Area[];
  currentAreaIds: string[];
  isPending?: boolean;
  onSelectionChange?: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(currentAreaIds));
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const byCity = areas.reduce<Record<string, Area[]>>((acc, area) => {
    (acc[area.city] ??= []).push(area);
    return acc;
  }, {});

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange?.([...next]);
      return next;
    });
  };

  const save = () => {
    startTransition(async () => {
      await updateVendorAreas(vendorId, [...selected]);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="font-medium">服務區域</p>
      {Object.entries(byCity).map(([city, cityAreas]) => (
        <div key={city} className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{city}</p>
          <div className="flex flex-wrap gap-2">
            {cityAreas.map((area) => (
              <button
                key={area.id}
                onClick={() => toggle(area.id)}
                className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                  selected.has(area.id)
                    ? "bg-foreground text-background"
                    : "hover:bg-muted"
                }`}
              >
                {area.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      {!onSelectionChange && (
        <Button size="sm" disabled={isPending || externalPending} onClick={save} className="w-fit">
          {isPending ? "儲存中..." : "儲存服務區域"}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `app/admin/vendors/[id]/page.tsx`**

```tsx
import { AreaEditor } from "@/app/admin/vendors/[id]/area-editor";
import { VendorReview } from "@/app/admin/vendors/[id]/vendor-review";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";
import { notFound } from "next/navigation";

const statusLabel: Record<string, string> = {
  pending: "待審核",
  approved: "已核准",
  rejected: "已拒絕",
  suspended: "已停用",
};

export default async function AdminVendorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: vendor } = await supabase
    .from("vendors")
    .select("*, profiles:owner_id(email, name)")
    .eq("id", id)
    .single();

  if (!vendor) notFound();

  const { data: areas } = await supabase
    .from("areas")
    .select("id, name, city")
    .eq("is_active", true)
    .order("city");

  const { data: vendorAreas } = await supabase
    .from("vendor_areas")
    .select("area_id")
    .eq("vendor_id", id);

  const currentAreaIds = (vendorAreas ?? []).map((va) => va.area_id);
  const profile = vendor.profiles as { email: string; name: string | null } | null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{vendor.name}</h1>
        <span className="text-sm text-muted-foreground">{statusLabel[vendor.status] ?? vendor.status}</span>
      </div>

      <div className="border rounded-lg p-4 flex flex-col gap-2">
        <p className="text-sm"><span className="text-muted-foreground">描述：</span>{vendor.description ?? "無"}</p>
        <p className="text-sm"><span className="text-muted-foreground">負責人：</span>{profile?.name ?? "未設定"}</p>
        <p className="text-sm"><span className="text-muted-foreground">Email：</span>{profile?.email ?? "未設定"}</p>
        <p className="text-sm"><span className="text-muted-foreground">標籤：</span>{(vendor.tags ?? []).join("、") || "無"}</p>
        <p className="text-sm"><span className="text-muted-foreground">申請時間：</span>{format(new Date(vendor.created_at), "yyyy/MM/dd HH:mm", { locale: zhTW })}</p>
      </div>

      <Separator />

      <AreaEditor vendorId={id} areas={areas ?? []} currentAreaIds={currentAreaIds} />

      <Separator />

      <VendorReview vendorId={id} status={vendor.status} selectedAreas={currentAreaIds} />
    </div>
  );
}
```

- [ ] **Step 5: Create `app/admin/vendors/[id]/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function VendorDetailLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 rounded-lg" />
      <Skeleton className="h-32 rounded-lg" />
      <Skeleton className="h-10 w-32" />
    </div>
  );
}
```

- [ ] **Step 6: Verify build** — `bun run build`

- [ ] **Step 7: Commit**

```bash
git add app/admin/vendors/
git commit -m "feat(admin): add vendor detail page with review actions and area editor"
```

---

### Task 6: Update README + Docs + PR

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

In the 基礎建設 section, add:
```
- 管理員後台（商家審核、營運數據 Dashboard、多廠區管理）
```

Remove from 尚未實作 table:
- `管理員 | 福委會後台（商家審核、營運數據）`
- `管理員 | 多廠區商家服務範圍管理`

Update 目錄結構 to include:
```
  (admin)/          # 管理員後台：營運總覽、商家管理
```

- [ ] **Step 2: Commit docs and README**

```bash
git add README.md QUESTIONS.md docs/
git commit -m "docs: add admin dashboard spec, plan, and sync README"
```
