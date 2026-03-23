import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { VendorProfileForm } from "./vendor-profile-form";

export default async function VendorProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: vendor } = await supabase
    .from("vendors")
    .select("id, name, description, image_url, is_open, operating_days, vendor_areas(areas(id, name))")
    .eq("owner_id", user.id)
    .single();

  if (!vendor) return <p className="text-muted-foreground">尚未綁定商家帳號，請聯絡管理員。</p>;

  const areas = vendor.vendor_areas.flatMap((va) => va.areas ? [va.areas] : []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">店家資訊</h1>
      <VendorProfileForm vendor={vendor} areas={areas} />
    </div>
  );
}
