"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useSyncExternalStore } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { pageKeyFromPath } from "@/lib/nav";
import { MobileTopbar } from "./mobile-topbar";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const COLLAPSED_KEY = "kozapass.sidebar.collapsed";
const collapseListeners = new Set<() => void>();

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // Private mode / blocked storage: the choice just is not remembered.
  }
  collapseListeners.forEach((listener) => listener());
}

/** Sidebar collapsed state, remembered per browser (a convenience, not user data). */
export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    (listener) => {
      collapseListeners.add(listener);
      return () => collapseListeners.delete(listener);
    },
    readCollapsed,
    () => false,
  );
  const toggle = useCallback(() => writeCollapsed(!readCollapsed()), []);
  return [collapsed, toggle];
}

/** Design G: left menu + top bar + page from md up; below md the mobile header with drawer. */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const [collapsed, toggle] = useSidebarCollapsed();

  return (
    <div className="flex h-dvh bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-3 py-2 text-[13px] shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-[3px] focus:ring-ring/18"
      >
        {t("skipToContent")}
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} page={pageKeyFromPath(pathname)} />
        <MobileTopbar user={user} page={pageKeyFromPath(pathname)} />
        <main
          id="main"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 py-5 outline-none md:gap-5 md:px-8 md:py-7"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
