import { AspectRatio } from "@/components/ui/aspect-ratio";
import type { HomeItem } from "@/lib/recommendation";
import Image from "next/image";
import Link from "next/link";

interface Props {
  item: HomeItem;
}

export function HomeItemCard({ item }: Props) {
  return (
    <Link
      href={`/menu/${item.vendor_id}#item-${item.id}`}
      className="group flex flex-col gap-3 hover:scale-[1.02] transition-all duration-200"
    >
      <AspectRatio
        ratio={1}
        className="bg-surface-placeholder rounded-card overflow-hidden relative"
      >
        {item.image_url && (
          <Image
            src={item.image_url}
            alt={item.name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover"
          />
        )}
        {item.top_tag_label && (
          <span className="absolute top-2 left-2 text-caption font-semibold rounded-badge bg-brand text-white px-2 py-1">
            因你喜歡 #{item.top_tag_label}
          </span>
        )}
        {!item.vendor_is_open && (
          <span className="absolute top-2 right-2 text-caption font-semibold rounded-badge bg-card/90 px-2 py-1 text-muted-foreground">
            暫停營業
          </span>
        )}
      </AspectRatio>
      <div className="flex flex-col gap-1 px-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-heading-sm font-semibold leading-tight line-clamp-2">{item.name}</p>
          <p className="text-body-strong shrink-0">${item.price}</p>
        </div>
        <p className="text-meta text-muted-foreground truncate">{item.vendor_name}</p>
        {item.ai_description && (
          <p className="text-meta text-muted-foreground line-clamp-2">{item.ai_description}</p>
        )}
        {(item.calories || item.protein) && (
          <div className="flex flex-wrap gap-x-2 text-caption text-muted-foreground">
            {item.calories && <span>{item.calories} kcal</span>}
            {item.protein && <span>蛋白 {item.protein}g</span>}
          </div>
        )}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-caption border rounded-pill px-2 py-0.5 text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
