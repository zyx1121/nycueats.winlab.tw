"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateVendorAreas } from "../actions";
import type { Database } from "@/types/supabase";

type Area = Database["public"]["Tables"]["areas"]["Row"];

interface AreaEditorProps {
  vendorId: string;
  areas: Area[];
  selectedAreaIds: string[];
  showSaveButton?: boolean;
  onSelectionChange?: (ids: string[]) => void;
}

export function AreaEditor({
  vendorId,
  areas,
  selectedAreaIds: initialSelected,
  showSaveButton = false,
  onSelectionChange,
}: AreaEditorProps) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(initialSelected)
  );
  const [isPending, startTransition] = useTransition();

  const byCity = areas.reduce<Record<string, Area[]>>((acc, area) => {
    (acc[area.city] ??= []).push(area);
    return acc;
  }, {});

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange?.([...next]);
      return next;
    });
  }

  function handleSave() {
    startTransition(async () => {
      await updateVendorAreas(vendorId, [...selected]);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-md font-bold">服務區域</h2>
      {Object.entries(byCity).map(([city, cityAreas]) => (
        <div key={city} className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{city}</p>
          <div className="flex flex-wrap gap-2">
            {cityAreas.map((area) => {
              const active = selected.has(area.id);
              return (
                <button
                  key={area.id}
                  onClick={() => toggle(area.id)}
                  className={`px-3 py-1 rounded-full text-sm border transition-all duration-200 ${
                    active
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-foreground border-border hover:border-foreground"
                  }`}
                >
                  {area.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {showSaveButton && (
        <Button
          onClick={handleSave}
          disabled={isPending}
          variant="outline"
          className="w-fit"
        >
          {isPending ? "儲存中…" : "儲存服務區域"}
        </Button>
      )}
    </div>
  );
}
