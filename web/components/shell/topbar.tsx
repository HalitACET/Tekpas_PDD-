"use client";

import { Building2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/common/language-switcher";
import type { SessionUser } from "@/lib/auth/session";
import type { PageKey } from "@/lib/nav";
import { useSearchShortcutLabel } from "@/lib/platform";
import { UserMenu } from "./user-menu";

/**
 * Design G top bar. The company name has no chevron: a user belongs to exactly one company. Search is
 * shown in a disabled state until it is built.
 */
export function Topbar({ user, page }: { user: SessionUser; page?: PageKey }) {
  const t = useTranslations("shell");
  const tNav = useTranslations("nav.items");
  const shortcut = useSearchShortcutLabel();

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b pr-4 pl-6">
      <nav aria-label={t("breadcrumb")}>
        <ol className="flex items-center gap-2 text-[13px]">
          <li className="flex items-center gap-2 font-medium">
            <span className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden>
              <Building2 className="size-3.5" strokeWidth={1.75} />
            </span>
            {user.company.name}
          </li>
          {page && (
            <>
              <li className="text-input" aria-hidden>
                /
              </li>
              <li className="text-muted-foreground" aria-current="page">
                {tNav(page)}
              </li>
            </>
          )}
        </ol>
      </nav>

      <div className="ml-auto flex h-8 w-[260px] items-center gap-2 rounded-md border border-input px-2.5 text-[13px] text-muted-foreground">
        <Search className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
        <input
          type="search"
          disabled
          placeholder={t("search")}
          aria-label={t("search")}
          title={t("searchUnavailable")}
          className="min-w-0 flex-1 cursor-not-allowed bg-transparent outline-none placeholder:text-muted-foreground"
        />
        {shortcut && (
          <kbd className="rounded-sm border px-1 font-mono text-[11px]" aria-hidden>
            {shortcut}
          </kbd>
        )}
      </div>

      <LanguageSwitcher />
      <UserMenu user={user} />
    </header>
  );
}
