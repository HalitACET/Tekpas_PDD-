"use client";

import { Check, Copy, Download, ExternalLink, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchQr, type PassportVersion, useQrPreview } from "@/lib/api/passports";
import { identifierLine, saveBlob } from "./use-version-facts";

const SIZES = [512, 1024] as const;

/** The address without the scheme, with the middle of the GTIN shortened (the design's "kozapass.vercel.app/01/0201…0025/10/…"). */
function shortAddress(link: string): string {
  try {
    const url = new URL(link);
    return `${url.host}${url.pathname.replace(/\/01\/(\d{4})\d+(\d{4})\//, "/01/$1…$2/")}`;
  } catch {
    return link;
  }
}

/**
 * The QR code of the passport address (design v0.6): the image, the identifier line, PNG in 512 or 1024 px, SVG for
 * print, the link to copy and to open. The code holds no version, so it is the same for every version of the batch. It
 * is a demo address until a domain exists, and says so. `compact` is the version in the publishing dialog.
 */
export function QrCard({ passport, compact = false }: { passport: PassportVersion; compact?: boolean }) {
  const t = useTranslations("publishing");
  const image = useQrPreview(passport.id);
  const [size, setSize] = useState<(typeof SIZES)[number]>(1024);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!image.data) return;
    const objectUrl = URL.createObjectURL(image.data);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- an external resource, created and revoked with the blob
    setUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
      setUrl(undefined);
    };
  }, [image.data]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const download = (kind: "png" | "svg") =>
    fetchQr(passport.id, kind, size).then(
      (blob) => saveBlob(blob, `qr-${passport.batchNo}.${kind}`),
      (error: unknown) => showErrorToast({ title: t("qrFailed"), error, onRetry: () => download(kind) }),
    );
  const copy = () =>
    navigator.clipboard?.writeText(passport.digitalLink).then(
      () => setCopied(true),
      () => {},
    );
  const open = passport.digitalLink.replace(/^https?:\/\/[^/]+/, "");

  const picture = (
    <span
      className={`flex flex-none rounded-lg border bg-white p-1.5 ${compact ? "size-[148px]" : "size-[132px]"}`}
      aria-busy={image.isPending}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob URL of the QR image, not an optimizable asset
        <img src={url} alt={t("qrAlt")} className="size-full [image-rendering:pixelated]" />
      ) : image.isError ? (
        <span role="alert" className="m-auto text-center text-[11px] text-muted-foreground">
          {t("qrFailed")}
        </span>
      ) : (
        <Skeleton className="size-full" />
      )}
    </span>
  );
  const sizes = (
    <span className="flex gap-0.5 rounded-md bg-muted p-0.5 font-mono text-[11px] font-medium" role="group">
      {SIZES.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === size}
          onClick={() => setSize(s)}
          className={`h-7 cursor-pointer rounded-[4px] px-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft ${
            s === size ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
          }`}
        >
          {t("qrSize", { size: s })}
        </button>
      ))}
    </span>
  );
  const small = "h-8 flex-1 px-2.5 text-xs";

  if (compact) {
    return (
      <div className="mx-6 flex gap-4 rounded-[10px] border bg-card p-3.5">
        {picture}
        <span className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="font-mono text-xs leading-normal break-words">{identifierLine(passport.gtin, passport.batchNo)}</span>
          <span className="flex gap-1.5">
            {sizes}
            <Button variant="secondary" className={small} onClick={() => void download("png")}>
              {t("qrDownloadPng")}
            </Button>
          </span>
          <span className="flex gap-1.5">
            <Button variant="secondary" className={small} onClick={() => void download("svg")}>
              {t("qrDownloadSvg")}
            </Button>
            <Button variant="secondary" className={small} onClick={copy}>
              {copied ? t("qrCopied") : t("qrCopy")}
            </Button>
          </span>
          <span className="text-[11px] text-status-expiring-foreground">{t("qrDemo")}</span>
        </span>
      </div>
    );
  }

  return (
    <section id="qr-card" aria-label={t("qrTitle")} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{t("qrTitle")}</span>
        <span className="text-xs text-muted-foreground">{t("qrSub")}</span>
      </div>
      <div className="flex items-center gap-3.5">
        {picture}
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="font-mono text-xs leading-normal break-words">{identifierLine(passport.gtin, passport.batchNo)}</span>
          <span className="font-mono text-[11px] break-words text-muted-foreground" title={passport.digitalLink}>
            {shortAddress(passport.digitalLink)}
          </span>
        </span>
      </div>
      <div className="flex gap-1.5">
        {sizes}
        <Button variant="secondary" className={small} onClick={() => void download("png")}>
          <Download className="size-[13px]" strokeWidth={1.75} aria-hidden />
          {t("qrDownloadPng")}
        </Button>
      </div>
      <Button variant="secondary" className="h-8 px-2.5 text-xs" onClick={() => void download("svg")}>
        <Download className="size-[13px]" strokeWidth={1.75} aria-hidden />
        {t("qrDownloadSvg")}
      </Button>
      <div className="flex gap-1.5">
        <Button variant="secondary" className={small} onClick={copy}>
          {copied ? <Check className="size-[13px]" strokeWidth={1.75} aria-hidden /> : <Copy className="size-[13px]" strokeWidth={1.75} aria-hidden />}
          {copied ? t("qrCopied") : t("qrCopy")}
        </Button>
        <a
          href={open}
          target="_blank"
          rel="noreferrer"
          className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-input bg-card px-2.5 text-xs font-medium shadow-xs outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
        >
          <ExternalLink className="size-[13px]" strokeWidth={1.75} aria-hidden />
          {t("qrOpen")}
        </a>
      </div>
      <span className="flex gap-1.5 text-[11px] leading-[1.4] text-status-expiring-foreground">
        <TriangleAlert className="mt-px size-3 flex-none" strokeWidth={1.9} aria-hidden />
        {t("qrDemo")}
      </span>
    </section>
  );
}
