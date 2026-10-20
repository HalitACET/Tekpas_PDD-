import { hasAcceptedGtinFormat, hasValidGtinCheckDigit, normalizeGtin } from "./gtin";

/**
 * GS1 Digital Link of a batch's passport (PLAN K13): `{base}/01/{gtin14}/10/{batchNo}`. Same rules as the backend
 * (com.tekpas.passport.Gs1DigitalLink), tested against the same cases (test-vectors/gs1-digital-link.json). The GTIN
 * is always the 14-digit form; the batch number is AI (10): 1–20 characters of A–Z, 0–9 and "-", so nothing needs
 * percent-encoding.
 */

const BATCH_NO = /^[A-Z0-9-]{1,20}$/;

export interface DigitalLinkKey {
  gtin: string;
  batchNo: string;
}

/** `/01/{gtin14}/10/{batchNo}`. Throws when the GTIN or the batch number is not valid. */
export function digitalLinkPath(gtin: string, batchNo: string): string {
  if (!hasAcceptedGtinFormat(gtin) || !hasValidGtinCheckDigit(gtin)) throw new Error("Not a valid GTIN");
  if (!BATCH_NO.test(batchNo)) throw new Error("Not a GS1 AI (10) batch number");
  return `/01/${normalizeGtin(gtin)}/10/${batchNo}`;
}

/** The full address; a trailing slash of the base is dropped. */
export function digitalLinkUrl(baseUrl: string, gtin: string, batchNo: string): string {
  return baseUrl.replace(/\/+$/, "") + digitalLinkPath(gtin, batchNo);
}

/**
 * What a scanned address stands for: GTIN-8, -12, -13 or -14 with a valid check digit (normalized to 14 digits) and the
 * batch number upper-cased. `undefined` when it is not a valid code.
 */
export function parseDigitalLink(gtin: string, batchNo: string): DigitalLinkKey | undefined {
  if (!hasAcceptedGtinFormat(gtin) || !hasValidGtinCheckDigit(gtin)) return undefined;
  const batch = batchNo.toUpperCase();
  return BATCH_NO.test(batch) ? { gtin: normalizeGtin(gtin), batchNo: batch } : undefined;
}
