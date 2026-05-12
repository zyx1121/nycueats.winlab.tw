export type RevenueRow = {
  date: string;
  qty: number;
  unit_price: number;
  order_id: string;
  order_status: string;
  menu_item_id: string;
  menu_item_name: string;
};

export type RevenueMonth = {
  year: number;
  month: number;
};

export type RevenuePeriodStats = {
  orders: number;
  revenue: number;
  soldQuantity: number;
};

export type RevenueStats = {
  thisMonth: RevenuePeriodStats;
  lastMonth: RevenuePeriodStats;
};

export type DailyRevenue = {
  date: string;
  revenue: number;
};

export type MenuRevenueRank = {
  name: string;
  count: number;
  revenue: number;
};

const ACTIVE_STATUSES = new Set(["confirmed", "completed"]);

type SearchParams = {
  year?: string | string[];
  month?: string | string[];
};

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function dateFromParts(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isInMonth(date: string, year: number, month: number): boolean {
  const range = getMonthRange(year, month);
  return date >= range.start && date <= range.end;
}

function isActive(row: RevenueRow): boolean {
  return ACTIVE_STATUSES.has(row.order_status);
}

export function parseRevenueMonth(params: SearchParams, now = new Date()): RevenueMonth {
  const year = Number(firstValue(params.year));
  const month = Number(firstValue(params.month));

  if (Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12) {
    return { year, month };
  }

  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

export function getMonthRange(year: number, month: number): { start: string; end: string } {
  return {
    start: toDateKey(dateFromParts(year, month - 1, 1)),
    end: toDateKey(dateFromParts(year, month, 0)),
  };
}

export function getPreviousMonth(year: number, month: number): RevenueMonth {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function buildPeriodStats(rows: RevenueRow[], year: number, month: number): RevenuePeriodStats {
  const orderIds = new Set<string>();
  let revenue = 0;
  let soldQuantity = 0;

  for (const row of rows) {
    if (!isActive(row) || !isInMonth(row.date, year, month)) continue;
    orderIds.add(row.order_id);
    revenue += row.qty * row.unit_price;
    soldQuantity += row.qty;
  }

  return {
    orders: orderIds.size,
    revenue,
    soldQuantity,
  };
}

export function buildRevenueStats(rows: RevenueRow[], year: number, month: number): RevenueStats {
  const previous = getPreviousMonth(year, month);
  return {
    thisMonth: buildPeriodStats(rows, year, month),
    lastMonth: buildPeriodStats(rows, previous.year, previous.month),
  };
}

export function buildDailyRevenueTrend(
  rows: RevenueRow[],
  days: number,
  now = new Date()
): DailyRevenue[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const totals = new Map<string, number>();

  for (let i = 0; i < days; i++) {
    const date = toDateKey(new Date(end - (days - 1 - i) * 86400000));
    totals.set(date, 0);
  }

  for (const row of rows) {
    if (!isActive(row) || !totals.has(row.date)) continue;
    totals.set(row.date, (totals.get(row.date) ?? 0) + row.qty * row.unit_price);
  }

  return Array.from(totals.entries()).map(([date, revenue]) => ({ date, revenue }));
}

export function buildTopMenuItems(
  rows: RevenueRow[],
  year: number,
  month: number,
  limit: number
): MenuRevenueRank[] {
  const map = new Map<string, MenuRevenueRank>();

  for (const row of rows) {
    if (!isActive(row) || !isInMonth(row.date, year, month)) continue;
    const current = map.get(row.menu_item_id) ?? { name: row.menu_item_name, count: 0, revenue: 0 };
    current.count += row.qty;
    current.revenue += row.qty * row.unit_price;
    map.set(row.menu_item_id, current);
  }

  return Array.from(map.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}
