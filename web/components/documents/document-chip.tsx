"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { DocumentState } from "@/lib/documents/review";

/** The tone of each state's chip (design v0.5 56a): reading and unreadable grey, awaiting blue, low yellow. */
const TONES: Record<DocumentState, { tone: string; dot: string }> = {
  reading: { tone: "bg-status-pending-muted text-status-pending-foreground", dot: "bg-status-pending" },
  full: { tone: "bg-status-submitted-muted text-status-submitted-foreground", dot: "bg-status-submitted" },
  low: { tone: "bg-status-low-confidence-muted text-status-low-confidence-foreground", dot: "bg-status-low-confidence" },
  unreadable: { tone: "bg-status-pending-muted text-status-pending-foreground", dot: "bg-status-pending" },
  error: { tone: "bg-status-rejected-muted text-status-rejected-foreground", dot: "bg-status-rejected" },
  approved: { tone: "bg-status-approved-muted text-status-approved-foreground", dot: "bg-status-approved" },
};

export function Spinner({ className = "size-3" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-[1.5px] border-current border-r-transparent ${className}`}
    />
  );
}

/** sm: on a card in the panel (11 px); default: in the review dialog's header (12 px). */
export function DocumentChip({ state, size = "default" }: { state: DocumentState; size?: "default" | "sm" }) {
  const t = useTranslations("documents.chip");
  const { tone, dot } = TONES[state];
  const box = size === "sm" ? "py-0.5 pr-2 pl-[7px] text-[11px]" : "py-[3px] pr-[9px] pl-2 text-xs";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ${box} ${tone}`}>
      {state === "reading" ? <Spinner /> : <span className={`${size === "sm" ? "size-[5px]" : "size-1.5"} rounded-full ${dot}`} aria-hidden />}
      {t(state)}
    </span>
  );
}

/** "Süresi dolmuş" beside the state chip (design 57g). */
export function ExpiredChip() {
  const t = useTranslations("documents.chip");
  return (
    <span className="inline-flex items-center gap-[5px] rounded-full bg-status-rejected-muted py-[3px] pr-[9px] pl-2 text-xs font-medium text-status-rejected-foreground">
      <Clock className="size-3" strokeWidth={2} aria-hidden />
      {t("expired")}
    </span>
  );
}
