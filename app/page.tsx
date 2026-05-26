import { FoodWheel } from "@/components/food-wheel";
import { HomeItemCard } from "@/components/home-item-card";
import RecommendationSection from "@/components/recommendation-section";
import { DEFAULT_FACTORY_AREA_NAME } from "@/lib/branding";
import { recordImpressions } from "@/lib/impressions";
import { getHomeItems, getTrendingItems } from "@/lib/recommendation";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { after } from "next/server";

interface Props {
  searchParams: Promise<{ area?: string }>;
}

export default async function HomePage({ searchParams }: Props) {
  const { area } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!area) {
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("area_id")
        .eq("id", user.id)
        .single();
      if (profile?.area_id) redirect(`/?area=${profile.area_id}`);
    }

    const { data: defaultArea } = await supabase
      .from("areas")
      .select("id")
      .eq("name", DEFAULT_FACTORY_AREA_NAME)
      .eq("is_active", true)
      .single();

    if (defaultArea?.id) redirect(`/?area=${defaultArea.id}`);
  }

  const [items, trending] = await Promise.all([
    getHomeItems(area),
    getTrendingItems(8, area),
  ]);

  if (user) {
    const userId = user.id;
    after(async () => {
      const ids = [...items.map((i) => i.id), ...trending.map((t) => t.id)];
      await recordImpressions(supabase, userId, ids);
    });
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="w-full p-4 flex flex-col gap-8">
        {trending.length > 0 && (
          <RecommendationSection title="🔥 熱銷排行" items={trending} accent />
        )}

        {items.length === 0 ? (
          <p className="text-muted-foreground text-center py-16">
            {area ? "此廠區目前沒有可預訂的餐點" : "請先選擇廠區"}
          </p>
        ) : (
          <>
            <FoodWheel items={items} />

            {items.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-heading font-semibold">所有餐點</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {items.map((item) => (
                    <HomeItemCard key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
