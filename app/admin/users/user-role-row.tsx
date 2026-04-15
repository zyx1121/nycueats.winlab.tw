"use client";

import { useTransition } from "react";
import { grantVendorRole, revokeVendorRole } from "./actions";

interface Props {
  userId: string;
  name: string | null;
  email: string | null;
  roles: string[];
  isSelf: boolean;
}

export function UserRoleRow({ userId, name, email, roles, isSelf }: Props) {
  const [isPending, startTransition] = useTransition();
  const isVendor = roles.includes("vendor");
  const isAdmin = roles.includes("admin");

  const toggle = () => {
    startTransition(async () => {
      if (isVendor) {
        await revokeVendorRole(userId);
      } else {
        await grantVendorRole(userId);
      }
    });
  };

  return (
    <tr className="border-b last:border-b-0">
      <td className="p-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium">{name ?? "（未設定）"}</span>
          <span className="text-xs text-muted-foreground">{email}</span>
        </div>
      </td>
      <td className="p-3">
        <div className="flex flex-wrap gap-1">
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">user</span>
          {isVendor && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">vendor</span>
          )}
          {isAdmin && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">admin</span>
          )}
        </div>
      </td>
      <td className="p-3 text-right">
        <button
          onClick={toggle}
          disabled={isPending || isSelf}
          className={`text-xs px-3 py-1 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            isVendor
              ? "border-destructive text-destructive hover:bg-destructive/5"
              : "border-blue-500 text-blue-600 hover:bg-blue-50"
          }`}
        >
          {isPending ? "處理中..." : isVendor ? "撤銷 vendor" : "授予 vendor"}
        </button>
      </td>
    </tr>
  );
}
