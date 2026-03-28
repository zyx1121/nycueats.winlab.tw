"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  approveVendor,
  rejectVendor,
  suspendVendor,
  reactivateVendor,
} from "../actions";

interface VendorReviewProps {
  vendorId: string;
  status: string;
  getSelectedAreas?: () => string[];
}

export function VendorReview({
  vendorId,
  status,
  getSelectedAreas,
}: VendorReviewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ error?: string; success?: boolean }>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) alert(result.error);
      else router.refresh();
    });
  }

  if (status === "pending") {
    return (
      <div className="flex gap-2">
        <Button
          variant="destructive"
          disabled={isPending}
          onClick={() => run(() => rejectVendor(vendorId))}
        >
          拒絕
        </Button>
        <Button
          disabled={isPending}
          onClick={() =>
            run(() => approveVendor(vendorId, getSelectedAreas?.() ?? []))
          }
        >
          核准
        </Button>
      </div>
    );
  }

  if (status === "approved") {
    return (
      <Button
        variant="destructive"
        disabled={isPending}
        onClick={() => run(() => suspendVendor(vendorId))}
      >
        停用商家
      </Button>
    );
  }

  if (status === "suspended") {
    return (
      <Button
        disabled={isPending}
        onClick={() => run(() => reactivateVendor(vendorId))}
      >
        重新啟用
      </Button>
    );
  }

  return null;
}
