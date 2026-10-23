"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMe } from "@/lib/api/users";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Design v1.2 169 and 184: the page is there in the menu for every role, but only owners and admins see its content;
 * the others are told whom to ask.
 */
export function NoAccess({ title, role }: { title: string; role: SessionUser["role"] }) {
  const t = useTranslations("team");
  const me = useMe();
  const roleName = role === "SUPPLIER" ? role : t(`role.${role}.name`);
  const owner = me.data?.ownerName;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <strong className="text-base font-semibold">{title}</strong>
      <span className="max-w-[420px] text-[13px] leading-normal text-pretty text-muted-foreground">
        {owner ? t("noAccessBody", { role: roleName, owner }) : t("noAccessBodyNoOwner", { role: roleName })}
      </span>
    </div>
  );
}
