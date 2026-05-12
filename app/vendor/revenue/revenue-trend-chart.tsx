import type { DailyRevenue } from "./revenue-model";

type Props = {
  title: string;
  data: DailyRevenue[];
};

const WIDTH = 600;
const HEIGHT = 160;
const PAD = { top: 12, right: 12, bottom: 24, left: 48 };

export function RevenueTrendChart({ title, data }: Props) {
  const hasRevenue = data.some((item) => item.revenue > 0);

  if (data.length === 0 || !hasRevenue) {
    return (
      <div className="border rounded-lg bg-card p-4">
        <p className="text-sm font-bold mb-2">{title}</p>
        <p className="text-sm text-muted-foreground">暫無資料</p>
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((item) => item.revenue), 1);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  function x(index: number) {
    return PAD.left + (index / (data.length - 1)) * innerW;
  }

  function y(revenue: number) {
    return PAD.top + innerH - (revenue / maxRevenue) * innerH;
  }

  const points = data.map((item, index) => `${x(index)},${y(item.revenue)}`).join(" ");
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((factor) => Math.round(factor * maxRevenue));

  return (
    <div className="border rounded-lg bg-card p-4 flex flex-col gap-2">
      <p className="text-sm font-bold">{title}</p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" aria-label={title}>
        {gridLines.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 4}
              y={y(value)}
              dominantBaseline="middle"
              textAnchor="end"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.5}
            >
              ${value.toLocaleString()}
            </text>
          </g>
        ))}
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((item, index) => (
          <circle key={item.date} cx={x(index)} cy={y(item.revenue)} r={2.5} fill="currentColor" />
        ))}
        <text
          x={x(0)}
          y={HEIGHT - 4}
          fontSize={9}
          fill="currentColor"
          fillOpacity={0.5}
          textAnchor="middle"
        >
          {data[0].date.slice(5)}
        </text>
        <text
          x={x(data.length - 1)}
          y={HEIGHT - 4}
          fontSize={9}
          fill="currentColor"
          fillOpacity={0.5}
          textAnchor="middle"
        >
          {data[data.length - 1].date.slice(5)}
        </text>
      </svg>
    </div>
  );
}
