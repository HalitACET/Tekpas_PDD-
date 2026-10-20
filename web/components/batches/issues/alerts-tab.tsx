"use client";

import { CircleCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { GuardedButton } from "@/components/common/guarded-button";
import { ListError } from "@/components/common/list-states";
import { Skeleton } from "@/components/ui/skeleton";
import type { BatchResponse } from "@/lib/api/batches";
import { type Issue, type IssueSeverity, useBatchIssues, useValidateBatch } from "@/lib/api/issues";
import { canReview, canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IssueCard } from "./issue-card";
import { SEVERITY_TONE } from "./use-issue-view";

/** From this many open alerts on, they are grouped by severity under headings (design v0.7 82e). */
const GROUP_FROM = 10;
const SEVERITIES: IssueSeverity[] = ["ERROR", "WARNING", "INFO"];

/**
 * The "Uyarılar" tab (design v0.7 78–85): Açık / Çözülen, "Kontrolleri çalıştır" with the time of the last check, the
 * cards, and the states of a list (loading, empty, error). OWNER and ADMIN resolve; EDITOR runs the checks; VIEWER reads.
 */
export function AlertsTab({ batch }: { batch: BatchResponse }) {
  const t = useTranslations("issues");
  const locale = useLocale();
  const session = useSession();
  const role = session.status === "authenticated" ? session.user.role : undefined;
  const canWrite = !!role && canWriteCatalog(role);
  const canResolve = !!role && canReview(role);
  const [seg, setSeg] = useState<"OPEN" | "RESOLVED">("OPEN");
  const open = useBatchIssues(batch.id, "OPEN");
  const resolved = useBatchIssues(batch.id, "RESOLVED");
  const run = useValidateBatch(batch.id);
  const shown = seg === "OPEN" ? open : resolved;
  // The counts of both sides come with every answer; the newer one is right.
  const counts = open.data ?? resolved.data;
  const lastRun = counts?.validatedAt ? formatWhen(counts.validatedAt, new Date(), locale) : undefined;
  const productHref = "/products";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div role="radiogroup" aria-label={t("filter")} className="flex gap-0.5 rounded-md bg-muted p-0.5">
          {(["OPEN", "RESOLVED"] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={seg === key}
              onClick={() => setSeg(key)}
              className={cn(
                "flex h-7 cursor-pointer items-center gap-1.5 rounded-[4px] px-2.5 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft",
                seg === key ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
              )}
            >
              {key === "OPEN" ? t("open") : t("resolved")}
              <span className="font-mono text-[11px] font-medium text-muted-foreground">
                {key === "OPEN" ? (counts ? counts.open.errors + counts.open.warnings + counts.open.infos : "—") : (counts?.resolved ?? "—")}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <RunButton running={run.isPending} allowed={canWrite} onRun={() => run.mutate()} />
          <span className="font-mono text-[11px] text-muted-foreground" aria-live="polite">
            {run.isPending ? t("runningHint") : lastRun ? t("lastCheck", { time: lastRun }) : t("neverChecked")}
          </span>
        </div>
      </div>

      {shown.isPending ? (
        <Loading />
      ) : shown.isError && !shown.data ? (
        <div className="rounded-[10px] border bg-card">
          <ListError title={t("loadError")} error={shown.error} onRetry={() => void shown.refetch()} retrying={shown.isFetching} keepsFilters={false} />
        </div>
      ) : shown.data!.issues.length === 0 ? (
        seg === "OPEN" ? (
          <Empty lastRun={lastRun} running={run.isPending} allowed={canWrite} onRun={() => run.mutate()} />
        ) : (
          <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-input px-6 py-14 text-center">
            <strong className="font-serif text-2xl font-normal tracking-[-0.015em]">{t("emptyResolvedTitle")}</strong>
            <span className="max-w-[460px] text-sm leading-[1.55] text-muted-foreground">{t("emptyResolvedBody")}</span>
          </div>
        )
      ) : (
        <List issues={shown.data!.issues} grouped={seg === "OPEN" && shown.data!.issues.length >= GROUP_FROM}>
          {(issue) => (
            <IssueCard key={issue.id} issue={issue} batchId={batch.id} productHref={productHref} canResolve={canResolve} canWrite={canWrite} />
          )}
        </List>
      )}
    </div>
  );
}

function RunButton({ running, allowed, onRun }: { running: boolean; allowed: boolean; onRun: () => void }) {
  const t = useTranslations("issues");
  return (
    <GuardedButton allowed={allowed} variant="secondary" size="sm" tooltipSide="top" className="h-8 px-3 text-xs" disabled={running} onClick={onRun}>
      <RefreshCw className={cn("size-[13px]", running && "animate-spin")} strokeWidth={1.75} aria-hidden />
      {running ? t("running") : t("run")}
    </GuardedButton>
  );
}

function List({ issues, grouped, children }: { issues: Issue[]; grouped: boolean; children: (issue: Issue) => React.ReactNode }) {
  const t = useTranslations("issues");
  if (!grouped) return <div className="flex flex-col gap-2.5">{issues.map(children)}</div>;
  return (
    <div className="flex flex-col gap-4.5">
      {SEVERITIES.map((severity) => {
        const items = issues.filter((i) => i.severity === severity);
        if (items.length === 0) return null;
        return (
          <section key={severity} aria-label={t(`severity.${severity}`)} className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2 pt-1">
              <span className={cn("size-2 rounded-full", SEVERITY_TONE[severity].dot)} aria-hidden />
              <h3 className="text-[13px] font-semibold">{t(`severity.${severity}`)}</h3>
              <span className="rounded-[4px] bg-muted px-1.5 py-px font-mono text-[11px] font-medium text-muted-foreground">{items.length}</span>
              <span className="text-xs text-muted-foreground">{t(`groupDesc.${severity}`)}</span>
            </div>
            {items.map(children)}
          </section>
        );
      })}
    </div>
  );
}

function Loading() {
  const t = useTranslations("issues");
  return (
    <div aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2.5">
      {["72%", "58%", "66%"].map((width) => (
        <div key={width} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3.5 rounded-[10px] border bg-card p-4">
          <Skeleton className="size-9 rounded-lg" />
          <span className="flex flex-col gap-2.5">
            <span className="flex gap-2">
              <Skeleton className="h-[18px] w-[76px] rounded-full" />
              <Skeleton className="h-[18px] w-[52px] rounded-[4px]" />
            </span>
            <Skeleton className="h-3" style={{ width }} />
            <Skeleton className="h-2.5 w-2/5" />
          </span>
        </div>
      ))}
    </div>
  );
}

function Empty({ lastRun, running, allowed, onRun }: { lastRun?: string; running: boolean; allowed: boolean; onRun: () => void }) {
  const t = useTranslations("issues");
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-input px-6 py-16 text-center">
      <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-status-approved-muted text-status-approved-foreground">
        <CircleCheck className="size-6" strokeWidth={1.75} aria-hidden />
      </span>
      <h2 className="font-serif text-[26px] leading-[normal] font-normal tracking-[-0.015em]">{t("emptyTitle")}</h2>
      <p className="max-w-[440px] text-sm leading-[1.55] text-muted-foreground">
        {lastRun ? t("emptyBody", { when: lastRun }) : t("emptyNever")}
      </p>
      <RunButton running={running} allowed={allowed} onRun={onRun} />
    </div>
  );
}

/** Used by the tab bar and the header: an icon for the most severe open alert. */
export function SeverityIcon({ severity, className }: { severity: IssueSeverity; className?: string }) {
  return <TriangleAlert className={cn(SEVERITY_TONE[severity].text, className)} aria-hidden />;
}
