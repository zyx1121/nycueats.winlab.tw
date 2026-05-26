// components/search-form.tsx
"use client";

import { FilterPanel } from "@/components/filter-panel";
import { countActiveFilters, parseFiltersFromParams } from "@/lib/filters";
import { Input } from "@/components/ui/input";
import { ListFilter, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

interface TagEntry { slug: string; label: string; axis: string }

interface Props {
  placeholderItems?: string[];
  tagVocabulary: TagEntry[];
}

const FALLBACK_PLACEHOLDERS = ["今天好熱", "高蛋白", "牛肉麵", "輕食", "辣"];
const CYCLE_MS = 2500;

export function SearchForm({ placeholderItems, tagVocabulary }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initialQ);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  const pool = placeholderItems?.length ? placeholderItems : FALLBACK_PLACEHOLDERS;

  useEffect(() => {
    if (pool.length <= 1) return;
    const id = setInterval(() => setPlaceholderIdx((i) => (i + 1) % pool.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [pool.length]);

  const activeFilterCount = countActiveFilters(
    parseFiltersFromParams(Object.fromEntries(searchParams.entries())),
  );

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    const area = searchParams.get("area");
    const url = `/search?q=${encodeURIComponent(q)}${area ? `&area=${area}` : ""}`;
    startTransition(() => router.push(url));
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Search + Filter pill */}
      <div className="flex items-center rounded-[14px] border border-border">
        <form onSubmit={handleSubmit} className="relative flex items-center">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-[13px] text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={pool[placeholderIdx] ?? "搜尋餐點"}
            className="h-9 w-44 rounded-l-[14px] rounded-r-none border-0 pl-8 pr-3 shadow-none md:w-56"
            disabled={isPending}
          />
        </form>

        {/* Divider */}
        <div className="h-5 w-px bg-border" />

        {/* Filter button + badge */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="flex h-9 items-center gap-[5px] rounded-r-[14px] px-3 text-[13px] font-medium text-foreground hover:bg-muted transition-colors"
          >
            <ListFilter className="size-[13px]" />
            篩選
          </button>
          {activeFilterCount > 0 && (
            <span className="pointer-events-none absolute -right-[7px] -top-[7px] flex h-[17px] w-[17px] items-center justify-center rounded-full border-2 border-card bg-brand text-[9px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
      </div>

      {/* Filter panel popover */}
      {filterOpen && (
        <FilterPanel
          tagVocabulary={tagVocabulary}
          onClose={() => setFilterOpen(false)}
        />
      )}
    </div>
  );
}
