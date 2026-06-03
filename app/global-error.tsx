"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="zh-TW">
      <body className="min-h-dvh flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <p className="text-6xl font-bold">500</p>
          <p className="text-gray-500">系統發生嚴重錯誤</p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-black text-white rounded-lg"
          >
            重試
          </button>
        </div>
      </body>
    </html>
  );
}
