import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function VendorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role.includes("vendor")) redirect("/");

  return (
    <div className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-4">
        <nav className="flex gap-2">
          <Link href="/vendor/profile">
            <Button variant="outline" size="sm">店家資訊</Button>
          </Link>
          <Link href="/vendor/menu">
            <Button variant="outline" size="sm">菜單管理</Button>
          </Link>
          <Link href="/vendor/orders">
            <Button variant="outline" size="sm">訂單彙整</Button>
          </Link>
        </nav>
        {children}
      </div>
    </div>
  );
}
