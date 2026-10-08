"use client";

import type { LucideIcon } from "lucide-react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/request";

/** Empty state of the design (02): muted icon tile, serif title, body, actions. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
  footer,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: ReactNode;
  /** Below the actions, e.g. the "how to start" guide of the batches page. */
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-[72px] text-center">
      <span className="flex size-14 items-center justify-center rounded-[14px] bg-muted text-muted-foreground">
        <Icon className="size-6" strokeWidth={1.5} aria-hidden />
      </span>
      <h2 className="font-serif text-[26px] leading-[normal] font-normal tracking-[-0.015em]">{title}</h2>
      <p className="max-w-[440px] text-sm leading-[1.55] text-pretty text-muted-foreground">{body}</p>
      {children && <div className="mt-1.5 flex gap-2">{children}</div>}
      {footer}
    </div>
  );
}

/**
 * A list that could not be loaded (design v0.3.1 20). The mono line names the HTTP status and the request
 * id when the server answered; without an answer (offline, unreachable) there is nothing to name.
 */
export function ListError({
  title,
  error,
  onRetry,
  retrying,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const t = useTranslations("common.listError");
  const answer = error instanceof ApiError ? error : undefined;
  return (
    <div role="alert" className="flex flex-col items-center gap-2.5 px-6 py-[72px] text-center">
      <span className="flex size-11 items-center justify-center rounded-[10px] bg-status-rejected-muted text-status-rejected-foreground">
        <CircleAlert className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <strong className="text-[15px] font-semibold">{title}</strong>
      <span className="max-w-[380px] text-[13px] leading-normal text-pretty text-muted-foreground">{t("body")}</span>
      {answer && (
        <span className="font-mono text-[11px] text-muted-foreground">
          {answer.requestId
            ? t("metaWithId", { status: answer.status, id: answer.requestId })
            : t("meta", { status: answer.status })}
        </span>
      )}
      <Button variant="secondary" className="mt-1.5" onClick={onRetry} disabled={retrying}>
        <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />
        {t("retry")}
      </Button>
    </div>
  );
}

/**
 * Placeholder rows while the first page loads (design v0.3.1 19): 48 px rows of bars, the fourth a pill
 * where the status chip will be. The second bar's widths vary so the rows do not look like a stripe.
 */
const SKELETON_WIDTHS = ["62%", "48%", "74%", "55%", "68%", "42%"];

export function TableSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} aria-busy="true">
      {SKELETON_WIDTHS.map((width) => (
        <div key={width} className="flex h-12 items-center gap-7 border-b px-4" aria-hidden>
          <Skeleton className="h-2.5 w-[120px] rounded-[3px]" />
          <Skeleton className="h-2.5 flex-1 rounded-[3px]" style={{ maxWidth: width }} />
          <Skeleton className="h-2.5 w-[110px] rounded-[3px]" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-2.5 w-14 rounded-[3px]" />
        </div>
      ))}
    </div>
  );
}
