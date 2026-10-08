"use client";

import { PanelLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** Design G left menu: 240 px, or 52 px icons only when collapsed (Bileşenler "Daraltılmış"). */
export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground transition-[width] duration-150 md:flex",
        collapsed ? "w-[52px] px-1.5" : "w-60",
      )}
    >
      <div className={cn("mb-3 flex h-10 items-center gap-2", collapsed ? "justify-center" : "px-2")}>
        <LogoMark size={22} cutout="var(--sidebar)" title={collapsed ? "KozaPass" : undefined} />
        {!collapsed && <span className="text-[15px] font-semibold tracking-[-0.03em]">KozaPass</span>}
      </div>

      <nav aria-label={t("label")} className="flex flex-col">
        {NAV.map((group, index) => (
          <div key={group.title ?? index} className="mb-4 flex flex-col gap-0.5">
            {group.title && !collapsed && (
              <span className="px-2 pb-1.5 text-[11px] leading-[normal] font-medium text-muted-foreground">
                {t(`groups.${group.title}`)}
              </span>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ key, href, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                const label = t(`items.${key}`);
                return (
                  <li key={key}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      aria-label={collapsed ? label : undefined}
                      title={collapsed ? label : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-md text-[13px] outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring-soft",
                        collapsed ? "justify-center" : "px-2",
                        active ? "bg-sidebar-accent font-semibold text-foreground" : "font-medium text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                      {!collapsed && label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t("expand") : undefined}
        title={collapsed ? t("expand") : undefined}
        className={cn(
          "mt-auto flex h-8 cursor-pointer items-center gap-2.5 rounded-md text-[13px] text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring-soft",
          collapsed ? "justify-center" : "px-2",
        )}
      >
        <PanelLeft className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        {!collapsed && t("collapse")}
      </button>
    </aside>
  );
}
