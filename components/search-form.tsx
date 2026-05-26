"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function SearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(initialQ);
  const [isPending, startTransition] = useTransition();

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
        placeholder="今天好熱 / 高蛋白 / 牛肉麵…"
        className="pl-9 w-48 md:w-64"
        disabled={isPending}
      />
    </form>
  );
}
