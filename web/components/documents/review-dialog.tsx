"use client";

import { DOC_TYPES, DOCUMENT_CONFIDENCE_THRESHOLD, type DocType } from "@tekpas/shared";
import { Check, CircleAlert, Clock, FileText, Info, Lock, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { NativeSelect } from "@/components/common/native-select";
import { shortName } from "@/components/batches/step-panel";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { type DocumentResponse, isReading, useDocument, useRereadDocument, useVerifyDocument } from "@/lib/api/documents";
import { ApiError } from "@/lib/api/request";
import { useSession } from "@/lib/auth/use-session";
import { formatFileSize, formatPercent, formatWhen } from "@/lib/format";
import {
  documentState,
  type FieldError,
  type FieldKey,
  type FieldView,
  FIELD_ORDER,
  type FormValues,
  initialValues,
  isDateField,
  review as reviewOf,
  toVerifyRequest,
} from "@/lib/documents/review";
import { DocumentChip, ExpiredChip, Spinner } from "./document-chip";
import { DocumentPreview } from "./document-preview";

/** Technical reasons a document can be left to manual entry for (the banner's wording differs). */
const BANNER_BY_CODE: Record<string, "noText" | "unrecognised" | "aiUnavailable"> = {
  NO_TEXT_LAYER: "noText",
  NO_KNOWN_FIELDS: "unrecognised",
  LLM_UNAVAILABLE: "aiUnavailable",
  LLM_NO_RESULT: "aiUnavailable",
};

type Role = "OWNER" | "ADMIN" | "EDITOR" | "SUPPLIER" | "VIEWER";

/** Written out in full so Tailwind finds the classes. */
const TONE = {
  "low-confidence": "bg-status-low-confidence-muted text-status-low-confidence-foreground",
  pending: "bg-status-pending-muted text-status-pending-foreground",
  approved: "bg-status-approved-muted text-status-approved-foreground",
  rejected: "bg-status-rejected-muted text-status-rejected-foreground",
} as const;

/** The seconds a reading has been seen running (design 57a): the counter, and after 30 the note that one may leave. */
function useReadingSeconds(doc: DocumentResponse): number {
  const reading = isReading(doc);
  const since = useRef<number>(0);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!reading) return;
    // A fresh upload counts from its upload; an older one (read again, or opened later) from now.
    const uploaded = Date.parse(doc.createdAt);
    since.current = Date.now() - uploaded < 120_000 ? uploaded : Date.now();
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - since.current) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [reading, doc.createdAt]);
  return reading ? seconds : 0;
}

/**
 * Design v0.5 57: the document on the left, the six fields on the right. AI proposes, a person approves
 * (CLAUDE.md rule 5): nothing reaches the document's real fields before "Onayla", and fields below the
 * confidence threshold (and everything the LLM read) wait for "Doğru" or a correction first. Manual entry is the
 * same form with empty fields.
 */
