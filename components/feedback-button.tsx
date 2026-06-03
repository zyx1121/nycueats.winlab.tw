"use client";

import { Button } from "@/components/ui/button";
import * as Sentry from "@sentry/nextjs";
import { Bug } from "lucide-react";
import { useEffect, useRef } from "react";

export function FeedbackButton() {
  const ref = useRef<HTMLButtonElement>(null);

  // Attach the Sentry feedback form to this button on the client. Reading
  // getFeedback() inside the effect keeps it client-only (no hydration mismatch);
  // attachTo returns an unsubscribe handler used for cleanup.
  useEffect(() => {
    const el = ref.current;
    const feedback = Sentry.getFeedback();
    if (el && feedback) {
      return feedback.attachTo(el, { formTitle: "回報問題" });
    }
  }, []);

  return (
    <Button ref={ref} variant="outline" aria-label="回報問題">
      <Bug className="size-4" />
    </Button>
  );
}
