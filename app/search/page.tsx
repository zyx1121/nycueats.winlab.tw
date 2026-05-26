import { HomeItemCard } from "@/components/home-item-card";
import { searchHomeItems } from "@/lib/search";

interface Props {
  searchParams: Promise<{ q?: string; area?: string }>;
}

export default async function SearchPage({ searchParams }: Props) {
  const { q, area } = await searchParams;
  const query = q?.trim() ?? "";
  const items = query ? await searchHomeItems(query, area) : [];

  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="w-full p-4 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading font-semibold">
            {query ? `「${query}」的搜尋結果` : "搜尋"}
          </h1>
          {query && (
            <p className="text-meta text-muted-foreground">{items.length} 道餐點</p>
          )}
        </div>

        {!query ? (
          <p className="text-muted-foreground">請從上方輸入想吃的東西。</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center">
            找不到符合的餐點，試試其他關鍵字。
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((item) => (
              <HomeItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
