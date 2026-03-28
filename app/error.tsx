"use client";

import { Button } from "@/components/ui/button";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <p className="text-6xl font-bold">500</p>
        <p className="text-muted-foreground">發生錯誤，請稍後再試</p>
        <Button onClick={reset}>重試</Button>
      </div>
    </main>
  );
}
