import { AreaSelect } from "./area-select";
import { SearchForm } from "./search-form";
import { ThemeToggle } from "./theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { APP_BRAND } from "@/lib/branding";
import { getHeaderNavigation } from "@/lib/navigation-rules";
import { createClient } from "@/lib/supabase/server";
import { ClipboardList, ShoppingBasket } from "lucide-react";
import Link from "next/link";

export async function Header() {
  const supabase = await createClient();

  const [{ data: areas }, { data: { user } }, { data: itemNames }] = await Promise.all([
    supabase.from("areas").select("id, name, city").eq("is_active", true).order("city"),
    supabase.auth.getUser(),
    supabase.from("menu_items").select("name").eq("is_available", true).limit(60),
  ]);
  // Random subset for search placeholder rotation; shuffled here (server)
  // because doing Math.random() in a client component trips react-hooks/purity.
  const placeholderItems = (itemNames ?? [])
    .map((i) => i.name)
    .filter(Boolean)
    .sort(() => Math.random() - 0.5)
    .slice(0, 12);

  const profile = user
    ? (await supabase.from("profiles").select("avatar_url, name, area_id, role").eq("id", user.id).single()).data
    : null;

  const navigation = getHeaderNavigation(profile?.role ?? []);

  // 依 city 分組
  type AreaRow = { id: string; name: string; city: string };
  const byCity = (areas ?? []).reduce<Record<string, AreaRow[]>>((acc, area) => {
    if (!area) return acc;
    (acc[area.city] ??= []).push(area);
    return acc;
  }, {});

  return (
    <header className="sticky top-0 z-50 p-4 flex w-full items-center justify-between h-16 bg-card/80 backdrop-blur-sm border-b">
      <div className="flex items-center gap-4">
        <Link href="/">
          <h1 className="text-heading font-semibold tracking-tight">
            {APP_BRAND.primary} <span className="text-brand">{APP_BRAND.accent}</span>
          </h1>
        </Link>
        {navigation.showAreaSelect && <AreaSelect byCity={byCity} defaultAreaId={profile?.area_id ?? undefined} />}
        {navigation.showSearch && <SearchForm placeholderItems={placeholderItems} />}
      </div>
      <div className="flex items-center gap-4">
        {navigation.showAdminDashboard && (
          <Link href="/admin">
            <Button variant="outline" size="sm">管理後台</Button>
          </Link>
        )}
        {navigation.showVendorDashboard && (
          <Link href="/vendor">
            <Button variant="outline" size="sm">商家後台</Button>
          </Link>
        )}
        <ThemeToggle />
        {navigation.showOrders && (
          <Link href="/orders">
            <Button variant="outline">
              <ClipboardList className="size-4" />
            </Button>
          </Link>
        )}
        {navigation.showCart && (
          <Link href="/cart">
            <Button variant="outline">
              <ShoppingBasket className="size-4" />
            </Button>
          </Link>
        )}
        {user ? (
          <Link href="/profile">
            <Avatar>
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback>{profile?.name?.[0] ?? "?"}</AvatarFallback>
            </Avatar>
          </Link>
        ) : (
          <Link href="/login">
            <Button variant="outline" size="sm">登入</Button>
          </Link>
        )}
      </div>
    </header>
  );
}
