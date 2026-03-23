import { AspectRatio } from "@/components/ui/aspect-ratio";
import { createClient } from "@/lib/supabase/server";
import { HeartIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ area?: string }>;
}

export default async function HomePage({ searchParams }: Props) {
  const { area } = await searchParams;
  const supabase = await createClient();

  if (!area) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("area_id")
        .eq("id", user.id)
        .single();
      if (profile?.area_id) redirect(`/?area=${profile.area_id}`);
    }
  }

  // 撈該區域的商家（透過 vendor_areas 關聯）
  let query = supabase
    .from("vendors")
    .select("id, name, description, tags, image_url, rating_good, rating_bad, is_open, vendor_areas!inner(area_id)")
    .eq("is_active", true);

  if (area) {
    query = query.eq("vendor_areas.area_id", area);
  }

  const { data: vendors } = await query.order("name");

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4">
        {vendors && vendors.length === 0 && (
          <p className="text-muted-foreground text-center py-16">
            {area ? "此校區目前沒有合作商家" : "請先選擇校區"}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(vendors ?? []).map((vendor) => {
            const total = vendor.rating_good + vendor.rating_bad;
            const rating = total > 0
              ? ((vendor.rating_good / total) * 5).toFixed(1)
              : null;

            return (
              <Link key={vendor.id} href={`/menu/${vendor.id}`}>
                <div className="hover:scale-[1.02] transition-all duration-200 w-full flex flex-col gap-3">
                  <AspectRatio className="bg-muted rounded-lg overflow-hidden" ratio={16 / 9}>
                    {vendor.image_url && (
                      <Image src={vendor.image_url} alt={vendor.name} fill className="object-cover" />
                    )}
                  </AspectRatio>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-md font-medium">{vendor.name}</p>
                      {!vendor.is_open && (
                        <span className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">暫停營業</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {rating && (
                        <span className="text-sm text-muted-foreground flex items-center gap-1">
                          <HeartIcon className="size-3" />
                          {rating} ({total})
                        </span>
                      )}
                      {vendor.tags.map((tag) => (
                        <span key={tag} className="text-xs text-muted-foreground border rounded-full px-2 py-0.5">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
