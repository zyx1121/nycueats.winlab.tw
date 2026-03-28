import type { DailyOrderCount } from "./actions";

type Props = {
  title: string;
  data: DailyOrderCount[];
};

const WIDTH = 600;
const HEIGHT = 160;
const PAD = { top: 12, right: 12, bottom: 24, left: 32 };

export function TrendChart({ title, data }: Props) {
  if (data.length === 0) {
    return (
      <div className="border rounded-lg p-4">
        <p className="text-sm font-bold mb-2">{title}</p>
        <p className="text-sm text-muted-foreground">暫無資料</p>
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  function x(i: number) {
    return PAD.left + (i / (data.length - 1)) * innerW;
  }
  function y(count: number) {
    return PAD.top + innerH - (count / maxCount) * innerH;
  }

  const points = data.map((d, i) => `${x(i)},${y(d.count)}`).join(" ");
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * maxCount));

  return (
    <div className="border rounded-lg p-4 flex flex-col gap-2">
      <p className="text-sm font-bold">{title}</p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        aria-label={title}
      >
        {gridLines.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeWidth={1}
            />
            <text
              x={PAD.left - 4}
              y={y(v)}
              dominantBaseline="middle"
              textAnchor="end"
              fontSize={9}
              fill="currentColor"
              fillOpacity={0.5}
            >
              {v}
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
        {data.map((d, i) => (
          <circle key={d.date} cx={x(i)} cy={y(d.count)} r={2.5} fill="currentColor" />
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
