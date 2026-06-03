import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { captureActionError, identifyUser } from "@/lib/observability";

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
  identifyUser(user, profile.role);

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id")
    .eq("owner_id", user.id)
    .single();

  if (!vendor) return new Response("找不到商家帳號", { status: 403 });

  const { data: orderItem } = await supabase
    .from("order_items")
    .select("id, picked_up, order_id, menu_items!inner(vendor_id), orders!inner(status)")
    .eq("id", itemId)
    .single();

  if (!orderItem || (orderItem.menu_items as { vendor_id: string } | null)?.vendor_id !== vendor.id) {
    return new Response("此品項不屬於您的商店", { status: 403 });
  }

  const orderStatus = (orderItem.orders as { status: string } | null)?.status;
  if (orderStatus !== "confirmed") {
    return new Response("此訂單狀態不允許領餐", { status: 400 });
  }

  if (orderItem.picked_up) {
    return redirect("/vendor/orders?msg=already-picked-up");
  }

  const { error: pickupError } = await supabase
    .from("order_items")
    .update({ picked_up: true })
    .eq("id", itemId);
  if (pickupError) {
    captureActionError(pickupError, {
      action: "pickup",
      tags: { step: "mark_picked_up", vendor_id: vendor.id },
      extra: { itemId, orderId: orderItem.order_id },
    });
    return new Response("核銷失敗，請稍後再試", { status: 500 });
  }

  // Check if all items in the order are picked up → complete the order
  const { data: remaining } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderItem.order_id)
    .eq("picked_up", false);

  if (!remaining || remaining.length === 0) {
    const { error: completeError } = await supabase
      .from("orders")
      .update({ status: "completed" })
      .eq("id", orderItem.order_id);
    if (completeError) {
      captureActionError(completeError, {
        action: "pickup",
        tags: { step: "complete_order", vendor_id: vendor.id },
        extra: { orderId: orderItem.order_id },
      });
    }
  }

  return redirect("/vendor/orders?msg=picked-up");
}
