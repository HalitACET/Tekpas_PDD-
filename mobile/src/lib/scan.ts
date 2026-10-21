import { digitalLinkPath, parseDigitalLink } from "@tekpas/shared";
import { WEB_URL } from "./config";

/** What a scanned QR holds: a GS1 Digital Link of a batch, or anything else (shown as read, never opened). */
export type ScannedCode = { kind: "gs1"; gtin: string; batchNo: string } | { kind: "other"; text: string };

const DIGITAL_LINK = /\/01\/(\d{8,14})\/10\/([^/?#]+)/;

/**
 * A GS1 Digital Link on any host (docs/m9-plan.md §5): the path's /01/{gtin}/10/{batch} with a valid GTIN check
 * digit and an AI (10) batch number. The host does not matter: we look the batch up ourselves.
 */
export function readCode(text: string): ScannedCode {
  const trimmed = text.trim();
  if (!/^https?:\/\//i.test(trimmed)) return { kind: "other", text: trimmed };
  const match = DIGITAL_LINK.exec(trimmed);
  if (!match) return { kind: "other", text: trimmed };
  let batch: string;
  try {
    batch = decodeURIComponent(match[2]);
  } catch {
    return { kind: "other", text: trimmed };
  }
  const key = parseDigitalLink(match[1], batch);
  return key ? { kind: "gs1", gtin: key.gtin, batchNo: key.batchNo } : { kind: "other", text: trimmed };
}

/** Our own public passport page for the code (never the scanned host). */
export function passportUrl(gtin: string, batchNo: string): string {
  return WEB_URL.replace(/\/+$/, "") + digitalLinkPath(gtin, batchNo);
}
