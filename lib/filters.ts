// lib/filters.ts

export interface SearchFilters {
  open?: boolean;
  sort?: "recommended" | "price_asc" | "price_desc" | "cal_asc";
  dates?: string[];
  priceMin?: number;
  priceMax?: number;
  calMin?: number;
  calMax?: number;
  tags?: string[];
}

export function parseFiltersFromParams(
  params: Record<string, string | string[] | undefined>,
): SearchFilters {
  const get = (k: string): string | undefined => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const f: SearchFilters = {};
  if (get("open") === "true") f.open = true;
  const sort = get("sort") as SearchFilters["sort"];
  if (sort) f.sort = sort;
  const dates = get("dates")?.split(",").filter(Boolean);
  if (dates?.length) f.dates = dates;
  const tags = get("tags")?.split(",").filter(Boolean);
  if (tags?.length) f.tags = tags;
  const priceMin = get("price_min");
  if (priceMin !== undefined) f.priceMin = Number(priceMin);
  const priceMax = get("price_max");
  if (priceMax !== undefined) f.priceMax = Number(priceMax);
  const calMin = get("cal_min");
  if (calMin !== undefined) f.calMin = Number(calMin);
  const calMax = get("cal_max");
  if (calMax !== undefined) f.calMax = Number(calMax);
  return f;
}

export function filtersToSearchParams(f: SearchFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.open) p.open = "true";
  if (f.sort && f.sort !== "recommended") p.sort = f.sort;
  if (f.dates?.length) p.dates = f.dates.join(",");
  if (f.tags?.length) p.tags = f.tags.join(",");
  if (f.priceMin != null) p.price_min = String(f.priceMin);
  if (f.priceMax != null) p.price_max = String(f.priceMax);
  if (f.calMin != null) p.cal_min = String(f.calMin);
  if (f.calMax != null) p.cal_max = String(f.calMax);
  return p;
}

export function countActiveFilters(f: SearchFilters): number {
  let n = 0;
  if (f.open) n++;
  if (f.sort && f.sort !== "recommended") n++;
  if (f.dates?.length) n++;
  if (f.priceMin != null || f.priceMax != null) n++;
  if (f.calMin != null || f.calMax != null) n++;
  if (f.tags?.length) n++;
  return n;
}

export interface TagEntry { slug: string; label: string; axis: string }
