import { FoodWheel } from "@/components/food-wheel";
import { HomeItemCard } from "@/components/home-item-card";
import RecommendationSection from "@/components/recommendation-section";
import { DEFAULT_FACTORY_AREA_NAME } from "@/lib/branding";
import { getContextEmbedding, getCurrentContext } from "@/lib/context";
import { getDailyPick } from "@/lib/daily-pick";
import { recordImpressions } from "@/lib/impressions";
import { getHomeItems, getTrendingItems } from "@/lib/recommendation";
import { attachReasons, fetchReasonsForItems, triggerReasonGeneration } from "@/lib/reasons";
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

  const ctx = await getCurrentContext();
  const contextVec = ctx ? await getContextEmbedding(supabase, ctx) : null;

  const [items, trending, dailyPick] = await Promise.all([
    getHomeItems(area, 60, contextVec),
    getTrendingItems(8, area),
    user ? getDailyPick(supabase, user.id) : Promise.resolve(null),
  ]);

  let itemsWithReasons = items as ReturnType<typeof attachReasons<typeof items[number]>>;
  if (user) {
    const userId = user.id;
    const topForReasons = items.slice(0, 12);
    const reasons = await fetchReasonsForItems(
      supabase,
      userId,
      topForReasons.map((i) => i.id),
    );
    itemsWithReasons = attachReasons(items, reasons);

    after(async () => {
      const ids = [...items.map((i) => i.id), ...trending.map((t) => t.id)];
      await recordImpressions(supabase, userId, ids);

      const missing = topForReasons.filter((i) => !reasons.has(i.id));
      if (missing.length > 0) {
        await triggerReasonGeneration(supabase, missing);
      }
    });
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="w-full p-4 flex flex-col gap-8">
        {dailyPick && (
          <section className="flex flex-col gap-3">
            <h2 className="text-heading font-semibold">🎁 今日驚喜</h2>
            <div className="border rounded-card bg-card p-4 flex flex-col items-center gap-4">
              <div className="w-full max-w-xs">
                <HomeItemCard item={dailyPick} />
              </div>
            </div>
          </section>
        )}

        {items.length === 0 ? (
          <p className="text-muted-foreground text-center py-16">
            {area ? "此廠區目前沒有可預訂的餐點" : "請先選擇廠區"}
          </p>
        ) : (
          <>
            {trending.length > 0 && (
              <RecommendationSection title="🔥 熱銷排行" items={trending} />
            )}

            <section className="flex flex-col gap-3">
              <h2 className="text-heading font-semibold">所有餐點</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {itemsWithReasons.map((item) => (
                  <HomeItemCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
      <FoodWheel items={items} />
    </main>
  );
}
