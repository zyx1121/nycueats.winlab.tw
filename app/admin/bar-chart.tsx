import type { RankedItem } from "./actions";

type Props = {
  title: string;
  items: RankedItem[];
};

export function BarChart({ title, items }: Props) {
  const max = Math.max(...items.map((i) => i.revenue), 1);
  return (
    <div className="border rounded-lg p-4 flex flex-col gap-3">
      <p className="text-sm font-bold">{title}</p>
      {items.length === 0 && <p className="text-sm text-muted-foreground">暫無資料</p>}
      {items.map((item) => (
        <div key={item.name} className="flex flex-col gap-1">
          <div className="flex justify-between text-xs">
            <span className="truncate max-w-[60%]">{item.name}</span>
            <span className="text-muted-foreground">${item.revenue.toLocaleString()}</span>
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
