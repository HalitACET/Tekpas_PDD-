"use client";

import type { StepStatus } from "@tekpas/shared";
import { useTranslations } from "next-intl";

/**
 * Step status badge (design v0.3 14, v0.3.1 23 §5): pill-shaped with a dot, it belongs to a step or a
 * document. Batch stages use the square BatchStatusChip instead.
 */
const TONES: Record<StepStatus, { badge: string; dot: string }> = {
  PENDING: { badge: "bg-status-pending-muted text-status-pending-foreground", dot: "bg-status-pending" },
  SUBMITTED: { badge: "bg-status-submitted-muted text-status-submitted-foreground", dot: "bg-status-submitted" },
  APPROVED: { badge: "bg-status-approved-muted text-status-approved-foreground", dot: "bg-status-approved" },
  REJECTED: { badge: "bg-status-rejected-muted text-status-rejected-foreground", dot: "bg-status-rejected" },
};

/** sm: on a chain node (09), 11 px. */
export function StepStatusBadge({ status, size = "default" }: { status: StepStatus; size?: "default" | "sm" }) {
  const t = useTranslations("enums.stepStatus");
  const tone = TONES[status];
  const box = size === "sm" ? "py-0.5 pr-2 pl-[7px] text-[11px]" : "py-[3px] pr-[9px] pl-2 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${box} ${tone.badge}`}>
      <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
      {t(status)}
    </span>
  );
}
