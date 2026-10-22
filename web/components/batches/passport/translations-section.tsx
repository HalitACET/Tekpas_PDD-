"use client";

import { Check, CircleAlert, Clock, Info, Sparkles, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { Button } from "@/components/ui/button";
import { reasonOf } from "@/lib/api/passports";
import {
  type TranslationEntry,
  type TranslationField,
  type TranslationUpdate,
  usePassportTranslations,
  useSaveTranslations,
  useSuggestTranslations,
} from "@/lib/api/translations";
import { cn } from "@/lib/utils";

type BoxKind = "empty" | "ai" | "approved" | "manual" | "stale" | "unapproved";

/** What a translation box is (design v1.1 140): its look, its line under it and whether it can be approved. */
function kindOf(entry: TranslationEntry): BoxKind {
  if (!entry.text) return "empty";
  if (entry.stale) return "stale";
  if (entry.approved) return entry.aiSuggested ? "approved" : "manual";
  return entry.aiSuggested ? "ai" : "unapproved";
}

/** Waits for a person's approval: an AI suggestion, a text whose source changed, a hand-written one not approved. */
function needsApproval(entry: TranslationEntry): boolean {
  const kind = kindOf(entry);
  return kind === "ai" || kind === "stale" || kind === "unapproved";
}

const BOX = {
  empty: "border-dashed border-input bg-background",
  ai: "border-status-low-confidence bg-status-low-confidence-muted",
  approved: "border-border bg-card",
  manual: "border-input bg-card",
  stale: "border-status-expiring bg-card",
  unapproved: "border-input bg-card",
} as const;

const META = {
  empty: "text-muted-foreground",
  ai: "text-status-low-confidence-foreground",
  approved: "text-muted-foreground",
  manual: "text-muted-foreground",
  stale: "text-status-expiring-foreground",
  unapproved: "text-status-low-confidence-foreground",
} as const;

const BADGE = {
  approved: { icon: Check, tone: "bg-status-approved-muted text-status-approved-foreground", key: "badgeApproved" },
  ai: { icon: Sparkles, tone: "bg-status-low-confidence-muted text-status-low-confidence-foreground", key: "badgeAi" },
  stale: { icon: TriangleAlert, tone: "bg-status-expiring-muted text-status-expiring-foreground", key: "badgeStale" },
} as const;

/**
 * "Çeviriler" on the preview page (design v1.1 140, docs/m11-plan.md §3): every free text of the passport with its
 * source and a box per other language. An AI suggestion (demo companies only) arrives unapproved and yellow; only
 * approved translations go into the next version, a text without one is shown in its own language. OWNER and ADMIN
 * write and approve; everyone else reads.
 */
export function TranslationsSection({ batchId, canEdit }: { batchId: string; canEdit: boolean }) {
  const t = useTranslations("translations");
  const query = usePassportTranslations(batchId);
  const suggest = useSuggestTranslations(batchId);
  const save = useSaveTranslations(batchId);
  // A failure is only news to whoever asked for the suggestion on this visit.
  const [asked, setAsked] = useState(false);

  const data = query.data;
  const fields = data?.fields ?? [];
  const hasRows = !!data && fields.length > 0;
  const suggesting = !!data?.suggesting || suggest.isPending;
  const pending = fields.flatMap((f) => f.translations.filter(needsApproval).map((e) => ({ field: f.field, entry: e })));
  const limitReached =
    reasonOf(suggest.error) === "AI_LIMIT_REACHED" || (asked && !suggesting && data?.suggestionFailure === "AI_LIMIT_REACHED");
  const failed =
    !limitReached && ((suggest.isError && reasonOf(suggest.error) !== "AI_LIMIT_REACHED") || (asked && !suggesting && data?.suggestionFailure === "SUGGESTION_FAILED"));
  const languages = [...new Set(fields.flatMap((f) => f.translations.map((e) => e.language)))]
    .sort((a, b) => ["tr", "en", "de"].indexOf(a) - ["tr", "en", "de"].indexOf(b))
    .map((l) => l.toUpperCase())
    .join(", ");

  const write = (entries: TranslationUpdate[]) =>
    save.mutate(entries, { onError: (error) => showErrorToast({ title: t("saveFailed"), error, onRetry: () => write(entries) }) });
  const runSuggest = () => {
    setAsked(true);
    suggest.mutate();
  };

  return (
    <section id="translations" aria-labelledby="h-translations" className="flex max-w-[960px] scroll-mt-4 flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h2 id="h-translations" className="m-0 text-lg font-semibold tracking-[-0.015em]">
              {t("title")}
            </h2>
            {hasRows && (
              <span className="rounded bg-muted px-1.5 py-px font-mono text-[11px] font-medium text-muted-foreground">
                {t("countChip", { count: fields.length, languages })}
              </span>
            )}
          </div>
          <span className="text-sm leading-normal text-pretty">{t("lead")}</span>
          <span className="text-[13px] text-muted-foreground">{t("notTranslated")}</span>
        </div>
        {hasRows && canEdit && (
          <div className="flex flex-none gap-2">
            {data.aiAvailable && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="h-9 border-status-low-confidence bg-status-low-confidence-muted text-[13px] text-status-low-confidence-foreground shadow-none hover:bg-status-low-confidence-muted disabled:opacity-50"
                disabled={suggesting || limitReached}
                onClick={runSuggest}
              >
                {suggesting ? (
                  <span className="size-[13px] animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
                ) : (
                  <Sparkles className="size-[15px]" strokeWidth={1.75} aria-hidden />
                )}
                {suggesting ? t("suggesting") : t("suggest")}
              </Button>
            )}
            <Button
              type="button"
              disabled={pending.length === 0 || save.isPending}
              className="disabled:opacity-45"
              onClick={() => write(pending.map(({ field, entry }) => ({ field, language: entry.language, text: entry.text, approved: true })))}
            >
              <Check className="size-[15px]" strokeWidth={2} aria-hidden />
              {pending.length > 0 ? t("approveAll", { count: pending.length }) : t("allApproved")}
            </Button>
          </div>
        )}
      </div>

      {hasRows && !data.aiAvailable && (
        <div role="note" className="flex gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-[13px] leading-normal">
          <Info className="mt-0.5 size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <span className="text-pretty">{t("realNote")}</span>
        </div>
      )}
      {failed && (
        <Banner tone="rejected" icon={<CircleAlert strokeWidth={1.9} aria-hidden />} title={t("failedTitle")} body={t("failedBody")}>
          <Button type="button" variant="secondary" size="sm" className="h-[30px] flex-none px-3 text-xs shadow-none" onClick={runSuggest}>
            {t("retry")}
          </Button>
        </Banner>
      )}
      {limitReached && <Banner tone="pending" icon={<Clock strokeWidth={1.9} aria-hidden />} title={t("limitTitle")} body={t("limitBody")} />}

      {query.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3">
          {["70%", "55%", "62%"].map((w) => (
            <div key={w} className="grid h-[148px] animate-pulse grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)] gap-4 rounded-[10px] border bg-card p-4">
              <span className="flex flex-col gap-2">
                <span className="h-3 w-[110px] rounded bg-skeleton" />
                <span className="h-3 rounded bg-skeleton" style={{ width: w }} />
              </span>
              <span className="rounded-lg bg-skeleton" />
              <span className="rounded-lg bg-skeleton" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <div role="alert" className="flex flex-col items-center gap-2.5 rounded-[10px] border border-dashed border-input px-6 py-8 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-status-rejected-muted text-status-rejected-foreground">
            <CircleAlert className="size-5" strokeWidth={1.9} aria-hidden />
          </span>
          <strong className="text-[15px] font-semibold">{t("loadFailedTitle")}</strong>
          <span className="max-w-[420px] text-[13px] text-pretty text-muted-foreground">{t("loadFailedBody")}</span>
          <Button type="button" variant="secondary" className="mt-1 shadow-none" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : fields.length === 0 ? (
        <div className="flex items-center gap-2.5 rounded-[10px] border bg-card px-4 py-3.5 text-[13px] text-muted-foreground">
          <Check className="size-4 flex-none" strokeWidth={1.75} aria-hidden />
          <span>
            <strong className="font-medium text-foreground">{t("noneTitle")}</strong> {t("noneBody")}
          </span>
        </div>
      ) : (
        fields.map((field) => (
          <FieldRow
            key={field.field}
            field={field}
            suggesting={suggesting}
            aiAvailable={!!data?.aiAvailable}
            canEdit={canEdit}
            onSave={write}
          />
        ))
      )}
    </section>
  );
}

function Banner({ tone, icon, title, body, children }: { tone: "rejected" | "pending"; icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-center gap-2.5 rounded-lg border py-2.5 pr-3 pl-3.5 text-[13px] leading-[1.45] [&>svg]:size-4 [&>svg]:flex-none",
        tone === "rejected"
          ? "border-status-rejected bg-status-rejected-muted [&>svg]:text-status-rejected-foreground"
          : "border-status-pending bg-status-pending-muted [&>svg]:text-status-pending-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 text-pretty">
        <strong className="font-semibold">{title}</strong> {body}
      </span>
      {children}
    </div>
  );
}

function FieldRow({
  field,
  suggesting,
  aiAvailable,
  canEdit,
  onSave,
}: {
  field: TranslationField;
  suggesting: boolean;
  aiAvailable: boolean;
  canEdit: boolean;
  onSave: (entries: TranslationUpdate[]) => void;
}) {
  const t = useTranslations("translations");
  const locale = useLocale();
  const names = new Intl.DisplayNames([locale], { type: "language" });
  const name = (code: string) => names.of(code) ?? code;
  const label = t(`kind.${field.kind}.label`);

  return (
    <div className="grid grid-cols-1 gap-4 rounded-[10px] border bg-card p-4 md:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-2">
        <span className="flex flex-col gap-0.5">
          <strong className="text-sm font-semibold">{label}</strong>
          <span className="text-xs text-muted-foreground">{t(`kind.${field.kind}.where`)}</span>
        </span>
        <span className="self-start rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
          {t("sourceTag", { code: field.sourceLanguage.toUpperCase(), language: name(field.sourceLanguage) })}
        </span>
        <p lang={field.sourceLanguage} className="m-0 text-[13px] leading-normal text-pretty">
          {field.source}
        </p>
      </div>
      {field.translations.map((entry) => (
        <Box
          key={entry.language}
          field={field}
          label={label}
          entry={entry}
          sourceName={name(field.sourceLanguage)}
          languageName={name(entry.language)}
          loading={suggesting && (kindOf(entry) === "empty" || kindOf(entry) === "ai")}
          aiAvailable={aiAvailable}
          canEdit={canEdit}
          onSave={onSave}
        />
      ))}
    </div>
  );
}

function Box({
  field,
  label,
  entry,
  sourceName,
  languageName,
  loading,
  aiAvailable,
  canEdit,
  onSave,
}: {
  field: TranslationField;
  label: string;
  entry: TranslationEntry;
  sourceName: string;
  languageName: string;
  loading: boolean;
  aiAvailable: boolean;
  canEdit: boolean;
  onSave: (entries: TranslationUpdate[]) => void;
}) {
  const t = useTranslations("translations");
  const locale = useLocale();
  // What the person is typing; the server's text once they leave the box.
  const [draft, setDraft] = useState<string>();
  const kind = kindOf(entry);
  const badge = kind === "approved" || kind === "ai" || kind === "stale" ? BADGE[kind] : undefined;
  const date = entry.approvedAt
    ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(entry.approvedAt))
    : "";
  const meta = {
    empty: t("metaEmpty", { language: sourceName }),
    ai: t("metaAi"),
    approved: t("metaApprovedAi", { name: entry.approvedByName ?? "", date }),
    manual: t("metaManual", { name: entry.approvedByName ?? "" }),
    stale: t("metaStale"),
    unapproved: t("metaAi"),
  }[kind];

  const commit = () => {
    if (draft === undefined) return;
    const text = draft.trim();
    setDraft(undefined);
    if (text === (entry.text ?? "")) return;
    // A text written here is the person's own: it goes into the next version without another click.
    onSave([{ field: field.field, language: entry.language, text: text || null, approved: text !== "" }]);
  };

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex min-h-[22px] items-center gap-2">
        <span className="font-mono text-xs font-medium text-muted-foreground">{entry.language.toUpperCase()}</span>
        <span className="text-xs text-muted-foreground">{languageName}</span>
        {badge && (
          <span className={cn("ml-auto inline-flex items-center gap-[5px] rounded-full py-0.5 pr-2 pl-[7px] text-[11px] font-medium whitespace-nowrap", badge.tone)}>
            <badge.icon className="size-[11px]" strokeWidth={2.2} aria-hidden />
            {t(badge.key)}
          </span>
        )}
      </div>
      {loading ? (
        <div
          aria-busy="true"
          className="flex min-h-[76px] animate-pulse flex-col gap-2 rounded-lg border border-status-low-confidence bg-status-low-confidence-muted px-3 py-2.5"
        >
          <span className="h-2.5 w-[92%] rounded bg-skeleton" />
          <span className="h-2.5 w-[64%] rounded bg-skeleton" />
          <span className="text-xs text-status-low-confidence-foreground">{t("preparing")}</span>
        </div>
      ) : (
        <textarea
          lang={entry.language}
          aria-label={t("boxLabel", { field: label, language: languageName })}
          value={draft ?? entry.text ?? ""}
          readOnly={!canEdit}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder={aiAvailable || !canEdit ? t("placeholderEmpty") : t("placeholderWrite", { language: languageName })}
          rows={3}
          maxLength={2000}
          className={cn(
            "min-h-[76px] w-full resize-none rounded-lg border px-3 py-[9px] text-[13px] leading-normal text-foreground outline-none hyphens-auto placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft",
            BOX[draft !== undefined ? "manual" : kind],
          )}
        />
      )}
      <div className="flex min-h-7 items-center gap-2">
        <span className={cn("min-w-0 flex-1 text-xs leading-[1.35] text-pretty", META[kind])}>{meta}</span>
        {canEdit && !loading && needsApproval(entry) && draft === undefined && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 flex-none gap-[5px] px-2.5 text-xs shadow-none"
            onClick={() => onSave([{ field: field.field, language: entry.language, text: entry.text, approved: true }])}
          >
            <Check className="size-3" strokeWidth={2.2} aria-hidden />
            {t("approve")}
          </Button>
        )}
      </div>
    </div>
  );
}
