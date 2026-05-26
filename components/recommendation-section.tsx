import { HomeItemCard } from "@/components/home-item-card";
import type { HomeItem } from "@/lib/recommendation";

interface Props {
  title: string;
  items: HomeItem[];
}

export default function RecommendationSection({ title, items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-heading font-semibold">{title}</h2>
      <div className="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <div
            key={item.id}
            className="snap-start flex-shrink-0 w-[calc(50%-0.5rem)] md:w-[calc(33.333%-0.667rem)] lg:w-[calc(25%-0.75rem)]"
          >
            <HomeItemCard item={item} />
          </div>
        ))}
      </div>
    </section>
  );
}
