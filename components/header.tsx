import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getHeaderNavigation } from "@/lib/navigation-rules";
import { createClient } from "@/lib/supabase/server";
import { ClipboardList, ShoppingBasket } from "lucide-react";
import Link from "next/link";

export async function Header() {
  const supabase = await createClient();

  const [{ data: areas }, { data: { user } }] = await Promise.all([
    supabase.from("areas").select("id, name, city").eq("is_active", true).order("city"),
    supabase.auth.getUser(),
  ]);

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
    <header className="sticky top-0 z-50 p-4 flex w-full items-center justify-between h-16 bg-background/20 backdrop-blur-sm border-b">
      <div className="flex items-center gap-4">
        <Link href="/">
          <h1 className="text-xl font-bold">NYCU Eats</h1>
        </Link>
        <AreaSelect byCity={byCity} defaultAreaId={profile?.area_id ?? undefined} />
      </div>
      <div className="flex items-center gap-4">
        {navigation.showVendorDashboard && (
          <Link href="/vendor">
            <Button variant="outline" size="sm">商家後台</Button>
          </Link>
        )}
        {navigation.showOrderCatalog && (
          <Link href="/">
            <Button variant="outline" size="sm">點餐目錄</Button>
          </Link>
        )}
        {navigation.showAdminDashboard && (
          <Link href="/admin">
            <Button variant="outline" size="sm">管理後台</Button>
          </Link>
        )}
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

// 區域選擇器是 client component（需要 onChange）
import { AreaSelect } from "./area-select";
