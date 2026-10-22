"use client";

import { Check, ChevronRight, CircleAlert, Clock, Info, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { ProductSheet } from "@/components/products/product-sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { BatchResponse } from "@/lib/api/batches";
import type { ScoreCriterion, ScoreIssue, ScoreResponse } from "@/lib/api/passports";
import { useBatchIssues } from "@/lib/api/issues";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { formatPercent } from "@/lib/format";
import { useVersionFacts } from "./use-version-facts";

/** The ring: 88 px, r 36, stroke 8; the tick at 90 % marks the publishing threshold (design v0.6). */
const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const DOT = {
  submitted: "bg-status-submitted",
  pending: "bg-status-pending",
  rejected: "bg-status-rejected",
} as const;

/**
 * "Uyum skoru" (design v0.6): the ring with the score, one line on where it stands, what the published version scored
 * (when it is published), the breakdown per criterion with what is missing (each step links to its panel), and what
 * blocks publishing. The score itself is computed by the server on every read.
 */
export function ScoreCard({
  batch,
  score,
  onRetry,
}: {
  batch: BatchResponse;
  score: { data?: ScoreResponse; isPending: boolean; isError: boolean; isFetching: boolean };
  onRetry: () => void;
}) {
  const t = useTranslations("publishing");
  const locale = useLocale();
  const [open, setOpen] = useState(true);
  const [productOpen, setProductOpen] = useState(false);
  const session = useSession();
  const canEditProduct = session.status === "authenticated" && canWriteCatalog(session.user.role);
  const facts = useVersionFacts(batch.id, batch.status === "PUBLISHED");

  if (score.isPending) {
    return (
      <section aria-label={t("scoreTitle")} aria-busy="true" className="flex flex-col gap-3.5 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-4">
          <span className="size-[88px] rounded-full border-[9px] border-skeleton" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-[90px]" />
            <Skeleton className="h-2.5 w-[140px]" />
          </span>
        </div>
        {["120px", "160px", "100px"].map((w) => (
          <span key={w} className="flex flex-col gap-1.5">
            <Skeleton className="h-2.5" style={{ width: w }} />
            <Skeleton className="h-1 rounded-sm" />
          </span>
        ))}
        <span className="text-xs text-muted-foreground">{t("scoreComputing")}</span>
      </section>
    );
  }
  if (score.isError || !score.data) {
    return (
      <section aria-label={t("scoreTitle")} role="alert" className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <CircleAlert className="size-4 text-status-rejected-foreground" strokeWidth={1.75} aria-hidden />
          {t("scoreFailed")}
        </span>
        <Button variant="secondary" size="sm" onClick={onRetry} disabled={score.isFetching}>
          {t("scoreRetry")}
        </Button>
      </section>
    );
  }

  const data = score.data;
  const published = batch.status === "PUBLISHED";
  const shown = published && batch.passport ? batch.passport.score : data.score;
  const above = shown >= data.threshold;
  const status = statusLine(t, data, batch);
  // Open consistency warnings do not stop the publishing; they are one line of their own (design v0.7 86b).
  const issueWarnings = data.warnings.find((w) => w.code === "ISSUE_WARNINGS");
  const dash = `${((CIRCUMFERENCE * shown) / 100).toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`;

  return (
    <section aria-label={t("scoreTitle")} className="flex flex-col gap-3.5 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-4">
        <span className="relative flex size-[88px] flex-none items-center justify-center">
          <svg width="88" height="88" viewBox="0 0 88 88" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="44" cy="44" r={RADIUS} fill="none" stroke="var(--muted)" strokeWidth="8" />
            <circle
              cx="44"
              cy="44"
              r={RADIUS}
              fill="none"
              stroke={above ? "var(--status-approved)" : "var(--status-pending)"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={dash}
            />
            <line x1="44" y1="2" x2="44" y2="14" transform={`rotate(${(data.threshold / 100) * 360} 44 44)`} stroke="var(--foreground)" strokeWidth="2" />
          </svg>
          <span className="font-mono text-xl font-semibold tracking-[-0.04em]">{formatPercent(shown, locale)}</span>
        </span>
        <span className="flex min-w-0 flex-col gap-[3px]">
          <span className="text-sm font-semibold">{t("scoreTitle")}</span>
          <span className="text-xs text-muted-foreground">{t("scoreThreshold", { threshold: formatPercent(data.threshold, locale) })}</span>
          <span className={`mt-0.5 flex items-center gap-1.5 text-xs font-medium ${status.tone}`}>
            <status.Icon className="size-[13px] flex-none" strokeWidth={2} aria-hidden />
            {status.text}
          </span>
        </span>
      </div>

      {published && batch.passport && (
        <div className="flex justify-between gap-2 rounded-md bg-brand-muted px-2.5 py-2 text-xs text-brand-text">
          <span className="font-semibold">{t("publishedVersion", { version: batch.passport.version })}</span>
          {facts.publishedAt && <span>{t("publishedAt", { date: facts.publishedAt })}</span>}
        </div>
      )}

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex cursor-pointer items-center gap-1.5 border-t pt-3 text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft"
      >
        <ChevronRight className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} strokeWidth={1.75} aria-hidden />
        {t("breakdown")}
      </button>
      {open && (
        <div className="flex flex-col gap-3.5">
          {data.criteria.map((criterion) => (
            <Criterion key={criterion.code} batchId={batch.id} criterion={criterion} />
          ))}
        </div>
      )}

      {data.careInstructionsMissing && (
        <CareMissingNote onOpen={canEditProduct ? () => setProductOpen(true) : undefined} />
      )}
      {productOpen && <ProductSheet target={{ kind: "edit", id: batch.product.id }} onClose={() => setProductOpen(false)} />}

      {(data.blockers.length > 0 || issueWarnings) && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <span className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t("blockersTitle")}</span>
          {data.blockers.map((blocker, i) => (
            <BlockerLine key={`${blocker.code}-${blocker.stepId ?? i}-${blocker.docType ?? ""}`} batchId={batch.id} issue={blocker} score={data.score} threshold={data.threshold} />
          ))}
          {issueWarnings && <IssueWarningsLine issue={issueWarnings} />}
        </div>
      )}
    </section>
  );
}

