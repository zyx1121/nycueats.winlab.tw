"use client";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function Sparkline({ data, width = 80, height = 24, className }: SparklineProps) {
  if (data.length === 0) {
    return (
      <svg width={width} height={height} className={className}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeOpacity={0.2} strokeWidth={1.5} />
      </svg>
    );
  }

  const max = Math.max(...data, 1);
  const padding = 2;
  const innerH = height - padding * 2;
  const step = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0;

  const points = data
    .map((v, i) => {
      const x = padding + i * step;
      const y = padding + innerH - (v / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className={className}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
