"use client";

import { ArrowLeft, Eye, Globe, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { type ReactNode } from "react";
import { PassportFrame } from "@/components/passport/passport-frame";
import { PassportView } from "@/components/passport/passport-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePassport, usePassportPreview } from "@/lib/api/passports";
import { useBatch } from "@/lib/api/batches";
import { ApiError } from "@/lib/api/request";
import { useSetBreadcrumbDetail } from "@/lib/breadcrumb";
import { cn } from "@/lib/utils";

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

/**
 * "Önizle": the passport as it would be published now, in the panel, framed like the public page with the preview strip
 * (design v0.6 state f). Nothing is saved; steps that are not approved show as such.
 */
export function PassportPreviewPage({ batchId }: { batchId: string }) {
  const t = useTranslations("publishing");
  const tPassport = useTranslations("passport");
  const batch = useBatch(batchId);
  const preview = usePassportPreview(batchId);
  useSetBreadcrumbDetail(batch.data?.batchNo);

  return (
    <div className="mx-auto flex w-full max-w-[1024px] flex-col gap-4">
      <Bar
        backHref={`/batches/${batchId}`}
        backLabel={t("barBackToBatch")}
        tone="muted"
        icon={<Eye className="size-[15px]" strokeWidth={1.75} aria-hidden />}
        title={t("barPreviewTitle")}
        sub={t("barPreviewSub")}
      />
      {preview.isPending ? (
        <Loading />
      ) : preview.isError ? (
        <Failed error={preview.error} onRetry={() => void preview.refetch()} />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <PassportFrame strip={{ title: tPassport("previewStrip"), sub: tPassport("previewSub") }} languageLinks={false} footerHost={host()}>
            <PassportView snapshot={preview.data} mode="preview" today={today()} host={host()} />
          </PassportFrame>
        </div>
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
