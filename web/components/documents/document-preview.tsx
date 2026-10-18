"use client";

import { ChevronLeft, ChevronRight, CircleAlert, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { type DocumentResponse, useDocumentFile } from "@/lib/api/documents";
import { Spinner } from "./document-chip";

/** An A4 or Letter page at 100 % in the browser's viewer: 8.5 in at 96 dpi. */
const PAGE_WIDTH_PX = 816;

export const ZOOM_STEPS = [50, 75, 100, 125, 150, 175, 200] as const;

/** An object URL of the blob for as long as the preview is shown (never leaked, never reused after unmount). */
function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an external resource, created and revoked with the blob
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(undefined);
    };
  }, [blob]);
  return url;
}

/**
 * The left half of the review dialog (design v0.5 57): the page, a page switcher for a PDF and zoom for both.
 * The file comes through the API with the bearer token and is shown from a blob URL: the endpoint redirects
 * to a short signed link, which an iframe or image `src` could not reach with the token. The browser's own PDF
 * viewer draws the pages (no PDF library), told the page and zoom through the URL's fragment.
 */
export function DocumentPreview({
  doc,
  page,
  onPage,
  zoom,
  onZoom,
}: {
  doc: DocumentResponse;
  page: number;
  onPage: (page: number) => void;
  zoom: number;
  onZoom: (zoom: number) => void;
}) {
  const t = useTranslations("documents.preview");
  const file = useDocumentFile(doc.id, doc.mimeType);
  const url = useObjectUrl(file.data);
  const isPdf = doc.mimeType === "application/pdf";
  const pages = doc.pageCount ?? 1;
  const at = Math.min(Math.max(page, 1), pages);
  // "%100" is the page as wide as the pane (the design's "Sığdır"); the viewer's own scale follows from it.
  const pane = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(0);
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setPaneWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const viewerZoom = Math.max(10, Math.round((zoom * Math.max(paneWidth - 32, 200)) / PAGE_WIDTH_PX));
  const zoomIndex = ZOOM_STEPS.indexOf(zoom as (typeof ZOOM_STEPS)[number]);
  const step = (delta: number) => {
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (zoomIndex < 0 ? 2 : zoomIndex) + delta))];
    onZoom(next);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-col border-r bg-muted" aria-label={t("label")} role="region">
      <div className="flex h-12 flex-none items-center gap-2 border-b bg-card px-3">
        {isPdf ? (
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" aria-label={t("prev")} disabled={at <= 1} onClick={() => onPage(at - 1)}>
              <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden />
            </Button>
            <span className="min-w-24 text-center text-[13px]">
              {t("page")} <span className="font-mono">{t("pageOf", { page: at, pages })}</span>
            </span>
            <Button variant="secondary" size="icon" aria-label={t("next")} disabled={at >= pages} onClick={() => onPage(at + 1)}>
              <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden />
            </Button>
          </div>
        ) : (
          <span className="text-[13px] text-muted-foreground">{t("image")}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="secondary" size="icon" aria-label={t("zoomOut")} disabled={zoom <= ZOOM_STEPS[0]} onClick={() => step(-1)}>
            <Minus className="size-4" strokeWidth={1.75} aria-hidden />
          </Button>
          <span className="min-w-[52px] text-center font-mono text-[13px]">%{zoom}</span>
          <Button variant="secondary" size="icon" aria-label={t("zoomIn")} disabled={zoom >= ZOOM_STEPS.at(-1)!} onClick={() => step(1)}>
            <Plus className="size-4" strokeWidth={1.75} aria-hidden />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onZoom(100)}>
            {t("fit")}
          </Button>
        </div>
      </div>
      <div ref={pane} className={`flex min-h-0 flex-1 ${isPdf ? "" : "overflow-auto bg-[#4A463F] p-7"}`}>
        {file.isPending || (file.data && !url) ? (
          <div role="status" className="m-auto flex items-center gap-2 text-[13px] text-muted-foreground">
            <Spinner className="size-3.5" />
            {t("loading")}
          </div>
        ) : file.isError || !url ? (
          <div role="alert" className="m-auto flex max-w-[320px] flex-col items-center gap-2 p-6 text-center">
            <CircleAlert className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            <strong className="text-sm font-semibold">{t("failed")}</strong>
            <span className="text-[13px] text-muted-foreground">{t("failedBody")}</span>
            <Button variant="secondary" size="sm" onClick={() => void file.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : isPdf ? (
          // Remounted per page and zoom: the viewer reads the fragment when it loads.
          <iframe
            key={`${at}-${viewerZoom}`}
            title={doc.originalName}
            src={`${url}#page=${at}&zoom=${viewerZoom}&toolbar=0&navpanes=0`}
            className="size-full border-0 bg-muted"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- a blob URL of the person's own file
          <img src={url} alt={doc.originalName} style={{ width: `${zoom}%` }} className="m-auto h-auto max-w-none flex-none self-start shadow-md" />
        )}
      </div>
    </div>
  );
}
