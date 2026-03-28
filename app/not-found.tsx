import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-[calc(100dvh-4rem)] flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <p className="text-6xl font-bold">404</p>
        <p className="text-muted-foreground">找不到這個頁面</p>
        <Link href="/">
          <Button>回首頁</Button>
        </Link>
      </div>
    </main>
  );
}
