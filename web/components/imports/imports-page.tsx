"use client";

import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleAlert, Download, Info, Lock, RefreshCw, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type DragEvent, type ReactNode, useRef, useState } from "react";
import { GuardedButton } from "@/components/common/guarded-button";
import { showErrorToast } from "@/components/common/error-toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { downloadTemplate, type ImportResponse, isRunning, useImport, useImports, useStartImport } from "@/lib/api/imports";
import { ApiError } from "@/lib/api/request";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorTable } from "./error-table";

const MAX_BYTES = 1024 * 1024;
const FILE_ERRORS = ["FileType", "FileSize", "FileMacro", "FileUnsafe"] as const;
type FileError = (typeof FILE_ERRORS)[number] | "other";

/** "22 Eki 2026, 14:32" (design v1.1 151–156). */
export function useImportDate() {
  const locale = useLocale();
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  return (iso: string) => `${day.format(new Date(iso))}, ${time.format(new Date(iso))}`;
}

/** What the server said about a refused upload (400 with a field error on "file"), or what the browser can tell first. */
function fileErrorOf(error: unknown): FileError {
  if (error instanceof ApiError && error.status === 400) {
    const code = error.problem?.errors?.find((e) => e.field === "file")?.code;
    if (FILE_ERRORS.includes(code as never)) return code as FileError;
  }
  return "other";
}

function precheck(file: File): FileError | undefined {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsm")) return "FileMacro";
  if (!name.endsWith(".xlsx")) return "FileType";
  if (file.size > MAX_BYTES) return "FileSize";
  return undefined;
}

/**
 * "Excel'den içe aktar" (design v1.1 150–156, docs/m11-plan.md §4): the template in the panel's language, a drop zone,
 * then the import as it runs and its result (created, rows with errors and how to fix them, or why the whole file was
 * refused), and the latest imports. `?id=` opens one import's result. OWNER, ADMIN and EDITOR import; a viewer sees
 * the history only.
 */
