"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Globe, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useSwitchLocale } from "@/components/common/language-switcher";
import { locales, type Locale } from "@/i18n/locales";
import { logout, type SessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { initials } from "./user-menu";

interface MobileUserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: SessionUser;
}

interface Option<T extends string> {
  value: T;
  label: string;
  lang?: string;
}

/** 44 px segmented control of the mobile user menu (language and theme). */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-lg bg-popover-muted p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            lang={option.lang}
            aria-pressed={active}
            onClick={() => !active && onChange(option.value)}
            className={cn(
              "flex h-11 flex-1 cursor-pointer items-center justify-center rounded-md text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft",
              active ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Design G mobile "Kullanıcı menüsü açık": user card, language and theme as 44 px segmented controls,
 * sign out. A modal sheet under the header (dropdown menu items would be too small for touch).
 */
export function MobileUserSheet({ open, onOpenChange, user }: MobileUserSheetProps) {
  const t = useTranslations("shell");
  const tRoles = useTranslations("roles");
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const { switchTo } = useSwitchLocale();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  async function onLogout() {
    onOpenChange(false);
    await logout();
    router.replace("/login");
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 md:hidden" />
        <Dialog.Popup className="fixed top-[52px] right-3 z-50 flex w-[300px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[14px] border bg-popover text-popover-foreground shadow-md outline-none transition-[opacity,transform] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 md:hidden">
          <Dialog.Title className="sr-only">{t("userMenu")}</Dialog.Title>
          <div className="flex items-center gap-3 p-4">
            <span
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-silk text-sm font-semibold text-[#3D3A35]"
              aria-hidden
            >
              {initials(user.fullName)}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5 leading-[normal]">
              <span className="text-[15px] font-semibold">{user.fullName}</span>
              <span className="truncate text-[13px] text-muted-foreground">
                {tRoles(user.role)} · {user.company.name}
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">{user.email}</span>
            </span>
          </div>

          <div className="flex flex-col gap-2 border-t px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs leading-[normal] font-medium text-muted-foreground">
              <Globe className="size-3.5" strokeWidth={1.75} aria-hidden />
              {tCommon("language")}
            </span>
            <Segmented
              label={tCommon("language")}
              value={locale}
              onChange={switchTo}
              options={locales.map((l) => ({ value: l, label: l.toUpperCase(), lang: l }))}
            />
          </div>

          <div className="flex flex-col gap-2 px-4 pt-1 pb-3.5">
            <span className="text-xs leading-[normal] font-medium text-muted-foreground">{t("theme")}</span>
            <Segmented
              label={t("theme")}
              value={(theme ?? "system") as "light" | "dark" | "system"}
              onChange={setTheme}
              options={[
                { value: "light", label: t("themeLight") },
                { value: "dark", label: t("themeDark") },
                { value: "system", label: t("themeSystem") },
              ]}
            />
          </div>

          <div className="border-t p-1">
            <button
              type="button"
              onClick={onLogout}
              className="flex h-12 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-[15px] font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
            >
              <LogOut className="size-[18px]" strokeWidth={1.75} aria-hidden />
              {t("logout")}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
