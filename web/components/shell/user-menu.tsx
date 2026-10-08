"use client";

import { ChevronDown, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout, type SessionUser } from "@/lib/auth/session";

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return letters.map((p) => p[0]?.toLocaleUpperCase("tr")).join("").slice(0, 2);
}

/** Design G user block: avatar, name, role label; menu with theme choice and sign out. */
export function UserMenu({ user }: { user: SessionUser }) {
  const t = useTranslations("shell");
  const tRoles = useTranslations("roles");
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  async function onLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <DropdownMenu>
      {/* Name comes from the visible text (WCAG 2.5.3); aria-haspopup announces the menu. */}
      <DropdownMenuTrigger
        className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
      >
        <span
          className="flex size-7 items-center justify-center rounded-full bg-silk text-[11px] font-semibold text-[#3D3A35]"
          aria-hidden
        >
          {initials(user.fullName)}
        </span>
        <span className="sr-only lg:not-sr-only lg:flex lg:flex-col lg:text-left lg:leading-[1.2]">
          <span className="text-xs font-medium">{user.fullName}</span>{" "}
          <span className="text-[11px] text-muted-foreground">{tRoles(user.role)}</span>
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-foreground">{user.fullName}</span>
            <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
            <span className="text-xs font-normal text-muted-foreground">{tRoles(user.role)}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">{t("theme")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={(value) => setTheme(value as string)}>
            <DropdownMenuRadioItem value="light">{t("themeLight")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">{t("themeDark")}</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">{t("themeSystem")}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout}>
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden />
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
