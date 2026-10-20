"use client";

import type { Fiber } from "@tekpas/shared";
import { useLocale, useTranslations } from "next-intl";
import type { Issue, IssueSeverity } from "@/lib/api/issues";
import { fiberText, formatPercent } from "@/lib/format";

/** One box of a comparison (design v0.7 79a): what each side says, the differing values in red. */
export interface CompareBox {
  label: string;
  parts: { text: string; bad: boolean }[];
}

export interface IssueView {
  /** "LIF-01" */
  code: string;
  rule: string;
  title: string;
  meta: string;
  compare: CompareBox[];
}

/** Tailwind needs the whole class name: the three tones of the design's severities (--status-*). */
export const SEVERITY_TONE: Record<
  IssueSeverity,
  { badge: string; dot: string; icon: string; text: string; border: string }
> = {
  ERROR: {
    badge: "bg-status-rejected-muted text-status-rejected-foreground",
    dot: "bg-status-rejected",
    icon: "bg-status-rejected-muted text-status-rejected-foreground",
    text: "text-status-rejected-foreground",
    border: "border-status-rejected",
  },
  WARNING: {
    badge: "bg-status-expiring-muted text-status-expiring-foreground",
    dot: "bg-status-expiring",
    icon: "bg-status-expiring-muted text-status-expiring-foreground",
    text: "text-status-expiring-foreground",
    border: "border-status-expiring",
  },
  INFO: {
    badge: "bg-status-pending-muted text-status-pending-foreground",
    dot: "bg-status-pending",
    icon: "bg-status-pending-muted text-status-pending-foreground",
    text: "text-status-pending-foreground",
    border: "border-status-pending",
  },
};

/** Whole days from today (Istanbul) to a date; negative once it is past. */
export function daysUntil(iso: string, now = new Date()): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(now);
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/**
 * The words of a card, from the translation files by code and the issue's structured data (the server stores no
 * text, docs/m7-plan.md §9 decision 4). A code this client does not know shows a general line.
 */
export function useIssueView(): (issue: Issue) => IssueView {
  const t = useTranslations("issues");
  const tStep = useTranslations("enums.stepType");
  const tDoc = useTranslations("enums.docType");
  const tFiber = useTranslations("enums.fiber");
  const locale = useLocale();
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${iso.slice(0, 10)}T00:00:00Z`),
    );
  const fiberName = (f: Fiber) => tFiber(f);
  const parts = (
    list: ReadonlyArray<{ fiber: Fiber; percent: number }> | null | undefined,
    bad: (f: Fiber) => boolean,
  ): CompareBox["parts"] =>
    (list ?? []).map((share) => ({
      text: fiberText([share], locale, fiberName),
      bad: bad(share.fiber),
    }));

  return (issue) => {
    const code = issue.code;
    const p = issue.params;
    const step = issue.stepType ? tStep(issue.stepType) : "";
    const supplier = issue.supplierName ? `${issue.supplierName} · ` : "";
    const who = issue.supplierName ?? step;
    const doc = p.docType ? tDoc(p.docType) : "";
    const differing = new Set<Fiber>((p.differing ?? []) as Fiber[]);
    const base = { code };

    switch (code) {
      case "LIF-01":
        return {
          ...base,
          rule: t("codes.LIF-01.rule"),
          title: t("codes.LIF-01.title", { who }),
          meta: t("codes.LIF-01.meta", { supplier, step }),
          compare: [
            { label: t("codes.LIF-01.label"), parts: parts(p.label, (f) => differing.has(f)) },
            { label: t("codes.LIF-01.declared", { who }), parts: parts(p.declared, (f) => differing.has(f)) },
          ],
        };
      case "LIF-02": {
        const total = formatPercent(p.total ?? 0, locale);
        const onLabel = !issue.stepId;
        return {
          ...base,
          rule: t("codes.LIF-02.rule"),
          title: onLabel ? t("codes.LIF-02.titleLabel", { total }) : t("codes.LIF-02.titleStep", { who, total }),
          meta: onLabel ? t("codes.LIF-02.metaLabel") : t("codes.LIF-01.meta", { supplier, step }),
          compare: [
            {
              label: onLabel ? t("codes.LIF-02.label") : t("codes.LIF-02.declared", { who }),
              parts: parts(onLabel ? p.label : p.declared, () => false),
            },
          ],
        };
      }
      case "SER-01": {
        const ago = p.validUntil ? Math.max(0, -daysUntil(p.validUntil)) : 0;
        return {
          ...base,
          rule: t("codes.SER-01.rule"),
          title: t("codes.SER-01.title", { doc, date: p.validUntil ? date(p.validUntil) : "" }),
          meta: t("codes.SER-01.meta", { supplier, step, days: ago }),
          compare: [],
        };
      }
      case "SER-02": {
        const left = p.validUntil ? Math.max(0, daysUntil(p.validUntil)) : 0;
        return {
          ...base,
          rule: t("codes.SER-02.rule"),
          title: t("codes.SER-02.title", { doc, days: left }),
          meta: t("codes.SER-02.meta", { supplier, step, date: p.validUntil ? date(p.validUntil) : "" }),
          compare: [],
        };
      }
      case "SER-03":
        return {
          ...base,
          rule: t("codes.SER-03.rule"),
          title: t("codes.SER-03.title", { doc }),
          meta: t("codes.SER-03.meta", { step }),
          compare: [
            { label: t("codes.SER-03.holder"), parts: [{ text: p.holder ?? "", bad: true }] },
            { label: t("codes.SER-03.supplier"), parts: [{ text: p.supplier ?? "", bad: false }] },
          ],
        };
      case "SER-04":
        return {
          ...base,
          rule: t("codes.SER-04.rule"),
          title: t("codes.SER-04.title", { step }),
          meta: t("codes.SER-04.meta", { supplier, step }),
          compare: [],
        };
      case "EKS-01":
        return { ...base, rule: t("codes.EKS-01.rule"), title: t("codes.EKS-01.title"), meta: t("codes.EKS-01.meta"), compare: [] };
      case "EKS-02":
        return {
          ...base,
          rule: t("codes.EKS-02.rule"),
          title: t("codes.EKS-02.title", { missing: p.missing ?? "BOTH" }),
          meta: t("codes.EKS-02.meta"),
          compare: [],
        };
      case "BEL-01":
        return {
          ...base,
          rule: t("codes.BEL-01.rule"),
          title: t("codes.BEL-01.title", { file: p.fileName ?? "" }),
          meta: t("codes.BEL-01.meta", { supplier, step, doc }),
          compare: [],
        };
      default:
        return { code: String(code), rule: t("unknownRule"), title: t("unknownTitle"), meta: [supplier.replace(/ · $/, ""), step].filter(Boolean).join(" · "), compare: [] };
    }
  };
}
