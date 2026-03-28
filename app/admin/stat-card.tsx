type Format = "number" | "currency" | "percent";

function formatValue(value: number, format: Format): string {
  if (format === "currency") return `$${value.toLocaleString()}`;
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  return value.toLocaleString();
}

function diff(value: number, prev: number): { label: string; positive: boolean } {
  if (prev === 0) return { label: "—", positive: true };
  const pct = ((value - prev) / prev) * 100;
  return {
    label: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% vs 上月`,
    positive: pct >= 0,
  };
}

type Props = {
  title: string;
  value: number;
  prev: number;
  format: Format;
};

export function StatCard({ title, value, prev, format }: Props) {
  const { label, positive } = diff(value, prev);
  return (
    <div className="border rounded-lg p-4 flex flex-col gap-1">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold">{formatValue(value, format)}</p>
      <p className={`text-xs ${positive ? "text-green-600" : "text-red-500"}`}>{label}</p>
    </div>
  );
}
