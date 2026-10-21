"use client";

import { Check, CircleAlert, Clock, Info, Lock, Sparkles, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { GuardedButton } from "@/components/common/guarded-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/request";
import { type Issue, issueReason, useReopenIssue, useResolveIssue } from "@/lib/api/issues";
import { formatPercent, formatWhen } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SEVERITY_TONE, useIssueView } from "./use-issue-view";

const NOTE_MAX = 500;

interface ActionLink {
  key: string;
  label: string;
  href: string;
  primary?: boolean;
  /** Needs the right to change data (OWNER, ADMIN, EDITOR); the others see it disabled. */
  write?: boolean;
}

const ICON = { ERROR: TriangleAlert, WARNING: Clock, INFO: Info } as const;

/**
 * One alert (design v0.7 79–81, 83): severity, fixed code, rule, title, source line, the comparison boxes, then either
 * the actions with "Çözüldü" (WARNING and INFO; a blocking alert only says it blocks) or, once resolved, who decided
 * and when. A blocking alert closes itself when its data is corrected.
 */
export function IssueCard({
  issue,
  batchId,
  productHref,
  canResolve,
  canWrite,
}: {
  issue: Issue;
  batchId: string;
  productHref: string;
  canResolve: boolean;
  canWrite: boolean;
}) {
  const t = useTranslations("issues");
  const locale = useLocale();
  const view = useIssueView()(issue);
  const resolve = useResolveIssue();
  const reopen = useReopenIssue();
  const [forming, setForming] = useState(false);
  const [note, setNote] = useState("");
  const tone = SEVERITY_TONE[issue.severity];
  const Icon = issue.resolved ? Check : issue.source === "AI" ? Sparkles : ICON[issue.severity];
  const blocking = issue.severity === "ERROR";
  const error = resolve.error ?? reopen.error;

  const base = `/batches/${batchId}`;
  const step = issue.stepId ? `${base}?step=${issue.stepId}` : undefined;
  const request = issue.stepId ? `${base}?step=${issue.stepId}&open=request` : undefined;
  const actions = ((): ActionLink[] => {
    const goToStep: ActionLink | undefined = step ? { key: "go", label: t("actions.goToStep"), href: step } : undefined;
    const list: (ActionLink | undefined)[] = (() => {
      switch (issue.code) {
        case "LIF-01":
          return [goToStep, request ? { key: "fix", label: t("actions.requestFix"), href: request, primary: true, write: true } : undefined];
        case "LIF-02":
          return issue.stepId
            ? [goToStep, request ? { key: "fix", label: t("actions.requestFix"), href: request, primary: true, write: true } : undefined]
            : [{ key: "product", label: t("actions.openProduct"), href: productHref }];
        case "SER-01":
          return [goToStep, request ? { key: "new", label: t("actions.requestNew"), href: request, primary: true, write: true } : undefined];
        case "SER-02":
          return [request ? { key: "new", label: t("actions.requestNew"), href: request, primary: true, write: true } : undefined];
        case "SER-03":
          return [goToStep, step ? { key: "doc", label: t("actions.openDocument"), href: step } : undefined];
        case "SER-04":
          return [goToStep, request ? { key: "cert", label: t("actions.requestCert"), href: request, primary: true, write: true } : undefined];
        case "EKS-01":
          return [{ key: "product", label: t("actions.openProduct"), href: productHref }];
        case "BEL-01":
          return [step ? { key: "doc", label: t("actions.openDocument"), href: step, primary: true } : undefined];
        case "AI-01":
          return [step ? { key: "doc", label: t("actions.openDocument"), href: step } : undefined];
        case "AI-02":
          return [goToStep];
        default:
          return [goToStep];
      }
    })();
    return list.filter((a): a is ActionLink => !!a);
  })();

  const submit = () =>
    resolve.mutate(
      { id: issue.id, note: note.trim() || undefined },
      {
        onSuccess: () => {
          setForming(false);
          setNote("");
        },
      },
    );

  const resolvedLine = (() => {
    if (!issue.resolved) return "";
    const date = issue.resolvedAt
      ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(issue.resolvedAt))
      : "";
    if (issue.autoResolved) return t("autoResolved", { date });
    const name = issue.resolvedByName ?? "";
    return issue.note ? t("resolvedByNote", { name, date, note: issue.note }) : t("resolvedBy", { name, date });
  })();

  return (
    <article
      aria-label={`${view.code} ${view.title}`}
      className={cn("grid grid-cols-[36px_minmax(0,1fr)] gap-3.5 rounded-[10px] border p-4", issue.resolved ? "bg-transparent" : "bg-card")}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-lg",
          issue.resolved ? "bg-status-pending-muted text-status-pending-foreground" : tone.icon,
        )}
      >
        <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full py-0.5 pr-2 pl-[7px] text-[11px] font-medium",
              issue.resolved ? "bg-status-pending-muted text-status-pending-foreground" : tone.badge,
            )}
          >
            <span className={cn("size-[5px] rounded-full", issue.resolved ? "bg-status-pending" : tone.dot)} aria-hidden />
            {t(`severity.${issue.severity}`)}
          </span>
          <span className="rounded-[4px] border border-input px-1.5 py-px font-mono text-[11px] font-medium">{view.code}</span>
          {view.ai ? (
            <>
              <span className="inline-flex items-center gap-[5px] rounded-full bg-brand-muted py-0.5 pr-2 pl-1.5 text-[11px] font-medium text-brand-text">
                <Sparkles className="size-[11px]" strokeWidth={2} aria-hidden />
                {t("ai")}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {t("confidence", { value: formatPercent(Math.round(view.ai.confidence * 100), locale) })}
              </span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{t("rule", { name: view.rule })}</span>
          )}
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">{formatWhen(issue.createdAt, new Date(), locale)}</span>
        </div>
        <strong className={cn("text-[15px] leading-[1.4] font-medium tracking-[-0.01em] text-pretty", issue.resolved && "text-muted-foreground")}>
          {view.title}
        </strong>
        {view.meta && <span className="text-xs text-muted-foreground">{view.meta}</span>}
        {view.compare.length > 0 && (
          <div className="mt-0.5 flex flex-wrap gap-2">
            {view.compare.map((box) => (
              <span
                key={box.label}
                className={cn(
                  "flex min-w-[220px] flex-col gap-[3px] rounded-md border bg-muted px-3 py-2",
                  !issue.resolved && box.parts.some((p) => p.bad) ? tone.border : "border-transparent",
                )}
              >
                <span className="text-[11px] text-muted-foreground">{box.label}</span>
                <span className="flex flex-wrap gap-x-1.5 gap-y-1 text-[13px] font-medium">
                  {box.parts.map((part, i) => (
                    <span
                      key={`${part.text}-${i}`}
                      className={issue.resolved ? "text-muted-foreground" : part.bad ? "text-status-rejected-foreground" : undefined}
                    >
                      {part.text}
                      {i < box.parts.length - 1 && <span className="ml-1.5 text-muted-foreground">·</span>}
                    </span>
                  ))}
                </span>
              </span>
            ))}
          </div>
        )}

        {view.ai && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3" strokeWidth={1.75} aria-hidden />
            {t("aiNote")}
          </span>
        )}
        {error && <ErrorLine error={error} />}

        {issue.resolved ? (
          <div className="mt-1 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
            <Check className="size-3.5 flex-none text-status-approved" strokeWidth={2} aria-hidden />
            <span className="flex-1 leading-normal text-foreground">{resolvedLine}</span>
            {!issue.autoResolved && canResolve && (
              <Button variant="secondary" size="sm" className="h-7 flex-none px-2.5 text-xs" disabled={reopen.isPending} onClick={() => reopen.mutate(issue.id)}>
                {t("reopen")}
              </Button>
            )}
          </div>
        ) : forming ? (
          <div className="mt-1 flex flex-col gap-2 border-t pt-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              <span>
                {t("note")} <span className="font-normal text-muted-foreground">{t("noteOptional")}</span>
              </span>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                rows={3}
                maxLength={NOTE_MAX}
                placeholder={t("notePlaceholder")}
                className="resize-none text-[13px] font-normal"
                autoFocus
              />
            </label>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">{t("noteCount", { count: note.length })}</span>
              <span className="ml-auto flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => {
                    setForming(false);
                    setNote("");
                  }}
                >
                  {t("cancel")}
                </Button>
                <Button size="sm" className="h-8 px-3 text-xs" disabled={resolve.isPending} onClick={submit}>
                  <Check className="size-[13px]" strokeWidth={2} aria-hidden />
                  {t("confirm")}
                </Button>
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap items-center gap-2 border-t pt-3">
            {blocking ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-status-rejected-foreground">
                <Lock className="size-[13px]" strokeWidth={1.9} aria-hidden />
                {t("blocks")}
              </span>
            ) : (
              <GuardedButton
                allowed={canResolve}
                variant="secondary"
                size="sm"
                tooltipAlign="start"
                tooltipSide="top"
                className="h-8 px-3 text-xs shadow-none"
                onClick={() => {
                  resolve.reset();
                  setForming(true);
                }}
              >
                <Check className="size-[13px]" strokeWidth={2} aria-hidden />
                {t("resolve")}
              </GuardedButton>
            )}
            <span className="ml-auto flex flex-wrap gap-2">
              {actions.map((action) =>
                action.write && !canWrite ? (
                  <GuardedButton key={action.key} allowed={false} variant="secondary" size="sm" tooltipSide="top" className="h-8 px-3 text-xs">
                    {action.label}
                  </GuardedButton>
                ) : (
                  <Link
                    key={action.key}
                    href={action.href}
                    className={cn(buttonVariants({ variant: action.primary ? "default" : "secondary", size: "sm" }), "h-8 px-3 text-xs")}
                  >
                    {action.label}
                  </Link>
                ),
              )}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

/** Design v0.7 83: a refused decision, in the card. The list is refreshed behind it. */
function ErrorLine({ error }: { error: unknown }) {
  const t = useTranslations("issues");
  const reason = issueReason(error);
  const status = error instanceof ApiError ? error.status : undefined;
  const kind = reason === "ISSUE_BLOCKING" ? "blocking" : reason === "ALREADY_RESOLVED" ? "already" : "failed";
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md bg-status-rejected-muted px-3 py-2.5 text-[13px] leading-[1.45] text-status-rejected-foreground">
      <CircleAlert className="mt-0.5 size-[15px] flex-none" strokeWidth={1.9} aria-hidden />
      <span className="flex flex-1 flex-col gap-0.5">
        <strong className="font-semibold">{t(`${kind}Title`)}</strong>
        <span>{t(`${kind}Body`)}</span>
        {status && <span className="font-mono text-[11px]">{reason ? `HTTP ${status} · ${reason}` : `HTTP ${status}`}</span>}
      </span>
    </div>
  );
}
