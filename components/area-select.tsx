"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Tables } from "@/types/supabase";
import { useRouter, useSearchParams } from "next/navigation";

type Area = Pick<Tables<"areas">, "id" | "name" | "city">;

interface Props {
  byCity: Record<string, Area[] | undefined>;
  defaultAreaId?: string;
}

export function AreaSelect({ byCity, defaultAreaId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get("area") ?? defaultAreaId;

  function handleChange(areaId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("area", areaId);
    router.push(`/?${params.toString()}`);
  }

  const cities = Object.keys(byCity);

  return (
    <Select value={current ?? undefined} onValueChange={handleChange}>
      <SelectTrigger>
        <SelectValue placeholder="選擇校區" />
      </SelectTrigger>
      <SelectContent position="popper">
        {cities.map((city, i) => (
          <span key={city}>
            {i > 0 && <SelectSeparator />}
            <SelectGroup>
              <SelectLabel>{city}</SelectLabel>
              {(byCity[city] ?? []).map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  {area.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </span>
        ))}
      </SelectContent>
    </Select>
  );
}
