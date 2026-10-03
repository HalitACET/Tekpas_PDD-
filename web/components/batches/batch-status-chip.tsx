"use client";

import type { BatchStatus } from "@tekpas/shared";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Batch status as the design's status chip (07). The design shows supply chain step states there; batches
 * have their own four states, mapped to the same chip style (design debt, PLAN.md).
 */
const TONES: Record<BatchStatus, { chip: string; dot?: string }> = {
  DRAFT: { chip: "bg-status-pending-muted text-status-pending-foreground", dot: "bg-status-pending" },
  COLLECTING: { chip: "bg-status-submitted-muted text-status-submitted-foreground", dot: "bg-status-submitted" },
  READY: { chip: "bg-status-approved-muted text-status-approved-foreground", dot: "bg-status-approved" },
  // Published is the end state: a filled brand chip with a check, so it never reads like "rejected" (muted red).
  // Text --primary-foreground: cream on light brand (7.5:1), dark on dark brand (6.8:1).
  PUBLISHED: { chip: "bg-brand text-primary-foreground" },
};

export function BatchStatusChip({ status }: { status: BatchStatus }) {
  const t = useTranslations("enums.batchStatus");
  const tone = TONES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full py-[3px] pr-[9px] pl-2 text-xs font-medium whitespace-nowrap ${tone.chip}`}
    >
      {tone.dot ? (
        <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
      ) : (
        <Check className="-mx-px size-3" strokeWidth={2.5} aria-hidden />
      )}
      {t(status)}
    </span>
  );
}

/**
 * Supply chain progress (07): one segment per step, approved green, the rest grey; "—" while there is no
 * chain (M3 builds it). Step-level colours need the chain itself (design debt).
 */
export function ChainProgress({ total, approved }: { total: number; approved: number }) {
  const t = useTranslations("batches");
  if (total === 0) {
    return (
      <span className="font-mono text-[11px] text-muted-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">{t("noChain")}</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-[3px]" role="img" aria-label={t("chainProgress", { approved, total })}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 w-5 rounded-[2px] ${i < approved ? "bg-status-approved" : "bg-status-pending"}`}
        />
      ))}
      <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
        {approved}/{total}
      </span>
    </span>
  );
}