/**
 * Design v1.0 120d: the product has no care instructions. Neither points nor a blocker, so it stays out of the
 * blockers; a tap opens the product form where they are entered.
 */
function CareMissingNote({ onOpen }: { onOpen?: () => void }) {
  const t = useTranslations("publishing");
  const content = (
    <>
      <Info className="mt-px size-[15px] flex-none text-status-submitted-foreground" strokeWidth={1.75} aria-hidden />
      <span className="flex flex-1 flex-col gap-0.5 text-left">
        <span className="font-medium">{t("careMissing")}</span>
        <span className="text-xs text-muted-foreground">{t("careMissingBody")}</span>
      </span>
      {onOpen && <ChevronRight className="mt-[3px] size-3 flex-none" strokeWidth={1.75} aria-hidden />}
    </>
  );
  const box = "flex items-start gap-2 rounded-lg bg-popover-muted px-3 py-2.5 text-[13px] leading-[1.4] text-foreground";
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${box} cursor-pointer outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft`}>
      {content}
    </button>
  ) : (
    <div className={box}>{content}</div>
  );
}

function statusLine(t: ReturnType<typeof useTranslations>, data: ScoreResponse, batch: BatchResponse) {
  const draft = !!batch.passport && !batch.passport.withdrawn && batch.status !== "PUBLISHED";
  if (batch.status === "PUBLISHED") return { text: t("scorePublished"), tone: "text-status-approved-foreground", Icon: Check };
  if (data.publishable) {
    return { text: draft ? t("scoreDraftReady", { version: batch.passport!.version + 1 }) : t("scoreReady"), tone: "text-status-approved-foreground", Icon: Check };
  }
  if (data.score >= data.threshold) {
    return { text: t("scoreBlocked", { count: data.blockers.length }), tone: "text-status-rejected-foreground", Icon: TriangleAlert };
  }
  return { text: t("scoreBelow", { points: data.threshold - data.score }), tone: "text-status-pending-foreground", Icon: Clock };
}

function Criterion({ batchId, criterion }: { batchId: string; criterion: ScoreCriterion }) {
  const t = useTranslations("publishing");
  const tStep = useTranslations("enums.stepType");
  const tFields = useTranslations("batches.chain.panel.fields");
  const full = criterion.earned === criterion.possible;
  const missing = criterion.items.filter((item) => !item.ok);
  const fieldName = (name: string) => (name === "fabricType" ? tFields("fabric") : tFields.has(name as never) ? tFields(name as never) : name);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[13px]">
        <span>{t(`criterion${criterion.code}`)}</span>
        <span className="font-mono text-xs font-medium tabular-nums">
          {criterion.earned}/{criterion.possible}
        </span>
      </div>
      <span className="flex h-1 rounded-sm bg-muted" aria-hidden>
        <span
          className={`rounded-sm ${full ? "bg-status-approved" : "bg-status-pending"}`}
          style={{ width: `${criterion.possible ? Math.round((criterion.earned / criterion.possible) * 100) : 0}%` }}
        />
      </span>
      {missing.map((item, i) => {
        const step = item.stepType ? tStep(item.stepType) : "";
        const text =
          item.code === "STEP_APPROVED"
            ? t("itemStepApproval", { step })
            : item.code === "STEP_FIELDS"
              ? t("itemStepFields", { step, fields: (item.missing ?? []).map(fieldName).join(", ") })
              : item.code === "STEP_CERTIFICATE"
                ? t("itemStepCertificate", { step })
                : item.code === "PRODUCT_FIBERS"
                  ? t("itemProductFibers")
                  : item.code === "PRODUCT_CATEGORY"
                    ? t("itemProductCategory")
                    : t("itemBatchDates");
        const dot = item.code === "STEP_APPROVED" ? DOT.submitted : DOT.pending;
        const row = (
          <>
            <span className={`size-1 flex-none rounded-full ${dot}`} aria-hidden />
            <span className="flex-1">{text}</span>
          </>
        );
        return item.stepId ? (
          <Link
            key={`${item.code}-${item.stepId}`}
            href={`/batches/${batchId}?step=${item.stepId}`}
            className="flex min-h-[22px] items-center gap-1.5 text-xs text-muted-foreground no-underline outline-none hover:text-foreground focus-visible:text-foreground"
          >
            {row}
            <ChevronRight className="size-3" strokeWidth={1.75} aria-hidden />
          </Link>
        ) : (
          <span key={`${item.code}-${i}`} className="flex min-h-[22px] items-center gap-1.5 text-xs text-muted-foreground">
            {row}
          </span>
        );
      })}
      {missing.length === 0 && <span className="text-xs text-muted-foreground">{t("nothingMissing")}</span>}
    </div>
  );
}

/** Text of one blocker or warning, in the words of the design ("Ege İplik · GOTS sertifikasının süresi 12 Eki'de doldu"). */
export function useIssueText() {
  const t = useTranslations("publishing");
  const tStep = useTranslations("enums.stepType");
  const tDoc = useTranslations("enums.docType");
  const locale = useLocale();
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
  return (issue: ScoreIssue, score?: number, threshold?: number): string => {
    const step = issue.stepType ? tStep(issue.stepType) : "";
    const doc = issue.docType ? tDoc(issue.docType) : "";
    switch (issue.code) {
      case "NO_CHAIN":
        return t("blockerNO_CHAIN");
      case "STEP_NOT_APPROVED":
        return t("blockerSTEP_NOT_APPROVED", { step });
      case "CERTIFICATE_EXPIRED":
        return t("blockerCERTIFICATE_EXPIRED", { step, doc, date: issue.validUntil ? date(issue.validUntil) : "" });
      case "ISSUES_OPEN":
        return t("blockerISSUES_OPEN", { count: issue.count ?? 0 });
      case "SCORE_BELOW_THRESHOLD":
        return t("blockerSCORE_BELOW_THRESHOLD", { score: formatPercent(score ?? 0, locale), threshold: formatPercent(threshold ?? 90, locale) });
      case "UNREVIEWED_DOCUMENTS":
        return t("warningUNREVIEWED_DOCUMENTS", { count: issue.count ?? 0 });
      case "ISSUE_WARNINGS":
        return t("warningISSUE_WARNINGS", { count: issue.count ?? 0 });
      case "CERTIFICATE_EXPIRING": {
        // Whole days from today (Istanbul) to the last valid day, not from this very moment.
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
        const days = issue.validUntil ? Math.max(0, Math.round((Date.parse(`${issue.validUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)) : 0;
        return t("warningCERTIFICATE_EXPIRING", { step, doc, days });
      }
    }
  };
}

