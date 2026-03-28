import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role.includes("admin")) redirect("/");

  return (
    <div className="min-h-[calc(100dvh-4rem)] flex flex-col items-center">
      <div className="max-w-6xl w-full p-4 flex flex-col gap-4">
        <nav className="flex gap-2">
          <Link href="/admin">
            <Button variant="outline" size="sm">營運總覽</Button>
          </Link>
          <Link href="/admin/vendors">
            <Button variant="outline" size="sm">商家管理</Button>
          </Link>
          <Link href="/admin/reports">
            <Button variant="outline" size="sm">月結報表</Button>
          </Link>
        </nav>
        {children}
      </div>
    </div>
  );
}