export function ReviewDialog({
  stepId,
  stepName,
  supplierName,
  initial,
  canWrite,
  reviewer,
  onClose,
}: {
  stepId: string;
  /** "Kumaş" */
  stepName: string;
  supplierName: string;
  initial: DocumentResponse;
  canWrite: boolean;
  /** OWNER and ADMIN approve; the others see the same form read-only (57h). */
  reviewer: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("documents.review");
  const tRoles = useTranslations("roles");
  const locale = useLocale();
  const session = useSession();
  const me = session.status === "authenticated" ? session.user : undefined;
  const now = useMemo(() => new Date(), []);

  const query = useDocument(initial.id, initial);
  const doc = query.data ?? initial;
  const state = documentState(doc);
  const verify = useVerifyDocument(stepId);
  const reread = useRereadDocument(stepId);
  const seconds = useReadingSeconds(doc);

  const [manual, setManual] = useState(false);
  const [values, setValues] = useState<FormValues>(() => initialValues(doc));
  const [checks, setChecks] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [active, setActive] = useState<FieldKey | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [confirming, setConfirming] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, FieldError>>>({});

  // The reading ends or the document is confirmed: the form starts again from what is now proposed or confirmed.
  const loaded = `${doc.extractionStatus}|${doc.reviewStatus}|${doc.extractedAt ?? ""}`;
  const lastLoaded = useRef(loaded);
  useEffect(() => {
    if (lastLoaded.current === loaded) return;
    lastLoaded.current = loaded;
    setValues(initialValues(doc));
    setChecks({});
    setServerErrors({});
  }, [loaded, doc]);

  const form = state === "error" ? manual : state !== "reading";
  const editable = reviewer && form && state !== "approved";
  const r = reviewOf(doc, values, checks, now);
  const dirty = editable && r.dirty;

  const tryClose = () => (dirty ? setConfirming(true) : onClose());
  const set = (key: FieldKey, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setServerErrors((e) => ({ ...e, [key]: undefined }));
  };
  const focus = (view: FieldView) => {
    setActive(view.key);
    if (view.evidence) setPage(view.evidence.page);
  };

  const approve = () =>
    verify.mutate(
      { id: doc.id, body: toVerifyRequest(values) },
      {
        onSuccess: () => setChecks({}),
        onError: (error) => {
          const fields = error instanceof ApiError ? (error.problem?.errors ?? []) : [];
          if (fields.length > 0) {
            const next: Partial<Record<FieldKey, FieldError>> = {};
            for (const f of fields) {
              if (f.code === "DateRange") next[(f.field as FieldKey) ?? "validUntil"] = "range";
              else next[f.field as FieldKey] = "required";
            }
            setServerErrors(next);
            return;
          }
          if (error instanceof ApiError && error.problem?.reason === "DOCUMENT_VERIFIED") {
            showErrorToast({ title: t("alreadyVerified"), error });
            void query.refetch();
            return;
          }
          showErrorToast({ title: t("approveFailed"), error, keepsForm: true, onRetry: approve });
        },
      },
    );

  const bannerCode = doc.failureCode ?? undefined;
  const verifiedWhen = doc.verifiedAt ? formatWhen(doc.verifiedAt, now, locale) : "";
  const fixedCount = r.fields.filter((f) => f.fixed).length;

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && tryClose()}>
        <DialogContent
          closeLabel={t("close")}
          closeClassName="top-4 right-5"
          aria-label={t("label")}
          className="h-[820px] max-h-[calc(100vh-32px)] w-[1280px] max-w-[calc(100vw-32px)] overflow-hidden"
        >
          <div className="flex items-start gap-4 border-b py-4 pr-16 pb-3.5 pl-6">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                {t("context", { step: stepName, name: supplierName })}
              </span>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="font-mono text-[17px] font-medium tracking-[-0.01em]">{doc.originalName}</h2>
                <DocumentChip state={state} />
                {r.expired && state !== "reading" && <ExpiredChip />}
              </div>
              <span className="text-[13px] text-muted-foreground">
                {[
                  doc.mimeType === "application/pdf" ? "PDF" : doc.mimeType === "image/png" ? "PNG" : "JPG",
                  doc.pageCount ? t("pages", { count: doc.pageCount }) : undefined,
                  formatFileSize(doc.sizeBytes, locale),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                {" · "}
                {t("by", {
                  name: doc.uploadedByName ?? "—",
                  source: doc.source === "PANEL" ? t("sourcePanel") : t("sourceLink"),
                  when: formatWhen(doc.createdAt, now, locale),
                })}
              </span>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_520px]">
            <DocumentPreview doc={doc} page={page} onPage={setPage} zoom={zoom} onZoom={setZoom} />
            <div className="flex min-h-0 flex-col gap-3 overflow-auto px-6 pt-[18px] pb-6">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold">{t("fieldsTitle")}</h3>
                <span className="text-xs text-muted-foreground">
                  {t("threshold", { value: formatPercent(DOCUMENT_CONFIDENCE_THRESHOLD * 100, locale) })}
                </span>
              </div>

              <Banner
                state={state}
                form={form}
                editable={editable}
                reviewer={reviewer}
                manualFromError={state === "error" && manual}
                pending={r.pendingChecks}
                expired={r.fields.find((f) => f.key === "validUntil" && f.expiredDays !== undefined)}
                values={values}
                code={bannerCode}
                role={me ? tRoles(me.role as Role) : ""}
                approved={{ name: doc.verifiedByName ?? "—", when: verifiedWhen, fixed: fixedCount }}
              />

              {state === "reading" && <ReadingCard seconds={seconds} />}
              {state === "error" && !manual && (
                <ErrorCard
                  code={bannerCode}
                  pending={reread.isPending}
                  canWrite={canWrite}
                  reviewer={reviewer}
                  onReread={() =>
                    reread.mutate(doc.id, {
                      onError: (error) => showErrorToast({ title: t("approveFailed"), error }),
                    })
                  }
                  onManual={() => setManual(true)}
                />
              )}

              {form && (
                <div className="flex flex-col gap-3">
                  {r.fields.map((view) => (
                    <FieldCard
                      key={view.key}
                      view={view}
                      error={r.errors[view.key] === "date" || r.errors[view.key] === "range" ? r.errors[view.key] : serverErrors[view.key]}
                      editable={editable}
                      active={active === view.key}
                      approved={state === "approved"}
                      reviewerName={me ? shortName(me.fullName) : ""}
                      onFocus={() => focus(view)}
                      onChange={(value) => set(view.key, value)}
                      onCheck={() => setChecks((c) => ({ ...c, [view.key]: true }))}
                    />
                  ))}
                </div>
              )}
              {state === "reading" && <FieldSkeletons />}
            </div>
          </div>

          <div className="flex h-16 flex-none items-center gap-2 border-t pr-5 pl-6">
            <span
              className={`text-[13px] ${
                form && state !== "approved" && reviewer && r.pendingChecks > 0 ? "text-status-low-confidence-foreground" : "text-muted-foreground"
              }`}
            >
              {footerText(t, { state, form, reviewer, r, manual })}
            </span>
            {state === "approved" ? (
              <Button variant="secondary" className="ml-auto px-4" onClick={onClose}>
                {t("close")}
              </Button>
            ) : (
              <>
                <Button variant="ghost" className="ml-auto" onClick={tryClose}>
                  {t("cancel")}
                </Button>
                <Button className="px-[18px]" disabled={!editable || !r.canApprove || verify.isPending} onClick={approve}>
                  <Check className="size-3.5" strokeWidth={2.2} aria-hidden />
                  {t("approve")}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent aria-label={t("discard.title")}>
          <div className="flex gap-3.5 px-6 pt-6 pb-5">
            <span className="flex size-10 flex-none items-center justify-center rounded-full bg-status-low-confidence-muted text-status-low-confidence-foreground">
              <CircleAlert className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="flex flex-col gap-2">
              <AlertDialogTitle>{t("discard.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("discard.body", { count: Math.max(1, FIELD_ORDER.filter((k) => values[k].trim() !== initialValues(doc)[k].trim()).length) })}
              </AlertDialogDescription>
            </div>
          </div>
          <AlertDialogFooter>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t("discard.keep")}
            </Button>
            <Button variant="destructive" onClick={onClose}>
              {t("discard.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type T = ReturnType<typeof useTranslations<"documents.review">>;

/** The line in the footer (design 57): what is missing, or why nothing can be done. */
function footerText(
  t: T,
  { state, form, reviewer, r, manual }: { state: ReturnType<typeof documentState>; form: boolean; reviewer: boolean; r: ReturnType<typeof reviewOf>; manual: boolean },
): string {
  if (state === "reading") return t("footer.reading");
  if (state === "error" && !manual) return t("footer.error");
  if (state === "approved") return t("footer.approved");
  if (!reviewer || !form) return t("footer.noPerm");
  if (r.pendingChecks > 0) return t("footer.pending", { count: r.pendingChecks });
  const needed = FIELD_ORDER.filter((k) => r.errors[k] === "required" || r.errors[k] === "type");
  if (needed.length > 0) return t("footer.missing", { fields: needed.map((k) => t(`fields.${k}`)).join(", ") });
  if (Object.keys(r.errors).length > 0) return t("footer.invalid");
  return t("footer.ready");
}

function Banner({
  state,
  form,
  editable,
  reviewer,
  manualFromError,
  pending,
  expired,
  values,
  code,
  role,
  approved,
}: {
  state: ReturnType<typeof documentState>;
  form: boolean;
  editable: boolean;
  reviewer: boolean;
  manualFromError: boolean;
  pending: number;
  expired?: FieldView;
  values: FormValues;
  code?: string;
  role: string;
  approved: { name: string; when: string; fixed: number };
}) {
  const t = useTranslations("documents.review");
  const locale = useLocale();
  const technical = code ? <span className="font-mono text-xs opacity-85">{t("technical", { code })}</span> : null;

  let tone: keyof typeof TONE | undefined;
  let icon = Info;
  let title = "";
  let body: string | undefined;
  let showCode = false;
  if (state === "low" && editable && pending > 0) {
    [tone, icon, title, body] = ["low-confidence", Sparkles, t("banner.low.title", { count: pending }), t("banner.low.body")];
  } else if (form && editable && (state === "unreadable" || manualFromError)) {
    const kind = manualFromError ? "manual" : (BANNER_BY_CODE[code ?? ""] ?? "manual");
    [tone, icon, title, body, showCode] = ["pending", Pencil, t(`banner.${kind}.title`), t(`banner.${kind}.body`), true];
  } else if (!reviewer && state !== "approved" && form) {
    [tone, icon, title, body] = ["pending", Lock, t("banner.noPerm.title"), t("banner.noPerm.body", { role })];
  } else if (state === "approved") {
    [tone, icon, title, body] = [
      "approved",
      Check,
      t("banner.approved.title", { name: approved.name, when: approved.when }),
      approved.fixed > 0 ? t("banner.approved.body", { count: approved.fixed }) : t("banner.approved.bodyNone"),
    ];
  } else if (editable && expired) {
    [tone, icon, title, body] = [
      "rejected",
      Clock,
      t("banner.expired.title", { date: expiredDate(values.validUntil, locale) }),
      t("banner.expired.body"),
    ];
  }
  if (!tone) return null;
  const Icon = icon;
  return (
    <div
      role="status"
      className={`flex gap-2.5 rounded-lg px-3.5 py-3 text-[13px] leading-[1.45] ${TONE[tone]}`}
    >
      <Icon className="mt-px size-[18px] shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        {body && <span>{body}</span>}
        {showCode && technical}
      </span>
    </div>
  );
}

/** "15 Ekim 2026" from the form's "15.10.2026". */
function expiredDate(text: string, locale: string): string {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
  if (!m) return text;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])),
  );
}

function ReadingCard({ seconds }: { seconds: number }) {
  const t = useTranslations("documents.review.reading");
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2 rounded-lg border bg-card p-3.5">
      <div className="flex items-center gap-2.5 text-sm font-medium">
        <span className="flex text-brand-text">
          <Spinner />
        </span>
        {t("title")}
        <span className="ml-auto font-mono text-xs text-muted-foreground">{t("seconds", { count: seconds })}</span>
      </div>
      <span className="text-[13px] leading-normal text-muted-foreground">{t("body")}</span>
      {seconds >= 30 && (
        <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2.5 text-[13px] leading-normal">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <span>
            <span className="font-semibold">{t("leave")}</span> {t("leaveBody")}
          </span>
        </div>
      )}
    </div>
  );
}

/** The form's skeleton while the document is read: one placeholder per field. */
function FieldSkeletons() {
  const t = useTranslations("documents.review.fields");
  const widths = ["58%", "44%", "72%", "52%", "30%", "30%"];
  return (
    <>
      {FIELD_ORDER.map((key, i) => (
        <div key={key} className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-muted-foreground">{t(key)}</span>
            <Skeleton className="ml-auto h-2.5 w-9 rounded-[3px]" />
          </div>
          <Skeleton className="flex h-[38px] items-center rounded-md px-2.5">
            <span className="h-2.5 rounded-[3px] bg-muted" style={{ width: widths[i] }} />
          </Skeleton>
        </div>
      ))}
    </>
  );
}

function ErrorCard({
  code,
  pending,
  canWrite,
  reviewer,
  onReread,
  onManual,
}: {
  code?: string;
  pending: boolean;
  canWrite: boolean;
  reviewer: boolean;
  onReread: () => void;
  onManual: () => void;
}) {
  const t = useTranslations("documents.review");
  return (
    <div role="alert" className="flex flex-col items-start gap-2.5 rounded-[10px] border bg-card p-5">
      <span className="flex size-10 items-center justify-center rounded-[10px] bg-status-rejected-muted text-status-rejected-foreground">
        <CircleAlert className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <strong className="text-[15px] font-semibold">{t("error.title")}</strong>
      <span className="text-[13px] leading-[1.55] text-pretty text-muted-foreground">
        {code === "EXTRACT_TIMEOUT" ? `${t("error.timeout")} ` : ""}
        {t("error.body")}
      </span>
      {code && <span className="font-mono text-xs text-muted-foreground">{t("technical", { code })}</span>}
      <div className="mt-1 flex gap-2">
        {canWrite && (
          <Button onClick={onReread} disabled={pending}>
            <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />
            {t("error.reread")}
          </Button>
        )}
        {reviewer && (
          <Button variant="secondary" onClick={onManual}>
            {t("error.manual")}
          </Button>
        )}
      </div>
    </div>
  );
}

const SOURCE_STYLE = {
  document: { tone: "bg-muted text-foreground border-transparent", icon: FileText },
  ai: { tone: "bg-brand-muted text-brand-text border-transparent", icon: Sparkles },
  manual: { tone: "bg-transparent text-muted-foreground border-input", icon: Pencil },
} as const;

/** One field of the form (design 57b/c): label, source, confidence, the value, the evidence and the check. */
function FieldCard({
  view,
  error,
  editable,
  active,
  approved,
  reviewerName,
  onFocus,
  onChange,
  onCheck,
}: {
  view: FieldView;
  error?: FieldError;
  editable: boolean;
  active: boolean;
  approved: boolean;
  reviewerName: string;
  onFocus: () => void;
  onChange: (value: string) => void;
  onCheck: () => void;
}) {
  const t = useTranslations("documents.review");
  const tDoc = useTranslations("enums.docType");
  const locale = useLocale();
  const id = useId();
  const expired = view.expiredDays !== undefined;
  const border = expired ? "border-status-rejected" : view.needsCheck ? "border-status-low-confidence" : active ? "border-ring" : "border-border";
  const surface = view.needsCheck ? "bg-status-low-confidence-muted" : "bg-card";
  const ring = active && !view.needsCheck && !expired ? "shadow-[0_0_0_3px_var(--ring-soft)]" : "";
  const low = view.confidence !== undefined && (view.source === "ai" || view.confidence < DOCUMENT_CONFIDENCE_THRESHOLD * 100);
  const source = view.source ? SOURCE_STYLE[view.source] : undefined;
  const SourceIcon = source?.icon;
  const mono = view.key === "certNo" || isDateField(view.key);
  const text = view.key === "docType" ? (view.value && view.value !== "UNKNOWN" ? tDoc(view.value as DocType) : "") : view.value;
  const showEvidence = !!view.evidence && !view.fixed;
  const describedBy = error ? `${id}-error` : undefined;

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 ${border} ${surface} ${ring}`}
      data-field={view.key}
      onClick={onFocus}
    >
      <div className="flex min-h-5 items-center gap-2">
        <label htmlFor={`${id}-input`} className="text-[13px] font-semibold">
          {t(`fields.${view.key}`)}
        </label>
        {source && SourceIcon && (
          <span className={`inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-px text-[11px] font-medium ${source.tone}`}>
            <SourceIcon className="size-[11px]" strokeWidth={2} fill={view.source === "ai" ? "currentColor" : "none"} stroke={view.source === "ai" ? "none" : "currentColor"} aria-hidden />
            {t(`sources.${view.source!}`)}
          </span>
        )}
        {view.fixed && (
          <span className="rounded-[4px] bg-status-submitted-muted px-1.5 py-px text-[11px] font-medium text-status-submitted-foreground">
            {t("fixed")}
          </span>
        )}
        {view.confidence !== undefined && (
          <span
            className={`ml-auto inline-flex items-center gap-[5px] font-mono text-xs font-medium ${
              low ? "text-status-low-confidence-foreground" : "text-status-approved-foreground"
            }`}
          >
            <span className={`size-1.5 rounded-full ${low ? "bg-status-low-confidence" : "bg-status-approved"}`} aria-hidden />
            {formatPercent(view.confidence, locale)}
          </span>
        )}
      </div>

      {editable ? (
        view.key === "docType" ? (
          <NativeSelect
            id={`${id}-input`}
            value={view.value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="h-[38px] text-sm font-medium"
          >
            <option value="UNKNOWN">{t("placeholders.docType")}</option>
            {DOC_TYPES.filter((d) => d !== "UNKNOWN").map((d) => (
              <option key={d} value={d}>
                {tDoc(d)}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <Input
            id={`${id}-input`}
            value={view.value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            placeholder={isDateField(view.key) ? t("placeholders.date") : t(`placeholders.${view.key as "certNo" | "holderName" | "issuer"}`)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={`h-[38px] ${mono ? "font-mono text-[15px]" : "text-sm font-medium"}`}
          />
        )
      ) : (
        <span
          id={`${id}-input`}
          aria-readonly="true"
          className={`flex min-h-[38px] items-center rounded-md bg-muted px-2.5 ${mono ? "font-mono text-[15px]" : "text-sm font-medium"}`}
        >
          {text || "—"}
        </span>
      )}

      {error && (
        <span id={`${id}-error`} role="alert" className="text-xs text-status-rejected-foreground">
          {t(`fieldError.${error}`)}
        </span>
      )}
      {view.fixed && approved && view.original && (
        <span className="text-xs text-muted-foreground">
          {t.rich("original", { value: view.original, v: (chunks) => <span className="font-mono line-through">{chunks}</span> })}
        </span>
      )}
      {showEvidence && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFocus();
          }}
          className="cursor-pointer self-start p-0 text-left text-xs leading-[1.45] text-muted-foreground hover:text-foreground"
        >
          {t("evidenceLead")}
          <span className="font-mono text-foreground">{view.evidence!.snippet}</span>
          {t("evidenceTail", { page: view.evidence!.page })}
        </button>
      )}
      {expired && (
        <span className="flex items-center gap-[5px] text-xs text-status-rejected-foreground">
          <CircleAlert className="size-[13px] shrink-0" strokeWidth={1.75} aria-hidden />
          {t("expiredField", { days: view.expiredDays ?? 0 })}
        </span>
      )}
      {view.needsCheck && editable && (
        <div className="flex items-center gap-2 border-t border-status-low-confidence pt-1.5">
          <span className="text-xs text-status-low-confidence-foreground">
            {view.source === "ai" ? t("check.ai") : t("check.low", { value: formatPercent(view.confidence ?? 0, locale) })}
          </span>
          <Button
            variant="secondary"
            className="ml-auto h-7 gap-[5px] px-2.5 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              onCheck();
            }}
          >
            <Check className="size-[13px]" strokeWidth={2.2} aria-hidden />
            {t("check.confirm")}
          </Button>
        </div>
      )}
      {view.checked && !approved && (
        <span className="flex items-center gap-[5px] text-xs text-muted-foreground">
          <Check className="size-3" strokeWidth={2.2} aria-hidden />
          {t("check.checked", { name: reviewerName })}
        </span>
      )}
    </div>
  );
}