function BlockerLine({ batchId, issue, score, threshold }: { batchId: string; issue: ScoreIssue; score: number; threshold: number }) {
  const text = useIssueText();
  const t = useTranslations("issues");
  const open = useBatchIssues(batchId, "OPEN");
  const soft = issue.code === "SCORE_BELOW_THRESHOLD";
  const Icon = soft ? Clock : TriangleAlert;
  if (issue.code === "ISSUES_OPEN") {
    // The blocking alerts are in the Uyarılar tab: the line leads there and names their codes (design v0.7 86a).
    const codes = (open.data?.issues ?? []).filter((i) => i.severity === "ERROR").map((i) => i.code).join(" · ");
    return (
      <div className="flex items-start gap-2 text-[13px] leading-[1.4]">
        <Icon className="mt-px size-[15px] flex-none text-status-rejected" strokeWidth={1.9} aria-hidden />
        <span className="flex flex-col gap-0.5">
          <Link
            href={`/batches/${batchId}?tab=alerts`}
            className="font-medium text-status-rejected-foreground underline underline-offset-[3px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft"
          >
            {text(issue, score, threshold)}
          </Link>
          <span className="font-mono text-[11px] text-muted-foreground">{t("scoreBlockerSub", { codes })}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 text-[13px] leading-[1.4]">
      <Icon className={`mt-px size-[15px] flex-none ${soft ? "text-status-low-confidence" : "text-status-rejected"}`} strokeWidth={1.9} aria-hidden />
      <span>{text(issue, score, threshold)}</span>
    </div>
  );
}

function IssueWarningsLine({ issue }: { issue: ScoreIssue }) {
  const text = useIssueText();
  const t = useTranslations("issues");
  return (
    <div className="flex items-start gap-2 text-[13px] leading-[1.4]">
      <CircleAlert className="mt-px size-[15px] flex-none text-status-expiring" strokeWidth={1.9} aria-hidden />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium text-status-expiring-foreground">{text(issue)}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{t("scoreWarningSub")}</span>
      </span>
    </div>
  );
}
