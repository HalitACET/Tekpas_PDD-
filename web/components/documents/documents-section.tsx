"use client";

import { RefreshCw, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { GuardedButton } from "@/components/common/guarded-button";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type DocumentResponse,
  uploadStepDocument,
  useDocumentUploaded,
  useRereadDocument,
  useStepDocuments,
} from "@/lib/api/documents";
import { documentState, knownType } from "@/lib/documents/review";
import { precheck, RETRYABLE, type UploadErrorKind, uploadErrorKind } from "@/lib/documents/upload-errors";
import { formatFileSize, formatPercent, formatWhen } from "@/lib/format";
import { DocumentChip } from "./document-chip";
import { ReviewDialog } from "./review-dialog";

/** A file on its way (design 58a) or turned away (58b); it becomes a card once the server accepted it. */
interface Upload {
  id: string;
  file: File;
  state: "uploading" | "failed";
  percent: number;
  error?: UploadErrorKind;
  abort?: AbortController;
}

const EXT_STYLE: Record<string, string> = {
  PDF: "text-brand-text",
  JPG: "text-status-submitted-foreground",
  PNG: "text-status-submitted-foreground",
};

const extOf = (name: string) => (name.split(".").pop() ?? "").toUpperCase().replace("JPEG", "JPG");

function ExtTile({ name, tone }: { name: string; tone?: string }) {
  const ext = extOf(name);
  return (
    <span
      className={`flex h-10 w-[34px] items-center justify-center rounded-[5px] bg-muted font-mono text-[9px] font-semibold tracking-[0.04em] ${
        tone ?? EXT_STYLE[ext] ?? "text-muted-foreground"
      }`}
    >
      {ext}
    </span>
  );
}

/**
 * Design v0.5 56a/56b/58: a step's documents in its panel: a card for each (type, file, who and when, state
 * chip), the files on their way, and the drop zone. A card opens the review dialog (57). The reading runs in the
 * background; the list asks again every 1.5 s while any document is being read.
 */
