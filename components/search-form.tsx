"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

interface Props {
  placeholderItems?: string[];
}

const FALLBACK_PLACEHOLDERS = ["今天好熱", "高蛋白", "牛肉麵", "輕食", "辣"];
const CYCLE_MS = 2500;

export function SearchForm({ placeholderItems }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initialQ);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [isPending, startTransition] = useTransition();

  const pool = placeholderItems?.length ? placeholderItems : FALLBACK_PLACEHOLDERS;

  useEffect(() => {
    if (pool.length <= 1) return;
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % pool.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [pool.length]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    const area = searchParams.get("area");
    const url = `/search?q=${encodeURIComponent(q)}${area ? `&area=${area}` : ""}`;
    startTransition(() => router.push(url));
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={pool[placeholderIdx] ?? "搜尋餐點"}
        className="pl-9 w-48 md:w-64"
        disabled={isPending}
      />
    </form>
  );
}
