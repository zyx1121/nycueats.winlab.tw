import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-7 w-32" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-4 flex flex-col gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>

      <div className="border rounded-lg p-4 flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-40 w-full" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-4 flex flex-col gap-3">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 5 }).map((__, j) => (
              <div key={j} className="flex flex-col gap-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
