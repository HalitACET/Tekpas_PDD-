"use client";

import { CircleAlert, ExternalLink, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BatchResponse } from "@/lib/api/batches";
import { type PassportVersion, usePassportVersions } from "@/lib/api/passports";
import { ApiError } from "@/lib/api/request";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const GRID = "grid grid-cols-[70px_130px_120px_minmax(0,1fr)_70px_200px] items-center gap-3";

const CHIP = {
  PUBLISHED: { chip: "bg-brand-muted text-brand-text", dot: "bg-brand" },
  SUPERSEDED: { chip: "bg-status-pending-muted text-status-pending-foreground", dot: "bg-status-pending" },
  WITHDRAWN: { chip: "bg-status-rejected-muted text-status-rejected-foreground", dot: "bg-status-rejected" },
} as const;

/**
 * "Pasaport sürümleri" (design v0.6): every version with its state, date, who published it and the score it had; the
 * published one links to its public address, every one opens in the panel. A withdrawn version shows who withdrew it and
 * why. Older and withdrawn versions are only visible here (docs/m6-plan.md §9 decision 8).
 */
export function VersionsTab({ batch }: { batch: BatchResponse }) {
  const t = useTranslations("publishing");
  const locale = useLocale();
  const versions = usePassportVersions(batch.id);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(iso));

  if (versions.isError && !versions.data) {
    const error = versions.error;
    return (
      <div role="alert" className="flex flex-col items-center gap-2.5 rounded-[10px] border bg-card px-6 py-12 text-center">
        <span className="flex size-11 items-center justify-center rounded-[10px] bg-status-rejected-muted text-status-rejected-foreground">
          <CircleAlert className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <strong className="text-[15px] font-semibold">{t("versionsFailed")}</strong>
        <span className="text-[13px] text-muted-foreground">{t("versionsFailedBody")}</span>
        {error instanceof ApiError && (
          <span className="font-mono text-[11px] text-muted-foreground">
            HTTP {error.status}
            {error.requestId ? ` · ${error.requestId}` : ""}
          </span>
        )}
        <Button variant="secondary" className="mt-1.5" onClick={() => void versions.refetch()} disabled={versions.isFetching}>
          <RefreshCw strokeWidth={1.75} aria-hidden />
          {t("versionsRetry")}
        </Button>
      </div>
    );
  }
  if (versions.data?.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2.5 rounded-[10px] border border-dashed border-input px-6 py-14 text-center">
        <strong className="font-serif text-2xl font-normal tracking-[-0.015em]">{t("versionsEmptyTitle")}</strong>
        <span className="max-w-[440px] text-sm leading-[1.55] text-muted-foreground">{t("versionsEmptyBody")}</span>
      </div>
    );
  }

  const columns = t.raw("versionsColumns") as string[];
  return (
    <div className="flex flex-col gap-3">
      <div role="table" className="overflow-hidden rounded-lg border bg-card">
        <div role="row" className={`${GRID} h-9 border-b bg-muted px-4 text-xs font-medium text-muted-foreground`}>
          {columns.map((c) => (
            <span key={c} role="columnheader">
              {c}
            </span>
          ))}
          <span role="columnheader" />
        </div>
        {!versions.data
          ? ["120px", "160px", "100px"].map((w) => (
              <div key={w} aria-busy="true" className="flex h-[52px] items-center gap-7 border-b px-4">
                <Skeleton className="h-2.5 w-8" />
                <Skeleton className="h-5 w-[84px] rounded-full" />
                <Skeleton className="h-2.5 w-[90px]" />
                <Skeleton className="h-2.5" style={{ width: w }} />
              </div>
            ))
          : versions.data.map((v) => <VersionRow key={v.id} version={v} batch={batch} date={date} />)}
      </div>
      <span className="text-xs text-muted-foreground">{t("versionsNote")}</span>
    </div>
  );
}

function VersionRow({ version, batch, date }: { version: PassportVersion; batch: BatchResponse; date: (iso: string) => string }) {
  const t = useTranslations("publishing");
  const locale = useLocale();
  const chip = CHIP[version.status];
  return (
    <div role="row" className="flex flex-col gap-1.5 border-b px-4 py-2.5 text-[13px] last:border-b-0">
      <div className={GRID}>
        <span role="cell" className="font-mono font-medium">
          v{version.version}
        </span>
        <span role="cell">
          <span className={`inline-flex items-center gap-1.5 rounded-full py-[3px] pr-[9px] pl-2 text-xs font-medium whitespace-nowrap ${chip.chip}`}>
            <span className={`size-1.5 rounded-full ${chip.dot}`} aria-hidden />
            {t(`status${version.status}`)}
          </span>
        </span>
        <span role="cell" className="tabular-nums">
          {date(version.publishedAt)}
        </span>
        <span role="cell">{version.publishedByName ?? "—"}</span>
        <span role="cell" className="font-mono font-medium">
          {formatPercent(version.completeness, locale)}
        </span>
        <span role="cell" className="flex justify-end gap-1.5">
          {version.status === "PUBLISHED" && (
            <a
              href={version.digitalLink.replace(/^https?:\/\/[^/]+/, "")}
              target="_blank"
              rel="noreferrer"
              title={t("versionPublicTitle")}
              className="flex h-8 items-center gap-[5px] rounded-md px-2.5 text-xs font-medium text-brand-text outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
            >
              <ExternalLink className="size-[13px]" strokeWidth={1.75} aria-hidden />
              {t("versionPublic")}
            </a>
          )}
          <Link
            href={`/batches/${batch.id}/passports/${version.id}`}
            className={cn(buttonVariants({ variant: "secondary" }), "h-8 px-3 text-xs shadow-none")}
          >
            {t("versionView")}
          </Link>
        </span>
      </div>
      {version.status === "WITHDRAWN" && version.withdrawReason && (
        <span className="ml-[82px] text-xs leading-normal text-muted-foreground">
          {t("versionWithdrawnNote", {
            name: version.withdrawnByName ?? "—",
            date: version.withdrawnAt ? date(version.withdrawnAt) : "—",
            reason: version.withdrawReason,
          })}
        </span>
      )}
    </div>
  );
}
