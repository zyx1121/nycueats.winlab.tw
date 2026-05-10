import type { MenuRevenueRank } from "./revenue-model";

type Props = {
  title: string;
  items: MenuRevenueRank[];
};

export function RevenueBarChart({ title, items }: Props) {
  const max = Math.max(...items.map((item) => item.revenue), 1);

  return (
    <div className="border rounded-lg bg-card p-4 flex flex-col gap-3">
      <p className="text-sm font-bold">{title}</p>
      {items.length === 0 && <p className="text-sm text-muted-foreground">暫無資料</p>}
      {items.map((item) => (
        <div key={item.name} className="flex flex-col gap-1">
          <div className="flex justify-between gap-4 text-xs">
            <span className="truncate max-w-[55%]">{item.name}</span>
            <span className="text-muted-foreground">
              {item.count} 份 · ${item.revenue.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-foreground"
              style={{ width: `${(item.revenue / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
