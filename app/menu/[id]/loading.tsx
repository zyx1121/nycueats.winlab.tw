import { Skeleton } from "@/components/ui/skeleton";

export default function MenuLoading() {
  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-2">
        {/* 橫幅 */}
        <Skeleton className="w-full rounded-lg" style={{ aspectRatio: "16/5" }} />
        {/* 標題 */}
        <Skeleton className="mt-4 h-10 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-80" />

        {/* 餐點卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border rounded-lg flex justify-between h-40">
              <div className="flex flex-col p-4 gap-2 flex-1">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="max-w-40 w-full shrink-0 rounded-r-lg rounded-l-none" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
