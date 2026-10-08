"use client";

import type { BatchStatus } from "@tekpas/shared";
import { useTranslations } from "next-intl";

/*
 * Batch stage chip (design v0.3.1 22, 23 §5): square-cornered (4 px) with an icon, so it reads differently
 * from the pill-shaped, dotted step status badge. "Yayında" is the only filled chip. Icon paths are the
 * design's (24 × 24).
 */
const STAGES: Record<BatchStatus, { chip: string; icon: string; stroke: number }> = {
  DRAFT: {
    chip: "border-dashed border-input text-muted-foreground",
    icon: "M10.1 2.18a10 10 0 0 1 3.8 0M17.6 3.7a10 10 0 0 1 2.7 2.7M21.82 10.1a10 10 0 0 1 0 3.8M20.3 17.6a10 10 0 0 1-2.7 2.7M13.9 21.82a10 10 0 0 1-3.8 0M6.4 20.3a10 10 0 0 1-2.7-2.7M2.18 13.9a10 10 0 0 1 0-3.8M3.7 6.4a10 10 0 0 1 2.7-2.7",
    stroke: 2,
  },
  COLLECTING: {
    chip: "border-transparent bg-muted text-foreground",
    icon: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M12 2v20",
    stroke: 2,
  },
  READY: {
    chip: "border-transparent bg-brand-muted text-brand-text",
    icon: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M9 12l2 2 4-4",
    stroke: 2,
  },
  PUBLISHED: { chip: "border-transparent bg-brand text-brand-foreground", icon: "M20 6 9 17l-5-5", stroke: 3 },
};

export function BatchStatusChip({ status }: { status: BatchStatus }) {
  const t = useTranslations("enums.batchStatus");
  const stage = STAGES[status];
  return (
    <span
      className={`inline-flex h-[22px] items-center gap-[5px] rounded-[4px] border pr-2 pl-1.5 text-xs font-medium whitespace-nowrap ${stage.chip}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-3 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth={stage.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={stage.icon} />
      </svg>
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