export function DocumentsSection({
  stepId,
  stepName,
  supplierName,
  published,
  canWrite,
  reviewer,
}: {
  stepId: string;
  /** "Kumaş" */
  stepName: string;
  supplierName: string;
  published: boolean;
  canWrite: boolean;
  reviewer: boolean;
}) {
  const t = useTranslations("documents");
  const locale = useLocale();
  const now = useMemo(() => new Date(), []);
  const list = useStepDocuments(stepId);
  const uploaded = useDocumentUploaded(stepId);
  const reread = useRereadDocument(stepId);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [openId, setOpenId] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const allowed = canWrite && !published;

  const patch = (id: string, change: Partial<Upload>) =>
    setUploads((all) => all.map((u) => (u.id === id ? { ...u, ...change } : u)));
  const drop = (id: string) => setUploads((all) => all.filter((u) => u.id !== id));

  const send = (item: Upload) => {
    const abort = new AbortController();
    patch(item.id, { state: "uploading", percent: 0, error: undefined, abort });
    uploadStepDocument(stepId, item.file, { signal: abort.signal, onProgress: (percent) => patch(item.id, { percent }) })
      .then(() => {
        drop(item.id);
        uploaded();
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        patch(item.id, { state: "failed", error: uploadErrorKind(error), abort: undefined });
      });
  };

  const add = (files: FileList | File[] | null) => {
    if (!allowed || !files) return;
    for (const file of Array.from(files)) {
      const item: Upload = { id: crypto.randomUUID(), file, state: "uploading", percent: 0 };
      const rejected = precheck(file);
      setUploads((all) => [...all, rejected ? { ...item, state: "failed", error: rejected } : item]);
      if (!rejected) send(item);
    }
  };

  // Leaving the panel stops what is still on its way.
  const uploadsRef = useRef(uploads);
  useEffect(() => {
    uploadsRef.current = uploads;
  });
  useEffect(() => () => uploadsRef.current.forEach((u) => u.abort?.abort()), []);

  const docs = list.data ?? [];
  const opened = docs.find((d) => d.id === openId);

  const message = (u: Upload) =>
    u.error === "size"
      ? t("upload.errors.size", { size: formatFileSize(u.file.size, locale) })
      : u.error === "network"
        ? t("upload.errors.network", { percent: formatPercent(u.percent, locale) })
        : t(`upload.errors.${u.error ?? "unknown"}`);

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="step-documents-title">
      <div className="flex items-baseline gap-2">
        <h3 id="step-documents-title" className="text-[13px] font-semibold">
          {t("title")}
        </h3>
        <span className="font-mono text-[11px] text-muted-foreground">{t("count", { count: docs.length })}</span>
        <span className="ml-auto text-[11px] text-muted-foreground">{t("rule")}</span>
      </div>

      {list.isPending ? (
        <Skeleton className="h-[62px] rounded-lg" />
      ) : list.isError ? (
        <div role="alert" className="flex items-center gap-3 rounded-lg bg-status-rejected-muted px-3.5 py-3 text-[13px] text-status-rejected-foreground">
          {t("loadFailed")}
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => void list.refetch()}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        docs.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            now={now}
            canWrite={canWrite && !published}
            rereading={reread.isPending && reread.variables === doc.id}
            onOpen={() => setOpenId(doc.id)}
            onReread={() =>
              reread.mutate(doc.id, { onError: (error) => showErrorToast({ title: t("card.rereadFailed"), error }) })
            }
          />
        ))
      )}

      {uploads.map((u) => (
        <div
          key={u.id}
          className={`grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border py-2.5 pr-2 pl-3 ${
            u.state === "failed" ? "border-status-rejected bg-status-rejected-muted" : "bg-card"
          }`}
        >
          <ExtTile name={u.file.name} tone={u.state === "failed" ? "text-status-rejected-foreground" : undefined} />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-[13px] font-medium">{u.file.name}</span>
            {u.state === "uploading" ? (
              <span className="flex items-center gap-2">
                <span
                  role="progressbar"
                  aria-label={t("upload.progress")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={u.percent}
                  className="flex h-1 flex-1 overflow-hidden rounded-sm bg-muted"
                >
                  <span className="bg-brand transition-[width] duration-200" style={{ width: `${u.percent}%` }} />
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{formatPercent(u.percent, locale)}</span>
              </span>
            ) : (
              <span role="alert" className="text-xs leading-[1.4] text-status-rejected-foreground">
                {message(u)}
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 px-2.5 text-xs ${u.state === "failed" && u.error && RETRYABLE.includes(u.error) ? "" : "text-muted-foreground"}`}
            aria-label={`${u.state === "uploading" ? t("upload.cancel") : u.state === "failed" && u.error && RETRYABLE.includes(u.error) ? t("upload.retry") : t("upload.remove")}: ${u.file.name}`}
            onClick={() => {
              if (u.state === "uploading") {
                u.abort?.abort();
                drop(u.id);
              } else if (u.error && RETRYABLE.includes(u.error)) {
                send(u);
              } else {
                drop(u.id);
              }
            }}
          >
            {u.state === "uploading" ? t("upload.cancel") : u.error && RETRYABLE.includes(u.error) ? t("upload.retry") : t("upload.remove")}
          </Button>
        </div>
      ))}

      {list.isSuccess && docs.length === 0 && uploads.length === 0 && (
        <div className="rounded-lg bg-muted px-3.5 py-3 text-[13px] leading-normal text-muted-foreground">
          <span className="font-semibold text-foreground">{t("empty.title")}</span> {t("empty.body")}
        </div>
      )}

      <div
        onDragOver={(e) => {
          if (!allowed) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-2 rounded-lg border-[1.5px] border-dashed p-4 text-center transition-colors ${
          dragging ? "border-ring bg-ring-soft" : "border-input"
        }`}
      >
        <Upload className={`size-5 ${dragging ? "text-brand-text" : "text-muted-foreground"}`} strokeWidth={1.75} aria-hidden />
        <span className="text-[13px] font-medium">{dragging ? t("upload.dropActive") : t("upload.drop")}</span>
        <GuardedButton
          allowed={allowed}
          tooltipSide="top"
          tooltipAlign="center"
          variant="secondary"
          size="sm"
          onClick={() => input.current?.click()}
        >
          {t("upload.pick")}
        </GuardedButton>
        <span className="font-mono text-[11px] text-muted-foreground">{t("upload.rules")}</span>
        <span className="text-[11px] text-muted-foreground">{t("upload.hint")}</span>
        {published && <span className="text-[11px] text-muted-foreground">{t("upload.locked")}</span>}
        <input
          ref={input}
          id={inputId}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          multiple
          hidden
          aria-label={t("upload.pick")}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {opened && (
        <ReviewDialog
          // A new key per document: the form starts from that document's own state.
          key={opened.id}
          stepId={stepId}
          stepName={stepName}
          supplierName={supplierName}
          initial={opened}
          canWrite={canWrite && !published}
          reviewer={reviewer && !published}
          onClose={() => setOpenId(undefined)}
        />
      )}
    </section>
  );
}

function DocumentCard({
  doc,
  now,
  canWrite,
  rereading,
  onOpen,
  onReread,
}: {
  doc: DocumentResponse;
  now: Date;
  canWrite: boolean;
  rereading: boolean;
  onOpen: () => void;
  onReread: () => void;
}) {
  const t = useTranslations("documents");
  const tType = useTranslations("enums.docType");
  const locale = useLocale();
  const state = documentState(doc);
  const type = knownType(doc);
  const title =
    state === "reading" && !type
      ? t("card.typeReading")
      : type
        ? tType(type)
        : state === "unreadable"
          ? t("card.typeUnreadable")
          : t("card.typeUnknown");
  const muted = !type && state !== "approved";
  const who = t("card.by", {
    name: doc.uploadedByName ?? "—",
    source: doc.source === "PANEL" ? t("card.sourcePanel") : t("card.sourceLink"),
    when: formatWhen(doc.createdAt, now, locale),
  });
  const tChip = useTranslations("documents.chip");
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={t("card.open", { file: doc.originalName, state: tChip(state) })}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`grid cursor-pointer grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-xs outline-none hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft ${
        state === "low" ? "border-status-low-confidence" : "border-border"
      }`}
    >
      <ExtTile name={doc.originalName} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`truncate text-[13px] font-semibold ${muted ? "text-muted-foreground" : ""}`}>{title}</span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{doc.originalName}</span>
        <span className="text-[11px] text-muted-foreground">{who}</span>
      </span>
      <span className="flex flex-col items-end gap-1.5">
        <DocumentChip state={state} size="sm" />
        {doc.rereadable && canWrite && (
          <Button
            variant="secondary"
            className="h-[26px] gap-[5px] px-2 text-xs"
            disabled={rereading}
            onClick={(e) => {
              e.stopPropagation();
              onReread();
            }}
          >
            <RefreshCw className="size-3" strokeWidth={1.75} aria-hidden />
            {t("card.reread")}
          </Button>
        )}
      </span>
    </div>
  );
}
