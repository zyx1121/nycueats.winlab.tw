// components/filter-panel.tsx
"use client";

import { DualRangeSlider } from "@/components/dual-range-slider";
import { Skeleton } from "@/components/ui/skeleton";
import { getDateQuotas, type DateQuota } from "@/app/actions/filter";
import {
  countActiveFilters,
  filtersToSearchParams,
  parseFiltersFromParams,
  type SearchFilters,
  type TagEntry,
} from "@/lib/filters";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useRef, useState, useTransition } from "react";

const AXIS_LABELS: Record<string, string> = {
  taste: "口味", diet: "飲食偏好", cuisine: "料理風格",
  category: "品項類型", temperature: "溫度", occasion: "場合",
};
const SORT_OPTIONS = [
  { value: "recommended", label: "推薦（預設）" },
  { value: "price_asc",   label: "價格：低 → 高" },
  { value: "price_desc",  label: "價格：高 → 低" },
  { value: "cal_asc",     label: "熱量：低 → 高" },
] as const;
const DOW = ["日", "一", "二", "三", "四", "五", "六"];

function SortRadio({ sort, setSort }: { sort: SearchFilters["sort"]; setSort: (v: SearchFilters["sort"]) => void }) {
  return (
    <div className="flex flex-col gap-[7px]">
      {SORT_OPTIONS.map((opt) => (
        <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-[13px]">
          <span className={`flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${sort === opt.value ? "border-foreground" : "border-border"}`}>
            {sort === opt.value && <span className="h-[7px] w-[7px] rounded-full bg-foreground" />}
          </span>
          <input type="radio" className="sr-only" checked={sort === opt.value} onChange={() => setSort(opt.value)} />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

function TagAxisGroup({ axis, tags, selTags, onToggle }: { axis: string; tags: TagEntry[]; selTags: string[]; onToggle: (label: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-[11px] text-muted-foreground">{AXIS_LABELS[axis] ?? axis}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <button key={t.label} onClick={() => onToggle(t.label)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${selTags.includes(t.label) ? "border-foreground bg-foreground text-card" : "border-border bg-surface-canvas hover:border-foreground/40"}`}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  tagVocabulary: TagEntry[];
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
  currentQuery?: string;
}

export function FilterPanel({ tagVocabulary, onClose, anchorRef, currentQuery }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  const initial = parseFiltersFromParams(Object.fromEntries(searchParams.entries()));
  const [open,     setOpen]     = useState(initial.open ?? false);
  const [sort,     setSort]     = useState<SearchFilters["sort"]>(initial.sort ?? "recommended");
  const [priceMin, setPriceMin] = useState(initial.priceMin ?? 0);
  const [priceMax, setPriceMax] = useState(initial.priceMax ?? 500);
  const [calMin,   setCalMin]   = useState(initial.calMin   ?? 0);
  const [calMax,   setCalMax]   = useState(initial.calMax   ?? 1000);
  const [selDates, setSelDates] = useState<string[]>(initial.dates ?? []);
  const [selTags,  setSelTags]  = useState<string[]>(initial.tags  ?? []);
  const [quotas,   setQuotas]   = useState<DateQuota[]>([]);

  useEffect(() => { getDateQuotas().then(setQuotas); }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !anchorRef?.current?.contains(e.target as Node)
      ) { onClose(); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  const toggleDate = (date: string) =>
    setSelDates((prev) => prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]);
  const toggleTag = (slug: string) =>
    setSelTags((prev) => prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]);

  function buildFilters(): SearchFilters {
    return {
      open:     open || undefined,
      sort:     sort !== "recommended" ? sort : undefined,
      dates:    selDates.length ? selDates : undefined,
      priceMin: priceMin > 0    ? priceMin : undefined,
      priceMax: priceMax < 500  ? priceMax : undefined,
      calMin:   calMin   > 0    ? calMin   : undefined,
      calMax:   calMax   < 1000 ? calMax   : undefined,
      tags:     selTags.length  ? selTags  : undefined,
    };
  }

  function handleApply() {
    const q = (currentQuery ?? "").trim();
    const area = searchParams.get("area");
    const all = new URLSearchParams({ ...(q ? { q } : {}), ...(area ? { area } : {}), ...filtersToSearchParams(buildFilters()) });
    startTransition(() => { router.push(`/search?${all.toString()}`); onClose(); });
  }

  function handleClear() {
    setOpen(false); setSort("recommended");
    setPriceMin(0); setPriceMax(500);
    setCalMin(0);   setCalMax(1000);
    setSelDates([]); setSelTags([]);
  }

  const activeCount = countActiveFilters(buildFilters());
  const byAxis = tagVocabulary.reduce<Record<string, TagEntry[]>>((acc, t) => {
    (acc[t.axis] ??= []).push(t); return acc;
  }, {});

  const chipLabel = (dateStr: string, idx: number) =>
    idx === 0 ? "今" : idx === 1 ? "明" : idx === 2 ? "後" : DOW[new Date(dateStr).getDay()];
  const chipDate = (dateStr: string) => { const d = new Date(dateStr); return `${d.getMonth() + 1}/${d.getDate()}`; };

  return (
    <div ref={panelRef} className="absolute left-0 top-full z-50 mt-2 flex w-[560px] flex-col overflow-hidden rounded-2xl border bg-card shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_2px_6px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.10)]" style={{ maxHeight: "calc(100dvh - 5rem)" }}>
      {/* Sticky header */}
      <div className="flex flex-none items-center justify-between border-b px-4 py-3">
        <span className="text-[14px] font-semibold">篩選條件</span>
        <button onClick={handleClear} className="text-[12px] text-brand hover:text-brand-hover">清除全部</button>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto">

      <div className="grid grid-cols-2 border-b">
        <div className="p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">現在有開</p>
          <div className="flex items-center justify-between">
            <span className="text-[13px]">只顯示營業中商家</span>
            <button onClick={() => setOpen((v) => !v)} className={`relative h-[22px] w-[38px] rounded-full transition-colors ${open ? "bg-brand" : "bg-border"}`}>
              <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-card shadow transition-[left] ${open ? "left-[19px]" : "left-[3px]"}`} />
            </button>
          </div>
        </div>
        <div className="border-l p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">排序方式</p>
          <SortRadio sort={sort} setSort={setSort} />
        </div>
      </div>

      <div className="grid grid-cols-2 border-b">
        <div className="p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">價格區間</p>
          <DualRangeSlider min={0} max={500} step={10} low={priceMin} high={priceMax} onLowChange={setPriceMin} onHighChange={setPriceMax} />
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground"><span>${priceMin}</span><span>${priceMax}</span></div>
        </div>
        <div className="border-l p-4">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">熱量區間（kcal）</p>
          <DualRangeSlider min={0} max={1000} step={50} low={calMin} high={calMax} onLowChange={setCalMin} onHighChange={setCalMax} />
          <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground"><span>{calMin} kcal</span><span>{calMax} kcal</span></div>
        </div>
      </div>

      <div className="border-b p-4">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">日期</p>
        <div className="flex gap-1.5">
          {quotas.map((q, i) => {
            const selected = selDates.includes(q.date);
            const disabled = !q.hasQuota;
            return (
              <button key={q.date} disabled={disabled} onClick={() => toggleDate(q.date)}
                className={`flex flex-1 flex-col items-center rounded-[10px] border py-1.5 text-center transition-colors ${disabled ? "cursor-not-allowed border-border/50 opacity-40" : "cursor-pointer"} ${selected && !disabled ? "border-foreground bg-foreground text-card" : "border-border bg-surface-canvas"}`}>
                <span className="text-[12px] font-semibold">{chipLabel(q.date, i)}</span>
                <span className="text-[10px] opacity-70">{chipDate(q.date)}</span>
              </button>
            );
          })}
          {quotas.length === 0 && Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-10 flex-1 rounded-[10px]" />
          ))}
        </div>
      </div>

      <div className="p-4">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">餐點標籤</p>
        <div className="flex flex-col gap-2.5">
          {Object.entries(byAxis).map(([axis, tags]) => (
            <TagAxisGroup key={axis} axis={axis} tags={tags} selTags={selTags} onToggle={toggleTag} />
          ))}
        </div>
      </div>

      </div>{/* end scrollable body */}

      {/* Sticky footer */}
      <div className="flex flex-none items-center justify-between border-t px-4 py-3">
        <span className="text-[12px] text-muted-foreground">
          {activeCount > 0 ? `已選 ${activeCount} 個條件` : "尚未設定條件"}
        </span>
        <button onClick={handleApply} disabled={isPending} className="rounded-[8px] bg-foreground px-5 py-2 text-[13px] font-medium text-card disabled:opacity-50">
          套用篩選
        </button>
      </div>
    </div>
  );
}
