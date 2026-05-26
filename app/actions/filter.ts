// app/actions/filter.ts
"use server";

import { createClient } from "@/lib/supabase/server";

export interface DateQuota {
  date: string;   // 'YYYY-MM-DD'
  hasQuota: boolean;
}

export async function getDateQuotas(): Promise<DateQuota[]> {
  const supabase = await createClient();

  const today = new Date();
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return d.toISOString().split("T")[0];
  });

  const { data } = await supabase
    .from("daily_slots")
    .select("date, max_qty, reserved_qty")
    .gte("date", dates[0])
    .lte("date", dates[6]);

  // Group by date: a date hasQuota if any slot has remaining capacity.
  const byDate = new Map<string, boolean>();
  for (const row of data ?? []) {
    const d = row.date as string;
    if ((row.max_qty ?? 0) > (row.reserved_qty ?? 0)) {
      byDate.set(d, true);
    } else if (!byDate.has(d)) {
      byDate.set(d, false);
    }
  }

  return dates.map((date) => ({ date, hasQuota: byDate.get(date) ?? false }));
}
