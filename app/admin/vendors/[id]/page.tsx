import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { Separator } from "@/components/ui/separator";
import { VendorActions } from "./vendor-actions";
import { format } from "date-fns";
import { zhTW } from "date-fns/locale";

const statusConfig = {
  pending: { label: "待審核", className: "text-yellow-600 bg-yellow-50" },
  approved: { label: "已核准", className: "text-green-600 bg-green-50" },
  rejected: { label: "已拒絕", className: "text-red-600 bg-red-50" },
  suspended: { label: "已停用", className: "text-muted-foreground bg-muted" },
} as const;

type StatusKey = keyof typeof statusConfig;

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireRole("admin");

  const [{ data: vendor }, { data: areas }] = await Promise.all([
    supabase
      .from("vendors")
      .select(
        "id, name, description, tags, status, is_active, created_at, owner_id, profiles:owner_id(name, email)"
      )
      .eq("id", id)
      .single(),
    supabase.from("areas").select("*").eq("is_active", true).order("city"),
  ]);

  if (!vendor) notFound();

  const { data: vendorAreas } = await supabase
    .from("vendor_areas")
    .select("area_id")
    .eq("vendor_id", id);

  const selectedAreaIds = vendorAreas?.map((va) => va.area_id) ?? [];

  const status = vendor.status as StatusKey;
  const cfg = statusConfig[status] ?? statusConfig.pending;
  const profile = Array.isArray(vendor.profiles)
    ? vendor.profiles[0]
    : vendor.profiles;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">{vendor.name}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
          {cfg.label}
        </span>
      </div>

      <div className="border rounded-2xl p-4 flex flex-col gap-3">
        {vendor.description && (
          <p className="text-sm text-muted-foreground">{vendor.description}</p>
        )}
        {profile?.name && (
          <p className="text-sm">
            <span className="text-muted-foreground">負責人：</span>
            {profile.name}
          </p>
        )}
        {profile?.email && (
          <p className="text-sm">
            <span className="text-muted-foreground">Email：</span>
            {profile.email}
          </p>
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
        <p className="text-xs text-muted-foreground">
          申請時間：
          {format(new Date(vendor.created_at), "yyyy/MM/dd HH:mm", {
            locale: zhTW,
          })}
        </p>
      </div>

      <Separator />

      <VendorActions
        vendorId={vendor.id}
        status={vendor.status}
        areas={areas ?? []}
        selectedAreaIds={selectedAreaIds}
      />
    </div>
  );
}
