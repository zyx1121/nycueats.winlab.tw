import { Skeleton } from "@/components/ui/skeleton";

export default function VendorOrdersLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-24" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <div className="border rounded-lg divide-y">
            {Array.from({ length: 2 }).map((_, j) => (
              <div key={j} className="flex items-center justify-between p-4">
                <Skeleton className="h-4 w-24" />
                <div className="flex items-center gap-6">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center p-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
