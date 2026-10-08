"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_COOKIE, locales, type Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

export function useSwitchLocale() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const switchTo = (locale: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
    // Server components read the cookie (i18n/request.ts); refresh re-renders them in the new language.
    startTransition(() => router.refresh());
  };
  return { switchTo, pending };
}

interface LanguageSwitcherProps {
  /** plain: login (design F); boxed: top bar (design G). */
  appearance?: "plain" | "boxed";
  className?: string;
}

/** TR / EN / DE as a segmented control. */
export function LanguageSwitcher({ appearance = "boxed", className }: LanguageSwitcherProps) {
  const current = useLocale();
  const t = useTranslations("common");
  const { switchTo, pending } = useSwitchLocale();

  return (
    <div
      role="group"
      aria-label={t("language")}
      aria-busy={pending || undefined}
      className={cn(
        "flex gap-0.5 font-mono text-[11px] font-medium",
        appearance === "boxed" && "rounded-md bg-muted p-0.5",
        className,
      )}
    >
      {locales.map((locale) => {
        const active = locale === current;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            aria-pressed={active}
            // The visible code stays in the name (WCAG 2.5.3 label in name).
            aria-label={`${locale.toUpperCase()} – ${t(`languages.${locale}`)}`}
            onClick={() => !active && switchTo(locale)}
            className={cn(
              "cursor-pointer rounded-sm px-2 py-[5px] uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              active && (appearance === "boxed" ? "bg-card shadow-xs" : "bg-muted"),
            )}
          >
            {locale}
          </button>
        );
      })}
    </div>
  );
}

/** Mobile login (design F mobile): a single language chip that opens TR / EN / DE. */
export function LanguageMenu({ className }: { className?: string }) {
  const current = useLocale() as Locale;
  const t = useTranslations("common");
  const { switchTo } = useSwitchLocale();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${current.toUpperCase()} – ${t("language")}: ${t(`languages.${current}`)}`}
        className={cn(
          // Design size (≈22 px); an invisible ::after enlarges the touch target without moving the layout.
          "relative flex cursor-pointer items-center rounded-sm after:absolute after:-inset-2.5 after:content-[''] border border-story-line px-1.5 py-[3px] font-mono text-[11px] font-medium text-muted-foreground uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft",
          className,
        )}
      >
        {current}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuRadioGroup value={current} onValueChange={(value) => switchTo(value as Locale)}>
          {locales.map((locale) => (
            <DropdownMenuRadioItem key={locale} value={locale} lang={locale} className="min-h-11">
              {t(`languages.${locale}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
