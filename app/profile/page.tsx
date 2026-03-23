import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileForm } from "./profile-form";

type AreaRow = { id: string; name: string; city: string };

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: areas }] = await Promise.all([
    supabase.from("profiles").select("name, email, avatar_url, area_id, role").eq("id", user.id).single(),
    supabase.from("areas").select("id, name, city").eq("is_active", true).order("city"),
  ]);

  if (!profile) redirect("/login");

  const byCity = (areas ?? []).reduce<Record<string, AreaRow[]>>((acc, area) => {
    (acc[area.city] ??= []).push(area);
    return acc;
  }, {});

  const roleLabels: Record<string, string> = { user: "一般用戶", vendor: "商家", admin: "管理員" };

  return (
    <main className="h-[calc(100dvh-4rem)] flex items-center justify-center">
      <div className="max-w-md w-full p-4 flex flex-col gap-6">
        <div className="flex flex-col items-center gap-3 pt-4">
          <Avatar className="size-20">
            <AvatarImage src={profile.avatar_url ?? undefined} />
            <AvatarFallback className="text-2xl">{profile.name?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <div className="flex gap-1.5">
            {profile.role.map((r) => (
              <span key={r} className="text-xs border rounded-full px-2 py-0.5 text-muted-foreground">
                {roleLabels[r] ?? r}
              </span>
            ))}
          </div>
        </div>

        <ProfileForm profile={profile} byCity={byCity} />
      </div>
    </main>
  );
}
