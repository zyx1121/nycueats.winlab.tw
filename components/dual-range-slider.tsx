// components/dual-range-slider.tsx
"use client";

interface Props {
  min: number;
  max: number;
  low: number;
  high: number;
  step?: number;
  onLowChange: (v: number) => void;
  onHighChange: (v: number) => void;
}

export function DualRangeSlider({
  min, max, low, high, step = 1,
  onLowChange, onHighChange,
}: Props) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <div className="relative h-5 w-full select-none">
      {/* Track background */}
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border">
        {/* Active fill between thumbs */}
        <div
          className="absolute h-full rounded-full bg-foreground"
          style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }}
        />
      </div>

      {/* Low thumb */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={low}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v <= high - step) onLowChange(v);
        }}
        className="pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent
                   [&::-webkit-slider-thumb]:pointer-events-auto
                   [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:border-2
                   [&::-webkit-slider-thumb]:border-foreground
                   [&::-webkit-slider-thumb]:bg-card
                   [&::-webkit-slider-runnable-track]:bg-transparent"
        style={{ zIndex: low > max - (max - min) * 0.1 ? 5 : 3 }}
      />

      {/* High thumb */}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={high}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v >= low + step) onHighChange(v);
        }}
        className="pointer-events-none absolute inset-0 h-full w-full appearance-none bg-transparent
                   [&::-webkit-slider-thumb]:pointer-events-auto
                   [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:rounded-full
                   [&::-webkit-slider-thumb]:border-2
                   [&::-webkit-slider-thumb]:border-foreground
                   [&::-webkit-slider-thumb]:bg-card
                   [&::-webkit-slider-runnable-track]:bg-transparent"
        style={{ zIndex: 4 }}
      />
    </div>
  );
}
