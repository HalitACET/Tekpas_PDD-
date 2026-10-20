"use client";

import { useLocale } from "next-intl";
import { type PassportVersion, usePassportVersions } from "@/lib/api/passports";

/** The version that is live now (published) and when it was published, for the score card and the actions. */
export function useVersionFacts(batchId: string, enabled: boolean): { live?: PassportVersion; publishedAt?: string } {
  const locale = useLocale();
  const versions = usePassportVersions(batchId, enabled);
  const live = versions.data?.find((v) => v.status === "PUBLISHED");
  return {
    live,
    publishedAt: live
      ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "Europe/Istanbul" }).format(new Date(live.publishedAt))
      : undefined,
  };
}

/** "02012345000025" and "KP-…" as the address under the QR code: (01) … (10) … */
export function identifierLine(gtin: string, batchNo: string): string {
  return `(01) ${gtin} (10) ${batchNo}`;
}

/** Saves a blob as a file (the QR images come with a bearer token, so they cannot be a plain download link). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
