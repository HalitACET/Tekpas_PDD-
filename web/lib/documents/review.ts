import { DOCUMENT_CONFIDENCE_THRESHOLD, type DocType, isCertificateDocType } from "@tekpas/shared";
import type { DocumentResponse, VerifyDocumentRequest } from "@/lib/api/documents";

/*
 * What the review dialog (design v0.5 57) decides, apart from how it looks: which state a document is in, what
 * each field shows (source, confidence, evidence), what still needs a person and what the confirmation sends.
 */

export const DOC_FIELDS = ["certNo", "holderName", "issuer", "validFrom", "validUntil"] as const;
export type DocField = (typeof DOC_FIELDS)[number];
/** The design's order: type, number, holder, issuer, from, until. */
export const FIELD_ORDER = ["docType", ...DOC_FIELDS] as const;
export type FieldKey = (typeof FIELD_ORDER)[number];

const DATE_FIELDS: readonly FieldKey[] = ["validFrom", "validUntil"];
export const isDateField = (key: FieldKey) => DATE_FIELDS.includes(key);

/** The six states of design 56a/57: the card's chip and the dialog's mode. */
export type DocumentState = "reading" | "full" | "low" | "unreadable" | "error" | "approved";

type Proposal = NonNullable<NonNullable<DocumentResponse["extraction"]>["fields"][DocField]>;

export function proposalOf(doc: DocumentResponse, key: DocField): Proposal | undefined {
  return doc.extraction?.fields[key] ?? undefined;
}

/** Below the threshold, or from the LLM: a person has to look at it (design 57c). */
export function needsLook(proposal: Proposal): boolean {
  return proposal.source === "LLM" || proposal.confidence < DOCUMENT_CONFIDENCE_THRESHOLD;
}

export function documentState(doc: DocumentResponse): DocumentState {
  if (doc.reviewStatus === "VERIFIED") return "approved";
  switch (doc.extractionStatus) {
    case "QUEUED":
    case "RUNNING":
      return "reading";
    case "FAILED":
      return "error";
    case "UNREADABLE":
      return "unreadable";
    default:
      return DOC_FIELDS.some((key) => {
        const p = proposalOf(doc, key);
        return p !== undefined && needsLook(p);
      })
        ? "low"
        : "full";
  }
}

// ── dates: dd.mm.yyyy in the form, yyyy-mm-dd in the API ─────────────────────────────────────────────

export function isoToDay(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso ?? "");
}

