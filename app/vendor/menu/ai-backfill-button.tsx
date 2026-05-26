"use client";

import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useTransition } from "react";
import { backfillMissingAiTags } from "./actions";

interface Props {
  missingCount: number;
}

export function AiBackfillButton({ missingCount }: Props) {
  const [isPending, startTransition] = useTransition();

  if (missingCount === 0) return null;

  function handleClick() {
    startTransition(async () => {
      const result = await backfillMissingAiTags();
      if ("error" in result && result.error) {
        alert(`AI 補完失敗：${result.error}`);
        return;
      }
      const count = (result as { count?: number }).count ?? 0;
      alert(`已為 ${count} 道餐點產生 AI 標籤`);
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className="flex items-center gap-1"
    >
      <Sparkles className="size-3.5" />
      {isPending ? "產生中…" : `AI 補完 (${missingCount})`}
    </Button>
  );
}
