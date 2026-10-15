"use client";

import { Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/** "Karaca Tekstil A.Ş." → "KT": the first letters of the first two words. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase())
    .join("");
}

/** The firm's tile: silk beige with its initials (design 39, 44). */
export function FirmTile({ name, size = 44, className }: { name: string; size?: 28 | 40 | 44; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center bg-silk font-semibold text-[#3D3A35]",
        size === 28 ? "size-7 rounded-md text-[11px]" : size === 40 ? "size-10 rounded-[10px] text-[13px]" : "size-11 rounded-[10px] text-sm",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** "Sorunuz mu var?" with the contact's name; phone and WhatsApp wait for the roles of M12. */
export function ContactLine({ name, manufacturer }: { name: string; manufacturer: string }) {
  const t = useTranslations("supplier.welcome");
  return (
    <div className="flex flex-col gap-1.5 text-[13px]" role="group" aria-label={t("contactAria")}>
      <span className="text-muted-foreground">{t("question")}</span>
      <span className="font-medium">{t("contact", { name, manufacturer })}</span>
    </div>
  );
}

/** The days left as the design words it: "7 gün kaldı", and a line of its own for the last day. */
export function daysLeft(expiresAt: string, now: Date): { text: "days" | "hours"; days: number } {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  const days = Math.ceil(ms / 86_400_000);
  return ms < 86_400_000 ? { text: "hours", days: 0 } : { text: "days", days };
}

export function useDates() {
  const locale = useLocale();
  return {
    /** "17 Ekim 2026, Cumartesi" */
    long: (iso: string) => {
      const date = new Date(iso);
      const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(date);
      const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
      return `${day}, ${weekday}`;
    },
    /** "17 Ekim 2026" */
    day: (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)),
    /** "17 Ekim" */
    short: (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(iso)),
    /** "17.10.2026" */
    numeric: (iso: string) =>
      new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)),
    /** "10 Ekim 2026, 14:32" */
    dateTime: (iso: string) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
        new Date(iso),
      ),
    /** "8 Eki 2026, 15:12" */
    dateTimeShort: (iso: string) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
        .format(new Date(iso))
        .replace(/\.$/, ""),
  };
}

/**
 * The page around every screen of the supplier's link (design 39–45): cream header with the lock note, the
 * content in a column (on desktop the form gets an aside, 40c), the footer.
 */
export function SupplierFrame({ aside, children }: { aside?: ReactNode; children: ReactNode }) {
  const t = useTranslations("supplier");
  const tCommon = useTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 flex-none items-center gap-2 border-b border-story-border bg-story px-4 lg:px-16">
        <LogoMark size={22} cutout="var(--story)" />
        <span className="text-base font-semibold tracking-[-0.03em]">{tCommon("brand")}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" strokeWidth={1.75} aria-hidden />
          {t("secure")}
        </span>
      </header>
      <div className="flex flex-1 items-start justify-center gap-12 px-4 pt-4 pb-8 lg:px-16 lg:pt-10 lg:pb-16">
        {aside && <aside className="hidden w-[340px] flex-none flex-col gap-4 lg:flex">{aside}</aside>}
        <main className="flex w-full max-w-[640px] min-w-0 flex-col gap-4">{children}</main>
      </div>
      <footer className="flex justify-between gap-3 border-t border-border px-4 pt-4 pb-6 text-xs text-muted-foreground lg:px-16">
        <span>{t("footer.tagline")}</span>
        <span className="flex gap-3">
          <span>{t("footer.kvkk")}</span>
          <span>{t("footer.privacy")}</span>
        </span>
      </footer>
    </div>
  );
}

/** The card of facts with a label on the left and the value on the right (39, 43, 44). */
export function FactList({
  rows,
  title,
  trailing,
}: {
  rows: { label: string; value: ReactNode; mono?: boolean }[];
  title?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card">
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          {title}
          {trailing}
        </div>
      )}
      <dl>
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={cn("flex items-baseline justify-between gap-4 px-4 py-[11px]", i < rows.length - 1 && "border-b border-border")}
          >
            <dt className="flex-none text-sm text-muted-foreground">{row.label}</dt>
            <dd className={cn("text-right text-sm font-medium", row.mono && "font-mono")}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