/** "18.10.2026" (or "2026-10-18") → "2026-10-18", or undefined when it is not a real day. */
export function dayToIso(text: string): string | undefined {
  const dotted = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(text);
  const iso = /^\s*(\d{4})-(\d{2})-(\d{2})\s*$/.exec(text);
  const [y, mo, d] = dotted
    ? [Number(dotted[3]), Number(dotted[2]), Number(dotted[1])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [];
  if (y === undefined || mo === undefined || d === undefined) return undefined;
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return undefined;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Whole days between a day (yyyy-mm-dd) and today's date; positive when the day is in the past. */
export function daysBefore(iso: string, now: Date): number {
  const [y, m, d] = iso.split("-").map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((today - new Date(y, m - 1, d).getTime()) / 86_400_000);
}

// ── the form ─────────────────────────────────────────────────────────────────────────────────────────

export type FormValues = Record<FieldKey, string>;

const textOf = (key: FieldKey, value: string | null | undefined) => (isDateField(key) ? isoToDay(value) : (value ?? ""));

/** The values the form starts with: a confirmed document's own, otherwise what the reading proposes. */
export function initialValues(doc: DocumentResponse): FormValues {
  if (doc.reviewStatus === "VERIFIED") {
    return {
      docType: doc.docType,
      certNo: doc.certNo ?? "",
      holderName: doc.holderName ?? "",
      issuer: doc.issuer ?? "",
      validFrom: isoToDay(doc.validFrom),
      validUntil: isoToDay(doc.validUntil),
    };
  }
  const detected = doc.extraction?.detectedType;
  const values: FormValues = {
    docType: doc.docType !== "UNKNOWN" ? doc.docType : (detected ?? "UNKNOWN"),
    certNo: "",
    holderName: "",
    issuer: "",
    validFrom: "",
    validUntil: "",
  };
  for (const key of DOC_FIELDS) {
    values[key] = textOf(key, proposalOf(doc, key)?.value);
  }
  return values;
}

/** What the reading proposed for the key, as the form would show it. */
function proposedText(doc: DocumentResponse, key: FieldKey): string | undefined {
  if (key === "docType") {
    const detected = doc.extraction?.detectedType;
    return detected && detected !== "UNKNOWN" ? detected : undefined;
  }
  const p = proposalOf(doc, key);
  return p ? textOf(key, p.value) : undefined;
}

export type Source = "document" | "ai" | "manual";

export interface FieldView {
  key: FieldKey;
  value: string;
  source: Source | null;
  /** Whole percent, only for what the reading proposed and the person left alone. */
  confidence?: number;
  /** A proposal below the threshold (or from the LLM): "Doğru" or a correction is needed before "Onayla". */
  needsCheck: boolean;
  checked: boolean;
  /** The person changed what was proposed ("Düzeltildi"); `original` is what the reading had. */
  fixed: boolean;
  original?: string;
  evidence?: { page: number; snippet: string };
  /** Days since the end of validity, for the validUntil field of an expired certificate. */
  expiredDays?: number;
}

const sameText = (a: string, b: string) => a.trim() === b.trim();

export function fieldViews(
  doc: DocumentResponse,
  values: FormValues,
  checks: Partial<Record<FieldKey, boolean>>,
  now: Date,
): FieldView[] {
  const verified = doc.reviewStatus === "VERIFIED";
  return FIELD_ORDER.map((key): FieldView => {
    const value = values[key];
    const proposal = key === "docType" ? undefined : proposalOf(doc, key);
    const proposed = proposedText(doc, key);
    const hasProposal = proposed !== undefined;
    const fixed = verified ? doc.verification?.[key] === "EDITED" : hasProposal && !sameText(value, proposed);
    const view: FieldView = { key, value, source: null, needsCheck: false, checked: false, fixed };

    if (hasProposal && !fixed) {
      view.source = proposal?.source === "LLM" ? "ai" : "document";
      if (proposal) {
        view.confidence = Math.round(proposal.confidence * 100);
        view.evidence = proposal.evidence ? { page: proposal.evidence.page, snippet: proposal.evidence.snippet } : undefined;
        if (!verified && needsLook(proposal)) {
          view.checked = !!checks[key];
          view.needsCheck = !view.checked;
        }
      }
    } else if (value.trim() !== "" && value !== "UNKNOWN") {
      view.source = "manual";
    }
    if (fixed && proposed !== undefined) view.original = proposed;
    if (key === "validUntil" && value.trim() !== "") {
      const iso = dayToIso(value);
      const days = iso ? daysBefore(iso, now) : 0;
      if (days > 0) view.expiredDays = days;
    }
    return view;
  });
}

export type FieldError = "date" | "range" | "type" | "required";

/** Why a field cannot be confirmed yet. Certificates need a number and the end of validity (plan decision 6). */
export function fieldErrors(values: FormValues): Partial<Record<FieldKey, FieldError>> {
  const errors: Partial<Record<FieldKey, FieldError>> = {};
  if (values.docType === "UNKNOWN") errors.docType = "type";
  for (const key of ["validFrom", "validUntil"] as const) {
    if (values[key].trim() !== "" && !dayToIso(values[key])) errors[key] = "date";
  }
  const from = dayToIso(values.validFrom);
  const until = dayToIso(values.validUntil);
  if (from && until && until < from) errors.validUntil = "range";
  if (isCertificateDocType(values.docType as DocType)) {
    if (values.certNo.trim() === "") errors.certNo = "required";
    if (values.validUntil.trim() === "") errors.validUntil = "required";
  }
  return errors;
}

export interface Review {
  fields: FieldView[];
  /** How many proposals still wait for "Doğru" or a correction. */
  pendingChecks: number;
  /** Fields the document's type makes mandatory and that are empty. */
  missing: FieldKey[];
  errors: Partial<Record<FieldKey, FieldError>>;
  dirty: boolean;
  canApprove: boolean;
  expired: boolean;
}

export function review(
  doc: DocumentResponse,
  values: FormValues,
  checks: Partial<Record<FieldKey, boolean>>,
  now: Date,
): Review {
  const fields = fieldViews(doc, values, checks, now);
  const errors = fieldErrors(values);
  const start = initialValues(doc);
  const pendingChecks = fields.filter((f) => f.needsCheck).length;
  return {
    fields,
    pendingChecks,
    missing: FIELD_ORDER.filter((key) => errors[key] === "required"),
    errors,
    dirty: FIELD_ORDER.some((key) => !sameText(values[key], start[key])),
    canApprove: pendingChecks === 0 && Object.keys(errors).length === 0,
    expired: fields.some((f) => f.expiredDays !== undefined),
  };
}

/** The confirmation's body: the full set, a field left empty is a field left empty. */
export function toVerifyRequest(values: FormValues): VerifyDocumentRequest {
  const text = (v: string) => v.trim() || undefined;
  return {
    docType: values.docType as DocType,
    certNo: text(values.certNo),
    holderName: text(values.holderName),
    issuer: text(values.issuer),
    validFrom: dayToIso(values.validFrom),
    validUntil: dayToIso(values.validUntil),
  };
}

/** The type the card names: the confirmed one, else the reading's, else nothing yet. */
export function knownType(doc: DocumentResponse): DocType | undefined {
  if (doc.docType !== "UNKNOWN") return doc.docType;
  const detected = doc.extraction?.detectedType;
  return detected && detected !== "UNKNOWN" ? detected : undefined;
}
