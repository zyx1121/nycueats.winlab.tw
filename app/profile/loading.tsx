import { Skeleton } from "@/components/ui/skeleton";

export default function ProfileLoading() {
  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-md w-full p-4 flex flex-col gap-6">
        {/* 頭像區 */}
        <div className="flex flex-col items-center gap-3 pt-4">
          <Skeleton className="size-20 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        {/* 表單欄位 */}
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </main>
  );
}
