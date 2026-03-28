import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const statusConfig = {
  pending: { label: "待審核", className: "text-yellow-600 bg-yellow-50" },
  approved: { label: "已核准", className: "text-green-600 bg-green-50" },
  rejected: { label: "已拒絕", className: "text-red-600 bg-red-50" },
  suspended: { label: "已停用", className: "text-muted-foreground bg-muted" },
} as const;

type StatusKey = keyof typeof statusConfig;

const tabs: StatusKey[] = ["pending", "approved", "suspended", "rejected"];

export default async function AdminVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filterStatus: StatusKey =
    status && status in statusConfig ? (status as StatusKey) : "pending";

  const supabase = await createClient();
  const { data: vendors } = await supabase
    .from("vendors")
    .select(
      "id, name, description, image_url, tags, is_active, status, created_at, owner_id, profiles:owner_id(email)"
    )
    .eq("status", filterStatus)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">商家管理</h1>

      <div className="border rounded-full p-1 flex gap-1 w-fit">
        {tabs.map((tab) => {
          const isActive = tab === filterStatus;
          return (
            <Link
              key={tab}
              href={`/admin/vendors?status=${tab}`}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {statusConfig[tab].label}
            </Link>
          );
        })}
      </div>

      {!vendors || vendors.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">
          無{statusConfig[filterStatus].label}商家
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map((vendor) => {
            const cfg = statusConfig[vendor.status as StatusKey] ?? statusConfig.pending;
            const profile = Array.isArray(vendor.profiles)
              ? vendor.profiles[0]
              : vendor.profiles;
            return (
              <Link
                key={vendor.id}
                href={`/admin/vendors/${vendor.id}`}
                className="border rounded-2xl p-4 flex flex-col gap-3 hover:scale-[1.02] transition-all duration-200"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-md font-bold">{vendor.name}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${cfg.className}`}
                  >
                    {cfg.label}
                  </span>
                </div>
                {vendor.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {vendor.description}
                  </p>
                )}
                {profile?.email && (
                  <p className="text-sm text-muted-foreground">{profile.email}</p>
                )}
                {vendor.tags && vendor.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {vendor.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
