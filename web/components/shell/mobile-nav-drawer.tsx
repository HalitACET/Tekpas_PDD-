"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Building2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import type { SessionUser } from "@/lib/auth/session";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

interface MobileNavDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: SessionUser;
}

/**
 * Design G mobile "Drawer açık": 304 px menu from the left over a scrim. Modal: focus is trapped,
 * Escape and a tap on the scrim close it, and so does choosing a page. Touch targets are 44 px.
 */
export function MobileNavDrawer({ open, onOpenChange, user }: MobileNavDrawerProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-scrim transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 md:hidden" />
        <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-[304px] max-w-[calc(100vw-48px)] flex-col border-r bg-sidebar px-3 pb-7 text-sidebar-foreground shadow-md outline-none transition-transform duration-200 data-ending-style:-translate-x-full data-starting-style:-translate-x-full md:hidden">
          <div className="mb-2 flex h-14 items-center gap-2 pr-1 pl-2">
            <Dialog.Title className="flex items-center">
              <Logo size={24} cutout="var(--sidebar)" />
            </Dialog.Title>
            <Dialog.Close
              aria-label={t("close")}
              className="ml-auto flex size-11 cursor-pointer items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
            >
              <X className="size-5" strokeWidth={1.75} aria-hidden />
            </Dialog.Close>
          </div>

          <nav aria-label={t("label")} className="flex min-h-0 flex-col overflow-y-auto">
            {NAV.map((group, index) => (
              <div key={group.title ?? index} className="mb-3.5 flex flex-col gap-0.5">
                {group.title && (
                  <span className="px-3 pb-1 text-xs leading-[normal] font-medium text-muted-foreground">
                    {t(`groups.${group.title}`)}
                  </span>
                )}
                <ul className="flex flex-col gap-0.5">
                  {group.items.map(({ key, href, icon: Icon }) => {
                    const active = pathname === href || pathname.startsWith(`${href}/`);
                    return (
                      <li key={key}>
                        <Link
                          href={href}
                          onClick={() => onOpenChange(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft",
                            active
                              ? "bg-sidebar-accent font-semibold text-foreground"
                              : "font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                          )}
                        >
                          <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
                          {t(`items.${key}`)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* One company per user: no chevron (same decision as the desktop top bar). */}
          <div className="mt-auto flex h-[52px] shrink-0 items-center gap-2.5 rounded-[10px] border bg-card px-3 text-sm font-medium">
            <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden>
              <Building2 className="size-[15px]" strokeWidth={1.75} />
            </span>
            <span className="truncate">{user.company.name}</span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
