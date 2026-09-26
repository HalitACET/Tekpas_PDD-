"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import type { SessionUser } from "@/lib/auth/session";
import type { PageKey } from "@/lib/nav";
import { MobileNavDrawer } from "./mobile-nav-drawer";
import { MobileUserSheet } from "./mobile-user-sheet";
import { initials } from "./user-menu";

/** Design G mobile header (below md): menu, mark, centred page title, user avatar. 44 px targets. */
export function MobileTopbar({ user, page }: { user: SessionUser; page?: PageKey }) {
  const tNav = useTranslations("nav");
  const tShell = useTranslations("shell");
  const tRoles = useTranslations("roles");
  const [menuOpen, setMenuOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  return (
    <header className="relative flex h-14 shrink-0 items-center border-b px-2 md:hidden">
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label={tNav("open")}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        className="flex size-11 cursor-pointer items-center justify-center rounded-lg text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/18"
      >
        <Menu className="size-[22px]" strokeWidth={1.75} aria-hidden />
      </button>
      <span className="ml-0.5 flex" aria-hidden>
        <LogoMark size={22} />
      </span>
      {page && (
        <span className="absolute left-1/2 -translate-x-1/2 text-base font-semibold tracking-[-0.01em]" aria-hidden>
          {tNav(`items.${page}`)}
        </span>
      )}
      <button
        type="button"
        onClick={() => setUserOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={userOpen}
        className="ml-auto flex size-11 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/18"
      >
        <span
          className="flex size-8 items-center justify-center rounded-full bg-silk text-xs font-semibold text-[#3D3A35]"
          aria-hidden
        >
          {initials(user.fullName)}
        </span>
        <span className="sr-only">
          {user.fullName} {tRoles(user.role)} – {tShell("userMenu")}
        </span>
      </button>

      <MobileNavDrawer open={menuOpen} onOpenChange={setMenuOpen} user={user} />
      <MobileUserSheet open={userOpen} onOpenChange={setUserOpen} user={user} />
    </header>
  );
}
