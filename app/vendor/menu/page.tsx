import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { VendorMenuItemCard } from "./menu-item-card";

export default async function VendorMenuPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id, name")
    .eq("owner_id", user.id)
    .single();

  if (!vendor) {
    return <p className="text-muted-foreground">尚未綁定商家帳號，請聯絡管理員。</p>;
  }

  const today = new Date().toISOString().split("T")[0];
  const sevenDaysLater = new Date(new Date().getTime() + 7 * 86400000).toISOString().split("T")[0];

  const { data: items } = await supabase
    .from("menu_items")
    .select("id, name, description, price, is_available, default_max_qty, image_url, calories, protein, sodium, sugar, tags, daily_slots(id, date, max_qty, reserved_qty), item_option_groups(id, name, required, max_select, sort_order, item_options(id, name, price_delta, sort_order))")
    .eq("vendor_id", vendor.id)
    .order("name");

  const itemsWithSlots = (items ?? []).map((item) => ({
    ...item,
    daily_slots: (item.daily_slots ?? []).filter(
      (s) => s.date > today && s.date <= sevenDaysLater
    ),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">{vendor.name} — 菜單管理</h1>
        <Button size="sm">新增餐點</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {itemsWithSlots.map((item) => (
          <VendorMenuItemCard key={item.id} item={item} />
        ))}
        {itemsWithSlots.length === 0 && (
          <p className="text-muted-foreground text-center py-8">尚無餐點，請新增</p>
        )}
      </div>
    </div>
  );
}
