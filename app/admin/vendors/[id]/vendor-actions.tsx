"use client";

import { useRef } from "react";
import { AreaEditor } from "./area-editor";
import { VendorReview } from "./vendor-review";
import { Separator } from "@/components/ui/separator";
import type { Database } from "@/types/supabase";

type Area = Database["public"]["Tables"]["areas"]["Row"];

interface VendorActionsProps {
  vendorId: string;
  status: string;
  areas: Area[];
  selectedAreaIds: string[];
}

export function VendorActions({
  vendorId,
  status,
  areas,
  selectedAreaIds,
}: VendorActionsProps) {
  const selectedRef = useRef<string[]>(selectedAreaIds);

  return (
    <>
      <AreaEditor
        key={selectedAreaIds.join(",")}
        vendorId={vendorId}
        areas={areas}
        selectedAreaIds={selectedAreaIds}
        showSaveButton={status === "approved"}
        onSelectionChange={(ids) => {
          selectedRef.current = ids;
        }}
      />
      <Separator />
      <VendorReview
        vendorId={vendorId}
        status={status}
        getSelectedAreas={() => selectedRef.current}
      />
    </>
  );
}
