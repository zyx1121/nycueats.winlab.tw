"use client";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import Image from "next/image";

type Item = {
  name: string;
  description: string | null;
  price: number;
  image_url?: string | null;
  calories?: number | null;
  protein?: number | null;
  sodium?: number | null;
};

interface Props {
  item: Item;
  onClick?: () => void;
  status?: React.ReactNode;
  disabled?: boolean;
}

export function MenuItemCard({ item, onClick, status, disabled }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`hover:scale-[1.02] transition-all duration-200 h-full border rounded-card bg-card flex justify-between max-h-64 cursor-pointer text-left w-full ${disabled ? "opacity-50" : ""}`}
    >
      <div className="flex flex-col p-4 gap-2 flex-1 min-w-0">
        <h2 className="text-heading-sm font-semibold">{item.name}</h2>
        <p className="text-body font-semibold">${item.price}</p>
        {item.description && (
          <p className="text-body text-muted-foreground line-clamp-2">{item.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {item.calories && <p className="text-meta text-muted-foreground">熱量 {item.calories}kcal</p>}
          {item.protein && <p className="text-meta text-muted-foreground">蛋白質 {item.protein}g</p>}
          {item.sodium && <p className="text-meta text-muted-foreground">鈉 {item.sodium}mg</p>}
        </div>
        {status}
      </div>
      <div className="max-w-40 w-full shrink-0">
        <AspectRatio ratio={1} className="bg-surface-placeholder rounded-r-card overflow-hidden">
          {item.image_url && (
            <Image
              src={item.image_url}
              alt={item.name}
              fill
              sizes="(max-width: 768px) 40vw, 160px"
              className="object-cover"
            />
          )}
        </AspectRatio>
      </div>
    </button>
  );
}
