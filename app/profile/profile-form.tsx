"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Tables } from "@/types/supabase";
import { useTransition, useState } from "react";
import { updateProfile, signOut } from "./actions";

type Area = Pick<Tables<"areas">, "id" | "name" | "city">;
type Profile = Pick<Tables<"profiles">, "name" | "email" | "avatar_url" | "area_id" | "role">;

interface Props {
  profile: Profile;
  byCity: Record<string, Area[]>;
}

export function ProfileForm({ profile, byCity }: Props) {
  const [isPending, startTransition] = useTransition();
  const [areaId, setAreaId] = useState(profile.area_id ?? "");
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("area_id", areaId);
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result?.success) setSaved(true);
    });
  }

  const cities = Object.keys(byCity);

  return (
    <>
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={profile.email ?? ""} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">由 Google 帳號提供，無法修改</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">顯示名稱</Label>
        <Input
          id="name"
          name="name"
          defaultValue={profile.name ?? ""}
          placeholder="請輸入名稱"
          onChange={() => setSaved(false)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>預設校區</Label>
        <Select value={areaId} onValueChange={(v) => { setAreaId(v); setSaved(false); }}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="選擇校區" />
          </SelectTrigger>
          <SelectContent position="popper">
            {cities.map((city, i) => (
              <span key={city}>
                {i > 0 && <SelectSeparator />}
                <SelectGroup>
                  <SelectLabel>{city}</SelectLabel>
                  {byCity[city].map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </span>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "儲存中…" : "儲存"}
        </Button>
        {saved && <p className="text-sm text-muted-foreground whitespace-nowrap">已儲存</p>}
      </div>
    </form>

    <form action={signOut}>
      <Button variant="outline" type="submit" className="w-full">登出</Button>
    </form>
    </>
  );
}
