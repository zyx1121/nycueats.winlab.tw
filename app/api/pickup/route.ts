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

  // Check if all items in the order are picked up → complete the order
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
