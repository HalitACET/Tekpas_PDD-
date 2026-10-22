"use client";

import { ArrowLeft, Eye, Globe, Lock } from "lucide-react";
import { NextIntlClientProvider, useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { GuardedButton } from "@/components/common/guarded-button";
import { PassportFrame } from "@/components/passport/passport-frame";
import { PassportView } from "@/components/passport/passport-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBatchScore, usePassport, usePassportPreview } from "@/lib/api/passports";
import { useBatch } from "@/lib/api/batches";
import { ApiError } from "@/lib/api/request";
import { useSetBreadcrumbDetail } from "@/lib/breadcrumb";
import { useSession } from "@/lib/auth/use-session";
import { cn } from "@/lib/utils";
import { type Locale, locales } from "@/i18n/locales";
import deMessages from "@/messages/de.json";
import enMessages from "@/messages/en.json";
import trMessages from "@/messages/tr.json";
import { PublishDialog } from "./publish-dialog";
import { TranslationsSection } from "./translations-section";

/** Today as an ISO day on Turkish time, for the certificate states of the passport view. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
}

function host(): string {
  return typeof window === "undefined" ? "" : window.location.host;
}

/** The bar under the top bar (design v0.6 version view): back link, what this page is, and for the live one its address. */
function Bar({
  backHref,
  backLabel,
  tone,
  icon,
  title,
  sub,
  action,
}: {
  backHref: string;
  backLabel: string;
  tone: "brand" | "muted";
  icon: ReactNode;
  title: string;
  sub: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={`flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-2 ${
        tone === "brand" ? "border-transparent bg-brand-muted text-brand-text" : "bg-muted text-foreground"
      }`}
    >
      <Link href={backHref} className="flex items-center gap-1.5 text-[13px] font-medium text-inherit no-underline outline-none focus-visible:underline">
        <ArrowLeft className="size-[15px]" strokeWidth={1.75} aria-hidden />
        {backLabel}
      </Link>
      <span className="h-[18px] w-px bg-current opacity-25" aria-hidden />
      <span className="flex items-center gap-2">
        {icon}
        <strong className="text-[13px] font-semibold">{title}</strong>
      </span>
      <span className="text-[13px] opacity-80">{sub}</span>
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}

function Failed({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useTranslations("publishing");
  return (
    <div role="alert" className="flex flex-col items-center gap-2.5 rounded-xl border bg-card px-6 py-12 text-center">
      <strong className="text-[15px] font-semibold">{t("loadFailed")}</strong>
      {error instanceof ApiError && <span className="font-mono text-[11px] text-muted-foreground">HTTP {error.status}</span>}
      <Button variant="secondary" onClick={onRetry}>
        {t("versionsRetry")}
      </Button>
    </div>
  );
}

function Loading() {
  return <Skeleton aria-busy="true" className="mx-auto h-[640px] w-full max-w-[1024px] rounded-xl" />;
}

const PREVIEW_MESSAGES = { tr: trMessages, en: enMessages, de: deMessages } as const;

/**
 * "Önizle" (design v1.1 140, after v0.6 68): the whole window, a dark bar with the batch and the version the draft
 * will become, "Partiye dön" and "Yayınla…"; on the left the translations of the free texts, on the right the passport
 * as it would be published now, at phone width, in the language the reader picks. Nothing is saved by looking; steps
 * that are not approved show as such.
 */
export function PassportPreviewPage({ batchId }: { batchId: string }) {
  const t = useTranslations("translations");
  const tPassport = useTranslations("passport");
  const tPublishing = useTranslations("publishing");
  const batch = useBatch(batchId);
  const score = useBatchScore(batchId);
  const preview = usePassportPreview(batchId);
  const session = useSession();
  const reviewer = session.status === "authenticated" && (session.user.role === "OWNER" || session.user.role === "ADMIN");
  const [language, setLanguage] = useState<Locale>("en");
  const [publishing, setPublishing] = useState(false);
  const version = preview.data?.passport.version ?? (batch.data?.passport?.version ?? 0) + 1;
  const publishable = !!score.data?.publishable && batch.data?.status !== "PUBLISHED";

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:h-dvh">
      <header className="flex h-[52px] flex-none items-center gap-3 bg-[#1F1E1C] pr-4 pl-5 text-[13px] text-[#FAF8F4]">
        <Eye className="size-4 flex-none" strokeWidth={1.75} aria-hidden />
        <span className="font-semibold whitespace-nowrap">{tPassport("previewStrip")}</span>
        {batch.data && (
          <span className="min-w-0 truncate font-mono text-xs text-[#B7B1A7]">{t("draftOf", { batchNo: batch.data.batchNo, version })}</span>
        )}
        <span className="ml-auto flex flex-none gap-2">
          <Link
            href={`/batches/${batchId}`}
            className="flex h-8 items-center rounded-md border border-[#4A463F] px-3 font-medium text-[#FAF8F4] no-underline outline-none hover:bg-[#2E2B27] focus-visible:ring-[3px] focus-visible:ring-ring-soft"
          >
            {tPublishing("barBackToBatch")}
          </Link>
          {batch.data && (
            <GuardedButton
              allowed={reviewer}
              size="sm"
              className="h-8 border-transparent bg-[#8C2F4B] px-3.5 text-white hover:bg-[#6E2239] disabled:opacity-50"
              disabled={!publishable}
              onClick={() => setPublishing(true)}
            >
              {t("publish")}
            </GuardedButton>
          )}
        </span>
      </header>
      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_440px]">
        <main className="px-4 pt-6 pb-10 sm:px-7 lg:min-h-0 lg:overflow-auto">
          <TranslationsSection batchId={batchId} canEdit={reviewer} />
        </main>
        <aside aria-label={t("readerLanguage")} className="flex flex-col border-t bg-muted lg:min-h-0 lg:border-t-0 lg:border-l">
          <div className="flex flex-none items-center gap-2.5 border-b py-3 pr-4 pl-6">
            <span className="text-[13px] font-medium">{t("readerLanguage")}</span>
            <div role="group" aria-label={t("readerLanguage")} className="ml-auto flex gap-0.5 rounded-md border bg-card p-0.5 font-mono text-[11px] font-medium">
              {locales.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={code === language}
                  onClick={() => setLanguage(code)}
                  className={cn(
                    "h-[26px] cursor-pointer rounded px-[9px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft",
                    code === language ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="px-6 py-5 lg:min-h-0 lg:flex-1 lg:overflow-auto">
            {preview.isPending ? (
              <Skeleton aria-busy="true" className="h-[640px] w-full max-w-[390px] rounded-xl" />
            ) : preview.isError ? (
              <Failed error={preview.error} onRetry={() => void preview.refetch()} />
            ) : (
              // lang: the reader's language, also for CSS (an uppercase "T-Shirt" is not "T-SHİRT" in German).
              <div lang={language} className="w-[390px] max-w-full overflow-hidden rounded-xl border shadow-md">
                <NextIntlClientProvider locale={language} messages={PREVIEW_MESSAGES[language]} timeZone="Europe/Istanbul">
                  <PassportFrame languageLinks={false} footerHost={host()}>
                    <PassportView snapshot={preview.data} mode="preview" today={today()} host={host()} />
                  </PassportFrame>
                </NextIntlClientProvider>
              </div>
            )}
          </div>
        </aside>
      </div>
      {batch.data && (
        <PublishDialog batch={batch.data} score={score.data} open={publishing} onClose={() => setPublishing(false)} />
      )}
    </div>
  );
}

/**
 * One version in the panel (design v0.6 version view): the published one is shown as it is to the public, an older or a
 * withdrawn one with a bar that says it is closed to consumers. Versions never change, so it is read once.
 */
export function PassportVersionPage({ batchId, passportId }: { batchId: string; passportId: string }) {
  const t = useTranslations("publishing");
  const locale = useLocale();
  const batch = useBatch(batchId);
  const passport = usePassport(passportId);
  useSetBreadcrumbDetail(batch.data?.batchNo);
  const back = `/batches/${batchId}?tab=versions`;

  if (passport.isPending) return <Loading />;
  if (passport.isError) {
    return (
      <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-4">
        <Failed error={passport.error} onRetry={() => void passport.refetch()} />
      </div>
    );
  }
  const { version, snapshot } = passport.data;
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(version.publishedAt));
  // The published version stays live while a draft of the next one is open (the batch itself is not PUBLISHED then).
  const live = version.status === "PUBLISHED";
  const bar =
    version.status === "WITHDRAWN"
      ? { tone: "muted" as const, icon: <Lock className="size-[15px]" strokeWidth={1.75} aria-hidden />, title: t("barWithdrawnTitle"), sub: t("barWithdrawnSub", { version: version.version, date }) }
      : live
        ? { tone: "brand" as const, icon: <Globe className="size-[15px]" strokeWidth={1.75} aria-hidden />, title: t("barLiveTitle"), sub: t("barLiveSub", { version: version.version, date }) }
        : { tone: "muted" as const, icon: <Lock className="size-[15px]" strokeWidth={1.75} aria-hidden />, title: t("barOldTitle"), sub: t("barOldSub", { version: version.version, date }) };

  return (
    <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-4">
      <Bar
        backHref={back}
        backLabel={t("barBack")}
        {...bar}
        action={
          live ? (
            <a
              href={version.digitalLink.replace(/^https?:\/\/[^/]+/, "")}
              target="_blank"
              rel="noreferrer"
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "h-7 px-2.5 text-xs")}
            >
              {t("openPassport")}
            </a>
          ) : undefined
        }
      />
      <div className="overflow-hidden rounded-xl border">
        <PassportFrame languageLinks={false} footerHost={host()}>
          <PassportView snapshot={snapshot} mode="published" verificationCode={version.verificationCode} today={today()} host={host()} />
        </PassportFrame>
      </div>
    </div>
  );
}
