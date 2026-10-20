import { Ban, Check, Clock, Eye } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { ThemeToggle } from "./theme-toggle";

export interface Banner {
  tone: "approved" | "rejected" | "expiring";
  title: string;
  body: string;
}

const BANNER_ICON = { approved: Check, rejected: Ban, expiring: Clock } as const;
const BANNER_STYLE = {
  approved: "border-status-approved bg-status-approved-muted text-status-approved-foreground",
  rejected: "border-status-rejected bg-status-rejected-muted text-status-rejected-foreground",
  expiring: "border-status-expiring bg-status-expiring-muted text-status-expiring-foreground",
} as const;

const LANGUAGES = ["tr", "en", "de"] as const;

/**
 * The page around every state of the passport (design v0.6): the preview strip and the version banner on top, the
 * header with the brand, the language links and the theme button, the content column (max 784 px, 16–32 px gutters),
 * and the footer. The language links are plain `?lang=` links, so they work without JavaScript and every language has
 * its own address. Light and dark follow the OS.
 */
export function PassportFrame({
  children,
  strip,
  banner,
  languageLinks = true,
  footerHost,
}: {
  children: ReactNode;
  /** "Önizleme · henüz yayınlanmadı" bar (preview from the panel). */
  strip?: { title: string; sub: string };
  banner?: Banner;
  languageLinks?: boolean;
  /** The address shown at the right of the footer. */
  footerHost?: string;
}) {
  const t = useTranslations("passport");
  const tMeta = useTranslations("meta");
  const locale = useLocale();
  const BannerIcon = banner ? BANNER_ICON[banner.tone] : null;

  return (
    <div className="min-h-dvh bg-story font-sans text-[15px] leading-normal text-foreground antialiased [container-type:inline-size] break-words hyphens-auto">
      {strip && (
        <div role="status" className="sticky top-0 z-10 flex items-center gap-2.5 bg-primary px-[clamp(16px,5cqi,32px)] py-2.5 text-sm text-primary-foreground">
          <Eye className="size-4 flex-none" strokeWidth={1.75} aria-hidden />
          <span className="font-semibold">{strip.title}</span>
          <span className="min-w-0 flex-1">{strip.sub}</span>
        </div>
      )}

      {banner && BannerIcon && (
        <div role="alert" className={`border-b-2 ${BANNER_STYLE[banner.tone]}`}>
          <div className="mx-auto flex max-w-[784px] items-start gap-3 px-[clamp(16px,5cqi,32px)] py-3.5">
            <BannerIcon className="mt-px size-5 flex-none" strokeWidth={2} aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <strong className="text-[15px] leading-[1.35] font-semibold">{banner.title}</strong>
              <span className="text-sm leading-normal text-pretty text-foreground">{banner.body}</span>
            </span>
          </div>
        </div>
      )}

      <header className="border-b border-story-border">
        <div className="mx-auto flex h-[60px] max-w-[784px] items-center gap-2.5 px-[clamp(16px,5cqi,32px)]">
          <LogoMark size={22} color="var(--brand)" cutout="var(--story)" />
          <span className="flex min-w-0 flex-col leading-[1.15]">
            <span className="text-[15px] font-semibold tracking-[-0.03em]">{tMeta("title")}</span>
            <span className="truncate text-xs text-muted-foreground">{t("dpp")}</span>
          </span>
          {languageLinks && (
            <nav aria-label={t("langLabel")} className="ml-auto flex items-center">
              {LANGUAGES.map((code) => (
                <a
                  key={code}
                  href={`?lang=${code}`}
                  hrefLang={code}
                  aria-current={code === locale ? "true" : undefined}
                  className={`flex h-11 min-w-10 items-center justify-center font-mono text-[13px] font-medium underline-offset-[5px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft ${
                    code === locale ? "text-foreground underline" : "text-muted-foreground"
                  }`}
                >
                  {code.toUpperCase()}
                </a>
              ))}
            </nav>
          )}
          <span className={languageLinks ? "" : "ml-auto"}>
            <ThemeToggle label={t("theme")} />
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-[784px] flex-col gap-10 px-[clamp(16px,5cqi,32px)] pt-[clamp(24px,6cqi,48px)] pb-10">
        {children}
      </main>

      <footer className="border-t border-story-border">
        <div className="mx-auto flex max-w-[784px] flex-wrap items-center gap-2 px-[clamp(16px,5cqi,32px)] pt-5 pb-7 text-[13px] text-muted-foreground">
          <LogoMark size={14} color="var(--muted-foreground)" cutout="var(--story)" variant="simplified" />
          <span>{t("made")}</span>
          {footerHost && <span className="ml-auto font-mono text-xs break-all hyphens-none">{footerHost}</span>}
        </div>
      </footer>
    </div>
  );
}
