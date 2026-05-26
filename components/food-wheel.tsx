"use client";

import { HomeItemCard } from "@/components/home-item-card";
import { Button } from "@/components/ui/button";
import type { HomeItem } from "@/lib/recommendation";
import { pickRandomItem } from "@/lib/roulette";
import { useEffect, useRef, useState } from "react";

interface Props {
  items: HomeItem[];
}

const SPIN_MS = 1300;

export function FoodWheel({ items }: Props) {
  const [result, setResult] = useState<HomeItem | null>(null);
  const [preview, setPreview] = useState<HomeItem | null>(null);
  const [rolling, setRolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  function reducedMotion() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function spin() {
    if (items.length === 0 || rolling) return;
    setResult(null);

    if (reducedMotion()) {
      setResult(pickRandomItem(items));
      return;
    }

    setRolling(true);
    const start = Date.now();
    let delay = 60;

    const tick = () => {
      setPreview(pickRandomItem(items));
      if (Date.now() - start < SPIN_MS) {
        delay += 16; // decelerate
        timer.current = setTimeout(tick, delay);
      } else {
        setRolling(false);
        setResult(pickRandomItem(items));
      }
    };
    tick();
  }

  // Empty state — never spin an empty plate.
  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-heading font-semibold">🎲 今天吃什麼</h2>
        <div className="border rounded-card bg-card p-8 text-center text-muted-foreground">
          這個校區今天還沒有可選的餐點，換個校區或晚點再來看看 🍽️
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-heading font-semibold">🎲 今天吃什麼</h2>
      <div className="border rounded-card bg-card p-4 flex flex-col items-center gap-4">
        <div className="w-full max-w-xs">
          {result && !rolling ? (
            <HomeItemCard item={result} />
          ) : rolling ? (
            <div className="h-44 flex items-center justify-center text-center">
              <p className="text-heading font-semibold animate-pulse line-clamp-2">
                {preview?.name ?? "…"}
              </p>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-center text-muted-foreground">
              <p>選擇困難？讓骰子幫你決定今天的午餐</p>
            </div>
          )}
        </div>
        <Button onClick={spin} disabled={rolling} className="self-center">
          {rolling ? "選擇中…" : result ? "再轉一次" : "🎲 幫我選一個"}
        </Button>
      </div>
    </section>
  );
}
