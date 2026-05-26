import { HomeItemCard } from "@/components/home-item-card";
import RecommendationSection from "@/components/recommendation-section";
import {
  getHomeItems,
  getNutritionPicks,
  getRandomPicks,
  getTrendingItems,
} from "@/lib/recommendation";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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
  }

  const [items, trending, nutritionPicks, randomPicks] = await Promise.all([
    getHomeItems(area),
    getTrendingItems(8, area),
    getNutritionPicks(8, area),
    getRandomPicks(user?.id ?? null, 8, area),
  ]);

  const hasCarousels = trending.length + nutritionPicks.length + randomPicks.length > 0;

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="w-full max-w-6xl p-4 flex flex-col gap-8">
        {hasCarousels && (
          <div className="flex flex-col gap-6">
            {trending.length > 0 && (
              <RecommendationSection title="🔥 熱銷排行" items={trending} accent />
            )}
            {nutritionPicks.length > 0 && (
              <RecommendationSection title="💪 營養推薦" items={nutritionPicks} />
            )}
            {randomPicks.length > 0 && (
              <RecommendationSection title="🎲 隨機探索" items={randomPicks} />
            )}
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-muted-foreground text-center py-16">
            {area ? "此校區目前沒有可預訂的餐點" : "請先選擇校區"}
          </p>
        ) : (
          <section className="flex flex-col gap-3">
            <h2 className="text-heading font-semibold">所有餐點</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {items.map((item) => (
                <HomeItemCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
