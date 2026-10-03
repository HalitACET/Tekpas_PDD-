"use client";

import type { LucideIcon } from "lucide-react";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Empty state of the design (02): muted icon tile, serif title, body, actions. Loading and error reuse its
 * frame; the design has no screens for them yet (PLAN.md, design debt).
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  children,
  footer,
  tone = "muted",
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: ReactNode;
  /** Below the actions, e.g. the "how to start" guide of the batches page. */
  footer?: ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-[72px] text-center">
      <span
        className={
          tone === "error"
            ? "flex size-14 items-center justify-center rounded-[14px] bg-status-rejected-muted text-status-rejected-foreground"
            : "flex size-14 items-center justify-center rounded-[14px] bg-muted text-muted-foreground"
        }
      >
        <Icon className="size-6" strokeWidth={1.5} aria-hidden />
      </span>
      <h2 className="font-serif text-[26px] leading-[normal] font-normal tracking-[-0.015em]">{title}</h2>
      <p className="max-w-[440px] text-sm leading-[1.55] text-pretty text-muted-foreground">{body}</p>
      {children && <div className="mt-1.5 flex gap-2">{children}</div>}
      {footer}
    </div>
  );
}

/** A list that could not be loaded: same frame as the empty state, with "Tekrar dene". */
export function ListError({ onRetry, retrying }: { onRetry: () => void; retrying?: boolean }) {
  const t = useTranslations("common.listError");
  return (
    <div role="alert">
      <EmptyState icon={CircleAlert} title={t("title")} body={t("body")} tone="error">
        <Button variant="secondary" onClick={onRetry} disabled={retrying}>
          {t("retry")}
        </Button>
      </EmptyState>
    </div>
  );
}

/** Placeholder rows while the first page loads: the table's own grid and row height, bars instead of text. */
export function TableSkeleton({ columns, rows = 6, label }: { columns: string; rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`grid h-12 items-center gap-4 border-b pr-1 pl-4 last:border-b-0 ${columns}`} aria-hidden>
          <Skeleton className="h-3 w-28" />
          <span className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-2.5 w-20" />
          </span>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="ml-auto h-3 w-4" />
          <Skeleton className="h-3 w-12" />
          <span />
        </div>
      ))}
    </div>
  );
}
