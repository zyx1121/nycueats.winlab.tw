import { requireRole } from "@/lib/auth";
import { UserRoleRow } from "./user-role-row";

export default async function AdminUsersPage() {
  const { supabase, user } = await requireRole("admin");

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, name, email, role")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">使用者管理</h1>
        <p className="text-sm text-muted-foreground">{profiles?.length ?? 0} 位使用者</p>
      </div>

      {!profiles || profiles.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">尚無使用者</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-3 text-sm font-medium">使用者</th>
                <th className="text-left p-3 text-sm font-medium">角色</th>
                <th className="text-right p-3 text-sm font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <UserRoleRow
                  key={profile.id}
                  userId={profile.id}
                  name={profile.name}
                  email={profile.email}
                  roles={profile.role}
                  isSelf={profile.id === user.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
