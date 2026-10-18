"use client";

import { Info, Lock, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { deletePublicDocument, type PublicDocument, uploadPublicDocument } from "@/lib/api/public-request";
import { ApiError } from "@/lib/api/request";
import { uploadErrorKind } from "@/lib/documents/upload-errors";
import { formatFileSize, formatPercent } from "@/lib/format";
import {
  canRetry,
  countedRows,
  type DocRow,
  extOf,
  isFull,
  MAX_LINK_DOCUMENTS,
  precheckDocument,
  rowOfDocument,
} from "@/lib/supplier-request/documents";
import { cn } from "@/lib/utils";

/**
 * The state of the Documents section (design v0.5 49–55), kept by the form so that it can wait for a transfer
 * before it sends and name the documents in the confirmation. Files go one at a time (the server is small and
 * the connection is a phone's); a file the server turns away stays as a row with its reason. The supplier never
 * sees what is read from a document: the rows hold a name, a size and where the transfer stands.
 */
export function useSupplierDocuments({
  token,
  initial,
  onClosed,
}: {
  token: string;
  /** The page's own `documents`: the earlier submission's (read-only) and this link's uploads of an earlier visit. */
  initial: readonly PublicDocument[];
  /** The link turned out to be closed (410) or unknown (404). */
  onClosed: (error: ApiError) => void;
}) {
  const [rows, setRows] = useState<DocRow[]>(() => initial.filter((d) => !d.previous).map(rowOfDocument));
  const previous = initial.filter((d) => d.previous);
  const aborts = useRef(new Map<string, AbortController>());
  const started = useRef(new Set<string>());
  // Not crypto.randomUUID(): it does not exist on a page opened over plain http (a phone on a local network).
  const counter = useRef(0);

  const patch = useCallback(
    (id: string, change: Partial<DocRow>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r))),
    [],
  );
  const drop = useCallback((id: string) => setRows((all) => all.filter((r) => r.id !== id)), []);

  const start = useCallback(
    (row: DocRow) => {
      if (!row.file) return;
      const abort = new AbortController();
      aborts.current.set(row.id, abort);
      patch(row.id, { state: "uploading", percent: 0, error: undefined });
      uploadPublicDocument(token, row.file, { signal: abort.signal, onProgress: (percent) => patch(row.id, { percent }) })
        .then((doc) => patch(row.id, { state: "done", percent: 100, name: doc.fileName, sizeBytes: doc.sizeBytes, documentId: doc.id, file: undefined }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (error instanceof ApiError && (error.status === 404 || error.status === 410)) return onClosed(error);
          patch(row.id, { state: "failed", error: uploadErrorKind(error) });
        })
        .finally(() => aborts.current.delete(row.id));
    },
    [token, patch, onClosed],
  );

  // One transfer at a time: the next waiting file starts when nothing is on its way.
  useEffect(() => {
    if (rows.some((r) => r.state === "uploading")) return;
    const next = rows.find((r) => r.state === "queued" && !started.current.has(r.id));
    if (!next) return;
    started.current.add(next.id);
    start(next);
  }, [rows, start]);

  // Leaving the page stops what is still on its way.
  useEffect(() => {
    const running = aborts.current;
    return () => running.forEach((abort) => abort.abort());
  }, []);

  const add = (files: readonly File[]) => {
    if (files.length === 0) return;
    setRows((current) => {
      let next = [...current];
      for (const file of files) {
        const refused = precheckDocument(file, next);
        next = [
          ...next,
          {
            id: `upload-${++counter.current}`,
            name: file.name,
            sizeBytes: file.size,
            file,
            percent: 0,
            ...(refused ? { state: "failed" as const, error: refused } : { state: "queued" as const }),
          },
        ];
      }
      return next;
    });
  };

  const retry = (row: DocRow) => {
    started.current.delete(row.id);
    patch(row.id, { state: "queued", percent: 0, error: undefined });
  };

  const remove = (row: DocRow) => {
    if (row.state === "uploading") aborts.current.get(row.id)?.abort();
    if (!row.documentId) return drop(row.id);
    patch(row.id, { removing: true, removeFailed: false });
    deletePublicDocument(token, row.documentId)
      .then(() => drop(row.id))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404 && error.problem?.reason !== "LINK_INVALID") return drop(row.id);
        if (error instanceof ApiError && (error.status === 404 || error.status === 410)) return onClosed(error);
        patch(row.id, { removing: false, removeFailed: true });
      });
  };

  return {
    rows,
    previous,
    add,
    retry,
    remove,
    busy: rows.some((r) => r.state === "queued" || r.state === "uploading"),
    /** The names of the uploaded documents, for the confirmation. */
    uploadedNames: rows.filter((r) => r.state === "done").map((r) => r.name),
  };
}

