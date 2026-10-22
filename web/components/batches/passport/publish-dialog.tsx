"use client";

import { Check, CircleAlert, Clock, FileText, Globe, Lock } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { BatchResponse } from "@/lib/api/batches";
import { blockersOf, type PassportVersion, reasonOf, usePassportPreview, usePublishPassport, type ScoreResponse } from "@/lib/api/passports";
import { useBatchIssues } from "@/lib/api/issues";
import { ApiError } from "@/lib/api/request";
import { type TranslationField, usePassportTranslations } from "@/lib/api/translations";
import { formatPercent } from "@/lib/format";
import { useIssueView } from "../issues/use-issue-view";
import { QrCard } from "./qr-card";
import { useIssueText } from "./score-card";

/** The address with a shortened GTIN, as the dialog shows it (the full address is its title). */
function addressOf(batch: BatchResponse): { full: string; short: string } {
  const host = typeof window === "undefined" ? "" : window.location.host;
  const full = `${host}/01/${batch.product.gtin}/10/${batch.batchNo}`;
  return { full, short: full.replace(/\/01\/(\d{4})\d+(\d{4})\//, "/01/$1…$2/") };
}

/**
 * "Pasaportu yayınla" (design v0.6): what will be published (the version, the score, the counts, the address), the
 * warnings that do not stop it, and the note that a published passport cannot be changed. Then one of: sending, a
 * refusal (someone published first; a new blocker came up), or the success view with the QR code. The server decides:
 * the score the person saw does not count.
 */
export function PublishDialog({
  batch,
  score,
  open,
  onClose,
}: {
  batch: BatchResponse;
  score: ScoreResponse | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("publishing");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={t("close")} className="w-[560px] max-w-[calc(100vw-2rem)]">
        {open && <PublishFlow batch={batch} score={score} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function PublishFlow({ batch, score, onClose }: { batch: BatchResponse; score: ScoreResponse | undefined; onClose: () => void }) {
  const t = useTranslations("publishing");
  const locale = useLocale();
  const issueText = useIssueText();
  const tIssues = useTranslations("issues");
  const issueView = useIssueView();
  const issues = useBatchIssues(batch.id, "OPEN");
  const publish = usePublishPassport(batch.id);
  const preview = usePassportPreview(batch.id);
  const translations = usePassportTranslations(batch.id);
  const [published, setPublished] = useState<PassportVersion>();

  const previous = batch.passport && !batch.passport.withdrawn ? batch.passport.version : undefined;
  const version = (batch.passport?.version ?? 0) + 1;
  const address = addressOf(batch);

  if (published) {
    return (
      <>
        <div className="flex flex-col gap-2.5 px-6 pt-6">
          <span className="flex size-10 items-center justify-center rounded-full bg-brand-muted text-brand-text">
            <Check className="size-5" strokeWidth={2} aria-hidden />
          </span>
          <DialogTitle className="font-serif text-[28px] leading-[normal] font-normal tracking-[-0.02em]">
            {t("successTitle", { version: published.version })}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-normal">
            {t("successBody", { version: published.version })}
            {previous ? t("successSuperseded", { previous }) : ""}
          </DialogDescription>
        </div>
        <div className="pt-4">
          <QrCard passport={published} compact />
        </div>
        <div className="flex justify-end gap-2 px-6 pt-4 pb-5">
          <DialogClose render={<Button type="button" variant="secondary" />}>{t("publishClose")}</DialogClose>
          <a
            href={published.digitalLink.replace(/^https?:\/\/[^/]+/, "")}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-[3px] focus-visible:ring-ring-soft"
          >
            {t("openPassport")}
          </a>
        </div>
      </>
    );
  }

  const error = publish.error;
  const blocked = reasonOf(error) === "PUBLISH_BLOCKED";
  const conflict = reasonOf(error) === "ALREADY_PUBLISHED";
  const failed = publish.isError && !blocked && !conflict;
  const refused = blocked || conflict;
  const certificates = preview.data?.certificates.length;
  const suppliers = preview.data ? new Set(preview.data.supplyChain.filter((s) => s.actor).map((s) => s.actor!.name)).size : undefined;
  const openIssues = issues.data?.issues ?? [];
  const blockingCodes = openIssues.filter((i) => i.severity === "ERROR").map((i) => i.code);
  const issueWarnings = openIssues.filter((i) => i.severity === "WARNING");
  // The open warnings are listed with their codes (design v0.7 88b); the score's own lines about the same thing give way.
  const warnings = (score?.warnings ?? []).filter(
    (w) => !issues.data || (w.code !== "CERTIFICATE_EXPIRING" && w.code !== "ISSUE_WARNINGS"),
  );
  const blockedByIssues = blocked && blockersOf(error).some((b) => b.code === "ISSUES_OPEN");
  const run = () => publish.mutate(undefined, { onSuccess: setPublished });

  return (
    <>
      <div className="flex flex-col gap-1 px-6 pt-5 pr-16 pb-1">
        <DialogTitle>{t("publishTitle")}</DialogTitle>
        <DialogDescription>
          {batch.batchNo} · {batch.product.name}
        </DialogDescription>
      </div>
      <div className="flex flex-col gap-3.5 px-6 py-4">
        <div className="flex flex-col gap-3 rounded-[10px] border bg-card px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <strong className="font-serif text-[22px] font-normal tracking-[-0.015em]">{t("publishWillBe", { version })}</strong>
            {score && <span className="font-mono text-sm font-semibold text-status-approved-foreground">{formatPercent(score.score, locale)}</span>}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
            <Count value={batch.chain.totalSteps} text={t("publishSteps", { count: batch.chain.totalSteps })} />
            {certificates != null && <Count value={certificates} text={t("publishCertificates", { count: certificates })} />}
            {suppliers != null && <Count value={suppliers} text={t("publishSuppliers", { count: suppliers })} />}
            {previous && <span className="text-muted-foreground">{t("publishSupersedes", { version: previous })}</span>}
          </div>
          <div className="flex items-center gap-2 border-t pt-2.5 font-mono text-xs text-muted-foreground">
            <Globe className="size-[13px] flex-none" strokeWidth={1.75} aria-hidden />
            <span title={address.full} className="break-all">
              {address.short}
            </span>
          </div>
        </div>

        {conflict && (
          <Refusal title={t("publishConflictTitle")} code="HTTP 409 · ALREADY_PUBLISHED">
            {t("publishConflictBody")}
          </Refusal>
        )}
        {blocked && (
          <Refusal title={t("publishBlockedTitle")} code="HTTP 409 · PUBLISH_BLOCKED">
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {blockersOf(error).map((b, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="mt-2 size-1 flex-none rounded-full bg-current" aria-hidden />
                  {b.code === "ISSUES_OPEN"
                    ? tIssues("publishBlocked", { count: b.count ?? 0, codes: blockingCodes.join(", ") })
                    : issueText(b, score?.score, score?.threshold)}
                </li>
              ))}
            </ul>
          </Refusal>
        )}
        {failed && (
          <Refusal title={t("publishFailedTitle")} code={error instanceof ApiError ? `HTTP ${error.status}` : undefined}>
            {t("publishFailedBody")}
          </Refusal>
        )}

        {!blocked && issueWarnings.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{tIssues("publishWarnings")}</span>
            {issueWarnings.slice(0, 3).map((w) => {
              const view = issueView(w);
              return (
                <div key={w.id} className="flex gap-2 text-[13px]">
                  <Clock className="mt-px size-[15px] flex-none text-status-expiring" strokeWidth={1.9} aria-hidden />
                  <span>
                    <span className="mr-1.5 font-mono text-xs">{view.code}</span>
                    {view.title}
                  </span>
                </div>
              );
            })}
            {issueWarnings.length > 3 && (
              <span className="pl-[23px] text-xs text-muted-foreground">{tIssues("publishMore", { count: issueWarnings.length - 3 })}</span>
            )}
          </div>
        )}
        {!blocked && warnings.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{t("publishWarnings")}</span>
            {warnings.map((w, i) => (
              <div key={i} className="flex gap-2 text-[13px]">
                {w.code === "UNREVIEWED_DOCUMENTS" ? (
                  <FileText className="mt-px size-[15px] flex-none text-status-low-confidence" strokeWidth={1.9} aria-hidden />
                ) : (
                  <Clock className="mt-px size-[15px] flex-none text-status-expiring" strokeWidth={1.9} aria-hidden />
                )}
                {issueText(w)}
              </div>
            ))}
          </div>
        )}

        {translations.data && (
          <TranslationSummary batchId={batch.id} fields={translations.data.fields} onClose={onClose} />
        )}

        <div role="note" className="flex gap-3 rounded-lg border border-status-expiring bg-status-expiring-muted px-4 py-3.5 text-[13px] leading-normal">
          <Lock className="mt-px size-[18px] flex-none text-status-expiring-foreground" strokeWidth={2} aria-hidden />
          <span className="flex flex-col gap-[3px]">
            <strong className="text-sm font-semibold text-status-expiring-foreground">{t("publishLockTitle")}</strong>
            <span>{t("publishLockBody", { a: `v${version + 1}`, b: `v${version + 2}` })}</span>
          </span>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-6 pt-3.5 pb-5">
        {refused ? (
          <>
            <DialogClose render={<Button type="button" variant="secondary" />}>{t("publishClose")}</DialogClose>
            {blockedByIssues && (
              <Link
                href={`/batches/${batch.id}?tab=alerts`}
                onClick={onClose}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground outline-none hover:bg-primary-hover focus-visible:ring-[3px] focus-visible:ring-ring-soft"
              >
                {tIssues("publishGoTo")}
              </Link>
            )}
            {!blockedByIssues && (
              <Button type="button" onClick={conflict ? () => window.location.reload() : onClose}>
                {conflict ? t("publishReload") : t("publishBackToScore")}
              </Button>
            )}
          </>
        ) : (
          <>
            <Button type="button" variant="secondary" disabled={publish.isPending} onClick={onClose}>
              {t("publishCancel")}
            </Button>
            <Button type="button" variant="brand" className="min-w-[132px]" disabled={publish.isPending} onClick={run}>
              {publish.isPending && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
              {publish.isPending ? t("publishSending") : failed ? t("scoreRetry") : t("publishConfirm")}
            </Button>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Design v1.1 140k/l: how many free texts will be published translated, as a link to the translations. Never a
 * blocker; nothing is said when every text is translated or there is none.
 */
function TranslationSummary({ batchId, fields, onClose }: { batchId: string; fields: TranslationField[]; onClose: () => void }) {
  const t = useTranslations("translations");
  const translated = fields.filter((f) => f.translations.every((e) => e.approved)).length;
  const remaining = fields.length - translated;
  const unapproved = fields.flatMap((f) => f.translations).filter((e) => e.text && !e.approved).length;
  if (remaining === 0) return null;
  return (
    <Link
      href={`/batches/${batchId}/preview#translations`}
      onClick={onClose}
      className="flex items-start gap-2 rounded-lg bg-popover-muted px-3 py-2.5 text-[13px] leading-[1.4] text-foreground no-underline outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
    >
      <Globe className="mt-px size-[15px] flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="font-medium">
          {unapproved > 0 ? t("summaryAi", { translated, count: unapproved }) : t("summary", { translated, remaining })}
        </span>
        <span className="text-xs text-muted-foreground">{unapproved > 0 ? t("summaryAiSub") : t("summarySub")}</span>
      </span>
      <span className="text-xs font-medium whitespace-nowrap text-brand-text">{t("goTo")}</span>
    </Link>
  );
}

function Count({ value, text }: { value: number; text: string }) {
  // "5 adım": the number is bold, the rest is the plural word.
  const rest = text.replace(String(value), "").trim();
  return (
    <span>
      <strong className="font-semibold">{value}</strong> {rest}
    </span>
  );
}

function Refusal({ title, code, children }: { title: string; code?: string; children: React.ReactNode }) {
  return (
    <div role="alert" className="flex gap-2.5 rounded-lg bg-status-rejected-muted px-3.5 py-3 text-[13px] leading-[1.45] text-status-rejected-foreground">
      <CircleAlert className="mt-px size-[17px] flex-none" strokeWidth={1.75} aria-hidden />
      <span className="flex flex-col gap-1">
        <strong className="font-semibold">{title}</strong>
        <span>{children}</span>
        {code && <span className="font-mono text-[11px] opacity-80">{code}</span>}
      </span>
    </div>
  );
}
