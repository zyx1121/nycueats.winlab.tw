"use client";

import { HomeItemCard } from "@/components/home-item-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { HomeItem } from "@/lib/recommendation";
import { pickRandomItem } from "@/lib/roulette";
import { Dices } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  items: HomeItem[];
}

const SPIN_MS = 1300;

export function FoodWheel({ items }: Props) {
  const [open, setOpen] = useState(false);
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
    setOpen(true);
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
        delay += 16;
        timer.current = setTimeout(tick, delay);
      } else {
        setRolling(false);
        setResult(pickRandomItem(items));
      }
    };
    tick();
  }

  if (items.length === 0) return null;

  return (
    <>
      <Button
        onClick={spin}
        aria-label="今天吃什麼"
        className="fixed bottom-6 right-6 z-50 size-14 rounded-full shadow-floating p-0"
      >
        <Dices className="size-6" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>🎲 今天吃什麼</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="w-full max-w-xs">
              {rolling ? (
                <div className="h-44 flex items-center justify-center text-center">
                  <p className="text-heading font-semibold animate-pulse line-clamp-2">
                    {preview?.name ?? "…"}
                  </p>
                </div>
              ) : result ? (
                <HomeItemCard item={result} />
              ) : (
                <div className="h-44 flex items-center justify-center text-center text-muted-foreground">
                  <p>選擇困難？讓骰子幫你決定今天的午餐</p>
                </div>
              )}
            </div>
            <Button onClick={spin} disabled={rolling} className="w-full">
              {rolling ? "選擇中…" : result ? "再轉一次" : "🎲 幫我選一個"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