export function ImportsPage() {
  const t = useTranslations("imports");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useSession();
  const canImport = session.status === "authenticated" && canWriteCatalog(session.user.role);
  const date = useImportDate();

  const history = useImports();
  const selectedId = searchParams.get("id") ?? undefined;
  const selected = useImport(selectedId);
  const start = useStartImport();
  const [fileError, setFileError] = useState<{ kind: FileError; name: string; size: number }>();

  const open = (id: string | undefined) => router.replace(id ? `${pathname}?id=${id}` : pathname, { scroll: false });
  const upload = (file: File) => {
    const early = precheck(file);
    if (early) {
      setFileError({ kind: early, name: file.name, size: file.size });
      return;
    }
    setFileError(undefined);
    start.mutate(file, {
      onSuccess: (job) => open(job.id),
      onError: (error) => setFileError({ kind: fileErrorOf(error), name: file.name, size: file.size }),
    });
  };
  const restart = () => {
    setFileError(undefined);
    open(undefined);
  };

  const rows = history.data ?? [];
  const job = selectedId ? selected.data : undefined;
  // An older import opened from the list has its own page; the latest one is shown above the list.
  const past = !!job && rows.length > 0 && rows[0].id !== job.id;
  const showUpload = !selectedId;

  return (
    <TooltipProvider>
      <div className="flex max-w-[1000px] flex-col gap-6">
        {past && (
          <button
            type="button"
            onClick={restart}
            className="-mb-3 flex cursor-pointer items-center gap-1.5 self-start text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:underline"
          >
            <ArrowLeft className="size-[15px]" strokeWidth={1.75} aria-hidden />
            {t("backToList")}
          </button>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.015em]">{past ? job.fileName : t("title")}</h1>
            <p className="text-[13px] text-muted-foreground">{past ? t("pastSub", { date: date(job.createdAt) }) : t("sub")}</p>
          </div>
          {!showUpload && job && !isRunning(job) && (
            <GuardedButton allowed={canImport} variant="secondary" className="ml-auto" onClick={restart}>
              <Upload strokeWidth={1.75} aria-hidden />
              {t("newImport")}
            </GuardedButton>
          )}
        </div>

        {showUpload && (
          <UploadCard
            compact={rows.length > 0}
            canImport={canImport}
            sending={start.isPending}
            fileError={fileError}
            onFile={upload}
          />
        )}

        {selectedId &&
          (selected.isPending ? (
            <Skeleton aria-busy="true" className="h-[120px] rounded-xl" />
          ) : selected.isError || !job ? (
            <div role="alert" className="flex items-center gap-3 rounded-xl border bg-card px-5 py-4 text-sm">
              <CircleAlert className="size-5 flex-none text-status-rejected-foreground" strokeWidth={1.75} aria-hidden />
              <span className="flex-1">{t("loadFailed")}</span>
              <Button variant="secondary" onClick={() => void selected.refetch()}>
                {t("retry")}
              </Button>
            </div>
          ) : (
            <Result job={job} canImport={canImport} onRestart={restart} />
          ))}

        {!past && <History rows={rows} query={history} selectedId={selectedId} onOpen={open} />}
      </div>
    </TooltipProvider>
  );
}

function UploadCard({
  compact,
  canImport,
  sending,
  fileError,
  onFile,
}: {
  compact: boolean;
  canImport: boolean;
  sending: boolean;
  fileError?: { kind: FileError; name: string; size: number };
  onFile: (file: File) => void;
}) {
  const t = useTranslations("imports");
  const locale = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const languageName = new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;

  const download = () =>
    downloadTemplate(locale).catch((error: unknown) => showErrorToast({ title: t("downloadFailed"), error, onRetry: download }));
  const pick = () => {
    if (canImport && !sending) input.current?.click();
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (canImport && file) onFile(file);
  };
  const downloadButton = (primary: boolean) => (
    <GuardedButton allowed={canImport} variant={primary ? "default" : "secondary"} tooltipAlign={primary ? "start" : "end"} onClick={download}>
      {canImport ? <Download strokeWidth={1.75} aria-hidden /> : <Lock strokeWidth={1.75} aria-hidden />}
      {t("download")}
    </GuardedButton>
  );

  return (
    <div className="flex flex-col rounded-xl border bg-card">
      {compact ? (
        <div className="flex flex-wrap items-center gap-4 px-5 pt-4">
          <span className="min-w-0 flex-1 text-[13px] leading-normal text-pretty text-muted-foreground">
            <strong className="font-semibold text-foreground">{t("stepsShort")}</strong> {t("columnsShort")}
          </span>
          <span className="flex-none">{downloadButton(false)}</span>
        </div>
      ) : (
        <ol className="m-0 grid list-none grid-cols-1 gap-5 px-5 pt-5 pb-1 md:grid-cols-3">
          {[
            { n: 1, title: t("step1"), body: t("step1Body", { language: languageName }) },
            { n: 2, title: t("step2"), body: t("step2Body") },
            { n: 3, title: t("step3"), body: t("step3Body") },
          ].map((step) => (
            <li key={step.n} className="flex min-w-0 flex-col gap-2">
              <span className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full font-mono text-xs font-semibold",
                    step.n === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  {step.n}
                </span>
                <strong className="text-[15px] font-semibold">{step.title}</strong>
              </span>
              <span className="text-[13px] leading-normal text-pretty text-muted-foreground">{step.body}</span>
              {step.n === 1 && <span className="mt-1 self-start">{downloadButton(true)}</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="flex flex-col gap-2.5 px-5 pt-4 pb-5">
        <div
          role="button"
          tabIndex={canImport ? 0 : -1}
          aria-disabled={!canImport || sending}
          aria-label={t("fileLabel")}
          onClick={pick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pick();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (canImport) setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={drop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-dashed bg-background p-5 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft",
            compact ? "min-h-[112px]" : "min-h-[168px]",
            fileError ? "border-status-rejected" : over ? "border-ring bg-accent" : "border-input",
            canImport ? "cursor-pointer hover:bg-accent" : "cursor-not-allowed opacity-45",
          )}
        >
          {sending ? (
            <span className="size-5 animate-spin rounded-full border-2 border-current border-r-transparent text-muted-foreground" aria-hidden />
          ) : canImport ? (
            <Upload className="size-[22px] text-muted-foreground" strokeWidth={1.5} aria-hidden />
          ) : (
            <Lock className="size-[22px] text-muted-foreground" strokeWidth={1.5} aria-hidden />
          )}
          <span className="text-sm font-medium">{canImport ? t("drop") : t("dropLocked")}</span>
          <span className="text-xs text-muted-foreground">{t("limits")}</span>
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onFile(file);
            }}
          />
        </div>
        {fileError && (
          <div role="alert" className="flex items-center gap-2.5 rounded-lg bg-status-rejected-muted px-3 py-2.5 text-[13px] leading-[1.45] text-status-rejected-foreground">
            <CircleAlert className="size-4 flex-none" strokeWidth={1.9} aria-hidden />
            <span className="min-w-0 flex-1 text-foreground">
              {t(`fileError.${fileError.kind}`, { name: fileError.name, size: formatFileSize(fileError.size, locale) })}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-[30px] flex-none px-3 text-xs shadow-none"
              onClick={fileError.kind === "FileUnsafe" ? download : pick}
            >
              {fileError.kind === "FileUnsafe" ? t("downloadAgain") : t("pickOther")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Result({ job, canImport, onRestart }: { job: ImportResponse; canImport: boolean; onRestart: () => void }) {
  const t = useTranslations("imports");
  const locale = useLocale();
  const date = useImportDate();
  const goProducts = (secondary: boolean) => (
    <Link href="/products" className={cn(buttonVariants({ variant: secondary ? "secondary" : "default" }), "flex-none shadow-none")}>
      {t("goProducts")}
      <ArrowRight strokeWidth={1.75} aria-hidden />
    </Link>
  );
  const by = [job.createdByName, date(job.createdAt)].filter(Boolean).join(" · ");

  if (isRunning(job)) {
    return (
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex items-center gap-3.5">
          <span className="flex size-11 flex-none items-center justify-center rounded-[10px] bg-status-approved-muted font-mono text-[11px] font-semibold text-status-approved-foreground">
            XLSX
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <strong className="truncate text-[15px] font-semibold">{job.fileName}</strong>
            <span className="text-xs text-muted-foreground tabular-nums">
              {[job.fileSize != null ? formatFileSize(job.fileSize, locale) : undefined, by].filter(Boolean).join(" · ")}
            </span>
          </span>
          <span role="status" className="flex items-center gap-2 text-[13px] font-medium text-status-submitted-foreground">
            <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />
            {t("processing")}
          </span>
        </div>
        <div className="flex gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-[13px] leading-normal">
          <Info className="mt-0.5 size-4 flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <span className="text-pretty">{t("processingNote")}</span>
        </div>
      </div>
    );
  }

  if (job.status === "FAILED") {
    const code = job.failureCode ?? "UNREADABLE";
    return (
      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-status-rejected bg-card px-6 py-5">
        <span className="flex size-11 flex-none items-center justify-center rounded-full bg-status-rejected-muted text-status-rejected-foreground">
          <CircleAlert className="size-5" strokeWidth={1.9} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <strong className="text-base font-semibold">{t("failedTitle")}</strong>
          <span className="text-sm leading-normal text-pretty">{t(`failure.${code}` as never)}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{[job.fileName, by].join(" · ")}</span>
        </span>
        {code === "TEMPLATE_UNKNOWN" ? (
          <GuardedButton allowed={canImport} className="flex-none" onClick={() => void downloadTemplate(locale)}>
            <Download strokeWidth={1.75} aria-hidden />
            {t("download")}
          </GuardedButton>
        ) : (
          <GuardedButton allowed={canImport} className="flex-none" onClick={onRestart}>
            <Upload strokeWidth={1.75} aria-hidden />
            {t("uploadOther")}
          </GuardedButton>
        )}
      </div>
    );
  }

  const meta = [job.fileName, t("rows", { count: job.totalRows }), job.failedRows === 0 ? t("noErrors") : undefined, by].filter(Boolean).join(" · ");
  if (job.failedRows === 0) {
    return (
      <div className="flex flex-wrap items-center gap-[18px] rounded-xl border bg-card p-6">
        <span className="flex size-12 flex-none items-center justify-center rounded-full bg-status-approved-muted text-status-approved-foreground">
          <Check className="size-6" strokeWidth={2} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <strong className="font-serif text-[28px] leading-[1.15] font-normal tracking-[-0.02em]">{t("created", { count: job.createdRows })}</strong>
          <span className="text-[13px] text-muted-foreground tabular-nums">{meta}</span>
        </span>
        {goProducts(false)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-6 rounded-xl border bg-card px-6 py-5">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex flex-wrap items-baseline gap-3 font-serif text-[28px] leading-[1.15] tracking-[-0.02em]">
            <span className="flex items-baseline gap-2">
              <span className="size-2.5 self-center rounded-full bg-status-approved" aria-hidden />
              {t("created", { count: job.createdRows })}
            </span>
            <span className="text-input" aria-hidden>
              ·
            </span>
            <span className="flex items-baseline gap-2 text-status-rejected-foreground">
              <span className="size-2.5 self-center rounded-full bg-status-rejected" aria-hidden />
              {t("failedRows", { count: job.failedRows })}
            </span>
          </span>
          <span className="text-[13px] text-muted-foreground tabular-nums">{meta}</span>
        </span>
        {goProducts(true)}
      </div>
      <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-status-expiring bg-status-expiring-muted px-3.5 py-2.5 text-[13px] leading-[1.45]">
        <RefreshCw className="size-4 flex-none text-status-expiring-foreground" strokeWidth={1.9} aria-hidden />
        <span className="min-w-0 flex-1">
          <strong className="font-semibold">{t("fixTitle")}</strong> {t("fixBody")}
        </span>
        {canImport && (
          <Button type="button" variant="secondary" size="sm" className="h-[30px] flex-none px-3 text-xs shadow-none" onClick={onRestart}>
            {t("fixUpload")}
          </Button>
        )}
      </div>
      <ErrorTable job={job} />
    </div>
  );
}

const STATUS_TONE = {
  running: "bg-status-submitted-muted text-status-submitted-foreground [--dot:var(--status-submitted)]",
  done: "bg-status-approved-muted text-status-approved-foreground [--dot:var(--status-approved)]",
  partial: "bg-status-expiring-muted text-status-expiring-foreground [--dot:var(--status-expiring)]",
  failed: "bg-status-rejected-muted text-status-rejected-foreground [--dot:var(--status-rejected)]",
} as const;

export function statusOf(job: ImportResponse): keyof typeof STATUS_TONE {
  if (isRunning(job)) return "running";
  if (job.status === "FAILED") return "failed";
  return job.failedRows > 0 ? "partial" : "done";
}

function History({
  rows,
  query,
  selectedId,
  onOpen,
}: {
  rows: ImportResponse[];
  query: ReturnType<typeof useImports>;
  selectedId?: string;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("imports");
  const locale = useLocale();
  const date = useImportDate();
  const grid = "grid grid-cols-[minmax(0,1fr)_150px_130px_150px_120px_20px] gap-4";

  const note = (job: ImportResponse): ReactNode => {
    const status = statusOf(job);
    if (status === "running") return job.fileSize != null ? formatFileSize(job.fileSize, locale) : "";
    if (status === "failed") return t(`failureShort.${job.failureCode ?? "UNREADABLE"}` as never);
    return t("rows", { count: job.totalRows });
  };

  return (
    <section aria-labelledby="h-imports" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 id="h-imports" className="text-[15px] font-semibold tracking-[-0.01em]">
          {t("historyTitle")}
        </h2>
        {rows.length > 0 && <span className="text-xs text-muted-foreground">{t("historySub")}</span>}
      </div>
      {query.isPending ? (
        <Skeleton aria-busy="true" className="h-[150px] rounded-[10px]" />
      ) : query.isError ? (
        <div role="alert" className="flex items-center gap-3 text-[13px] text-muted-foreground">
          {t("historyError")}
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <span className="text-[13px] text-muted-foreground">{t("historyEmpty")}</span>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border bg-card">
          <div role="table" aria-labelledby="h-imports" className="min-w-[760px]">
            <div role="row" className={cn(grid, "bg-muted px-4 py-2 text-xs font-medium text-muted-foreground")}>
              <span role="columnheader">{t("colFile")}</span>
              <span role="columnheader">{t("colDate")}</span>
              <span role="columnheader">{t("colBy")}</span>
              <span role="columnheader">{t("colStatus")}</span>
              <span role="columnheader" className="text-right">
                {t("colCounts")}
              </span>
              <span />
            </div>
            {rows.map((job) => {
              const status = statusOf(job);
              const finished = status === "done" || status === "partial";
              return (
                <button
                  key={job.id}
                  type="button"
                  role="row"
                  onClick={() => onOpen(job.id)}
                  aria-current={job.id === selectedId ? "true" : undefined}
                  className={cn(
                    grid,
                    "min-h-12 w-full cursor-pointer items-center border-t px-4 py-1.5 text-left text-[13px] outline-none hover:bg-accent focus-visible:bg-accent",
                    job.id === selectedId && "bg-accent",
                  )}
                >
                  <span role="cell" className="flex min-w-0 flex-col gap-px">
                    <span className="truncate font-medium">{job.fileName}</span>
                    <span className="truncate text-xs text-muted-foreground">{note(job)}</span>
                  </span>
                  <span role="cell" className="text-xs text-muted-foreground tabular-nums">
                    {date(job.createdAt)}
                  </span>
                  <span role="cell" className="truncate">
                    {job.createdByName ?? "—"}
                  </span>
                  <span role="cell">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full py-[3px] pr-[9px] pl-2 text-xs font-medium whitespace-nowrap", STATUS_TONE[status])}>
                      <span className="size-1.5 rounded-full bg-(--dot)" aria-hidden />
                      {t(`status.${status}`)}
                    </span>
                  </span>
                  <span role="cell" className="text-right font-mono tabular-nums">
                    {finished ? job.createdRows : "—"} <span className="text-muted-foreground">/</span>{" "}
                    <span className={finished && job.failedRows > 0 ? "text-status-rejected-foreground" : "text-muted-foreground"}>
                      {finished ? job.failedRows : "—"}
                    </span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