export type SupplierDocuments = ReturnType<typeof useSupplierDocuments>;

const EXT_TONE: Record<string, string> = {
  PDF: "text-brand-text",
  JPG: "text-status-submitted-foreground",
  PNG: "text-status-submitted-foreground",
};

function ExtTile({ name, failed }: { name: string; failed?: boolean }) {
  const ext = extOf(name);
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-11 w-10 items-center justify-center rounded-md bg-muted font-mono text-[10px] font-semibold tracking-[0.04em]",
        failed ? "text-status-rejected-foreground" : (EXT_TONE[ext] ?? "text-muted-foreground"),
      )}
    >
      {ext}
    </span>
  );
}

function DocumentRow({ row, docs }: { row: DocRow; docs: SupplierDocuments }) {
  const t = useTranslations("supplier.form.sections.documents");
  const locale = useLocale();
  const failed = row.state === "failed";
  const waiting = row.state === "queued" || row.state === "uploading";
  const retry = canRetry(row);
  const action = waiting ? t("cancel") : retry ? t("retry") : t("remove");
  const message = (() => {
    if (!failed) return undefined;
    const kind = row.error ?? "unknown";
    if (kind === "size") return t("errors.size", { size: formatFileSize(row.sizeBytes, locale) });
    if (kind === "network") return t("errors.network", { percent: formatPercent(row.percent, locale) });
    // The panel's reasons for a rejection that can not happen on a link fall back to the general one.
    const known = ["format", "empty", "encrypted", "pages", "dimensions", "duplicate", "limit", "rate", "storage"];
    return t(`errors.${known.includes(kind) ? kind : "unknown"}` as "errors.limit", { max: MAX_LINK_DOCUMENTS });
  })();

  return (
    <li
      data-state={row.state}
      className={cn(
        "grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] border py-2 pr-1 pl-2",
        failed ? "border-status-rejected bg-status-rejected-muted" : "border-border bg-card",
      )}
    >
      <ExtTile name={row.name} failed={failed} />
      <span className="flex min-w-0 flex-col gap-[5px]">
        <span dir="auto" className="truncate text-sm font-medium">
          {row.name}
        </span>
        {waiting && (
          <span className="flex items-center gap-2">
            <span
              role="progressbar"
              aria-label={`${t("progress")}: ${row.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={row.percent}
              className="flex h-1 flex-1 overflow-hidden rounded-sm bg-muted"
            >
              <span className="bg-brand transition-[width] duration-200" style={{ width: `${row.percent}%` }} />
            </span>
            <span className="font-mono text-xs text-muted-foreground">{formatPercent(row.percent, locale)}</span>
          </span>
        )}
        {row.state === "done" && (
          <span className="text-xs text-muted-foreground">
            <span className="sr-only">{t("uploaded")}. </span>
            {formatFileSize(row.sizeBytes, locale)} · {extOf(row.name)}
          </span>
        )}
        {failed && (
          <span role="alert" className="text-xs leading-[1.45] text-pretty text-status-rejected-foreground">
            {message}
          </span>
        )}
        {row.removeFailed && (
          <span role="alert" className="text-xs leading-[1.45] text-status-rejected-foreground">
            {t("errors.removeFailed")}
          </span>
        )}
      </span>
      <button
        type="button"
        disabled={row.removing}
        aria-label={`${action}: ${row.name}`}
        onClick={() => (retry ? docs.retry(row) : docs.remove(row))}
        className={cn(
          "h-11 min-w-11 rounded-lg px-2.5 text-sm font-medium whitespace-nowrap outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft disabled:opacity-50",
          retry ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {action}
      </button>
    </li>
  );
}

/**
 * Design v0.5 49–55: the Documents section of the form. Optional; PDF, JPG or PNG chosen with the browser's own
 * picker (on a phone: the camera or the files). A correction request marks it and shows the earlier submission's
 * documents locked above, the new ones are added below.
 */
export function DocumentsSection({
  number,
  docs,
  aiReading,
  flagged,
}: {
  number: string;
  docs: SupplierDocuments;
  /** The AI reading is on (a demo): real documents must not be uploaded. */
  aiReading: boolean;
  /** The manufacturer asked for new documents. */
  flagged: boolean;
}) {
  const t = useTranslations("supplier.form.sections.documents");
  const tForm = useTranslations("supplier.form");
  const locale = useLocale();
  const input = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const fullId = useId();
  const full = isFull(docs.rows);
  const counted = countedRows(docs.rows).length;
  const earlier = docs.previous.length ? docs.previous.map((d) => d.uploadedAt).sort().at(-1)! : undefined;

  return (
    <>
      {aiReading && (
        <div
          role="note"
          className="flex items-center gap-2 rounded-lg bg-status-low-confidence-muted px-3 py-[9px] text-[13px] font-medium text-status-low-confidence-foreground"
        >
          <Info className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
          {t("demo")}
        </div>
      )}
      <section
        id="section-documents"
        aria-labelledby={headingId}
        className={cn(
          "flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-card p-4",
          flagged ? "border-status-rejected" : "border-border",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-medium text-muted-foreground">{number}</span>
          <h2 id={headingId} className="text-base font-semibold">
            {t("title")}
          </h2>
          <span className="text-[13px] text-muted-foreground">{tForm("optional")}</span>
          {flagged && (
            <span className="inline-flex items-center rounded-sm bg-status-rejected-muted px-2 py-0.5 text-xs font-medium text-status-rejected-foreground">
              {tForm("fix.flag")}
            </span>
          )}
          <span
            className={cn("ml-auto font-mono text-xs", full ? "text-foreground" : "text-muted-foreground")}
            aria-label={t("count", { count: counted, max: MAX_LINK_DOCUMENTS })}
          >
            {counted} / {MAX_LINK_DOCUMENTS}
          </span>
        </div>
        <p className="-mt-1.5 text-[13px] leading-normal text-muted-foreground">{t("hint")}</p>

        {docs.previous.length > 0 && (
          <div className="flex flex-col gap-2 rounded-[10px] bg-muted p-3">
            <span className="text-xs font-semibold text-muted-foreground">
              {t("previous", { when: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(earlier!)) })}
            </span>
            <ul className="flex flex-col gap-2" aria-label={t("previousList")}>
              {docs.previous.map((doc) => (
                <li
                  key={doc.id}
                  className="grid grid-cols-[40px_minmax(0,1fr)_44px] items-center gap-3 rounded-[10px] border border-border bg-card py-2 pr-0 pl-2"
                >
                  <ExtTile name={doc.fileName} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span dir="auto" className="truncate text-sm font-medium">
                      {doc.fileName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(doc.sizeBytes, locale)} · {t("readOnly")}
                    </span>
                  </span>
                  <span role="img" aria-label={t("readOnly")} className="flex justify-center text-muted-foreground">
                    <Lock className="size-4" strokeWidth={1.75} aria-hidden />
                  </span>
                </li>
              ))}
            </ul>
            <span className="text-xs leading-normal text-muted-foreground">{t("previousNote")}</span>
          </div>
        )}

        {docs.rows.length > 0 && (
          <ul className="flex flex-col gap-3" aria-label={t("list")}>
            {docs.rows.map((row) => (
              <DocumentRow key={row.id} row={row} docs={docs} />
            ))}
          </ul>
        )}

        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="h-12 w-full text-[15px]"
          disabled={full}
          aria-describedby={full ? fullId : undefined}
          onClick={() => input.current?.click()}
        >
          {full ? <Lock strokeWidth={1.75} aria-hidden /> : <Upload strokeWidth={1.75} aria-hidden />}
          {t("upload")}
        </Button>
        {full ? (
          <span id={fullId} className="text-center text-[13px] leading-normal text-pretty text-muted-foreground">
            {t("full", { max: MAX_LINK_DOCUMENTS })}
          </span>
        ) : (
          <span className="text-center text-[13px] leading-normal text-muted-foreground">{t("pickHint")}</span>
        )}
        <span className="text-center font-mono text-xs text-muted-foreground">{t("formats")}</span>
        {/* The browser's own picker: on a phone it offers the camera and the files. Nothing is dropped on a phone. */}
        <input
          ref={input}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          multiple
          hidden
          tabIndex={-1}
          aria-label={t("upload")}
          data-testid="supplier-document-input"
          onChange={(e) => {
            // Copied first: clearing the input empties the live FileList.
            docs.add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </section>
    </>
  );
}
