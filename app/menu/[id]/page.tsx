import { AddToOrderDialog } from "@/app/menu/[id]/add-to-order-dialog";
import { MenuItemCard } from "@/components/menu-item-card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { createClient } from "@/lib/supabase/server";
import { HeartIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function MenuPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const today = new Date().toISOString().split("T")[0];
  const sevenDaysLater = new Date(new Date().getTime() + 7 * 86400000).toISOString().split("T")[0];

  const [{ data: vendor }, { data: menuItems }] = await Promise.all([
    supabase
      .from("vendors")
      .select("id, name, description, tags, image_url, rating_good, rating_bad, is_open, operating_days")
      .eq("id", id)
      .eq("is_active", true)
      .single(),
    supabase
      .from("menu_items")
      .select("id, name, description, price, image_url, calories, protein, sodium, sugar, daily_slots(id, date, max_qty, reserved_qty), item_option_groups(id, name, required, max_select, sort_order, item_options(id, name, price_delta, sort_order))")
      .eq("vendor_id", id)
      .eq("is_available", true)
      .order("name"),
  ]);

  if (!vendor) notFound();

  const total = vendor.rating_good + vendor.rating_bad;
  const rating = total > 0 ? ((vendor.rating_good / total) * 5).toFixed(1) : null;

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-2">
        <AspectRatio className="bg-muted rounded-lg overflow-hidden" ratio={16 / 5}>
          {vendor.image_url && (
            <Image src={vendor.image_url} alt={vendor.name} fill sizes="(max-width: 1152px) 100vw, 1152px" className="object-cover" priority />
          )}
        </AspectRatio>
        <div className="flex items-center gap-3 mt-4">
          <h1 className="text-4xl font-bold">{vendor.name}</h1>
          {!vendor.is_open && (
            <span className="text-sm border rounded-full px-3 py-1 text-muted-foreground">暫停營業</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {rating && (
            <span className="text-md text-muted-foreground flex items-center gap-1">
              <HeartIcon className="size-4" />{rating} ({total})
            </span>
          )}
          {vendor.tags.map((tag, i) => (
            <span key={tag} className="text-md text-muted-foreground">
              {i === 0 && rating ? "．" : i > 0 ? "．" : ""}
              <Link href={`/?tag=${tag}`}>{tag}</Link>
            </span>
          ))}
        </div>
        {vendor.description && (
          <p className="text-md text-muted-foreground">{vendor.description}</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {(menuItems ?? []).map((item) => {
            const slots = vendor.is_open
              ? (item.daily_slots ?? []).filter((s) => {
                  if (s.date <= today || s.date > sevenDaysLater) return false;
                  const dow = new Date(s.date + "T00:00:00").getDay();
                  return vendor.operating_days.includes(dow);
                })
              : [];
            const hasAvailable = slots.some((s) => s.max_qty - s.reserved_qty > 0);

            return (
              <AddToOrderDialog key={item.id} vendorId={vendor.id} item={item} slots={slots} optionGroups={item.item_option_groups} disabled={!hasAvailable}>
                <MenuItemCard
                  item={item}
                  status={!hasAvailable && (
                    <p className="text-sm text-destructive">本週已售完</p>
                  )}
                />
              </AddToOrderDialog>
            );
          })}
        </div>
      </div>
    </main>
  );
}
