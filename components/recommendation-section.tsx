import Link from "next/link";
import type { RecommendedItem } from "@/lib/recommendation";

interface Props {
  title: string;
  items: RecommendedItem[];
}

export default function RecommendationSection({ title, items }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-heading font-semibold">{title}</h2>
      <div className="flex overflow-x-auto gap-3 pb-2 snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/menu/${item.vendor_id}`}
            className="snap-start flex-shrink-0 w-48"
          >
            <div className="border rounded-card bg-card p-3 flex flex-col gap-2 h-full hover:scale-[1.02] transition-all duration-200">
              <p className="text-heading-sm font-semibold leading-tight line-clamp-2">{item.name}</p>
              <p className="text-meta text-muted-foreground">{item.vendor_name}</p>
              <p className="text-body font-semibold mt-auto">NT${item.price}</p>
              {item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {item.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="text-caption border rounded-pill px-2 py-0.5 text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
