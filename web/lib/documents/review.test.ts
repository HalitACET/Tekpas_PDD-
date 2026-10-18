import { describe, expect, it } from "vitest";
import type { DocumentResponse } from "@/lib/api/documents";
import { ApiError } from "@/lib/api/request";
import {
  dayToIso,
  daysBefore,
  documentState,
  fieldErrors,
  initialValues,
  isoToDay,
  knownType,
  review,
  toVerifyRequest,
} from "./review";
import { precheck, uploadErrorKind } from "./upload-errors";

const NOW = new Date(2026, 9, 18, 12, 0);

type Fields = NonNullable<DocumentResponse["extraction"]>["fields"];

const field = (value: string, confidence: number, source: "TEXT_RULES" | "LLM" = "TEXT_RULES", page = 1) => ({
  value,
  confidence,
  source,
  evidence: { page, snippet: `…${value}…` },
});

function doc(over: Partial<DocumentResponse> = {}, fields: Fields = {}, detected: DocumentResponse["docType"] = "GOTS"): DocumentResponse {
  return {
    id: "d1",
    docType: "UNKNOWN",
    originalName: "gots.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1_400_000,
    pageCount: 3,
    extractionStatus: "READ",
    reviewStatus: "UNREVIEWED",
    source: "SUPPLIER_LINK",
    createdAt: "2026-10-17T09:14:00Z",
    extraction: { detectedType: detected, method: "TEXT_RULES", fields, warnings: [] },
    ...over,
  };
}

const confident: Fields = {
  certNo: field("ASB-GOTS-118043", 0.96),
  holderName: field("Denizli Örme", 0.97),
  issuer: field("Anadolu Sertifikasyon", 0.93),
  validFrom: field("2026-04-01", 0.95),
  validUntil: field("2027-03-31", 0.95),
};

describe("documentState", () => {
  it("follows the reading and the confirmation", () => {
    expect(documentState(doc({ extractionStatus: "QUEUED" }))).toBe("reading");
    expect(documentState(doc({ extractionStatus: "RUNNING" }))).toBe("reading");
    expect(documentState(doc({ extractionStatus: "FAILED" }))).toBe("error");
    expect(documentState(doc({ extractionStatus: "UNREADABLE" }))).toBe("unreadable");
    expect(documentState(doc({}, confident))).toBe("full");
    expect(documentState(doc({ reviewStatus: "VERIFIED" }, confident))).toBe("approved");
  });

  it("is low when a field is below 0.8 or from the LLM, however sure the LLM claims to be", () => {
    expect(documentState(doc({}, { ...confident, certNo: field("X", 0.79) }))).toBe("low");
    expect(documentState(doc({}, { ...confident, issuer: field("ETTE", 0.72, "LLM") }))).toBe("low");
    expect(documentState(doc({}, { ...confident, certNo: field("X", 0.8) }))).toBe("full");
  });
});

describe("dates", () => {
  it("converts between the form's day.month.year and the API's ISO date", () => {
    expect(isoToDay("2027-03-31")).toBe("31.03.2027");
    expect(dayToIso("31.03.2027")).toBe("2027-03-31");
    expect(dayToIso("1.4.2026")).toBe("2026-04-01");
    expect(dayToIso("2027-03-31")).toBe("2027-03-31");
  });

  it("refuses what is not a day", () => {
    expect(dayToIso("31.02.2027")).toBeUndefined();
    expect(dayToIso("2027/03/31")).toBeUndefined();
    expect(dayToIso("")).toBeUndefined();
    expect(dayToIso("11.O2.2027")).toBeUndefined();
  });

  it("counts whole days back from today", () => {
    expect(daysBefore("2026-10-15", NOW)).toBe(3);
    expect(daysBefore("2026-10-18", NOW)).toBe(0);
    expect(daysBefore("2026-10-20", NOW)).toBe(-2);
  });
});

describe("the form", () => {
  it("starts from what the reading proposes, with dates the way the person types them", () => {
    const values = initialValues(doc({}, confident));
    expect(values).toMatchObject({ docType: "GOTS", certNo: "ASB-GOTS-118043", validFrom: "01.04.2026", validUntil: "31.03.2027" });
  });

  it("starts empty for a document nothing was read from", () => {
    const values = initialValues(doc({ extractionStatus: "UNREADABLE", extraction: undefined }));
    expect(values).toMatchObject({ docType: "UNKNOWN", certNo: "", validUntil: "" });
  });

  it("shows a confirmed document's own values", () => {
    const values = initialValues(doc({ reviewStatus: "VERIFIED", docType: "GRS", certNo: "A-1", validUntil: "2027-01-31" }));
    expect(values).toMatchObject({ docType: "GRS", certNo: "A-1", validUntil: "31.01.2027", holderName: "" });
  });

  it("names the type the card shows: the confirmed one, else the reading's", () => {
    expect(knownType(doc({ docType: "OEKO_TEX" }, {}, "GOTS"))).toBe("OEKO_TEX");
    expect(knownType(doc({}, {}, "GOTS"))).toBe("GOTS");
    expect(knownType(doc({}, {}, "UNKNOWN"))).toBeUndefined();
  });
});

describe("review", () => {
  const low = doc({}, { ...confident, certNo: field("23.HTR.7I245", 0.61), issuer: field("ETTE", 0.72, "LLM") });

  it("keeps the person from approving while a yellow field is unchecked", () => {
    const values = initialValues(low);
    const first = review(low, values, {}, NOW);
    expect(first.pendingChecks).toBe(2);
    expect(first.canApprove).toBe(false);

    const checked = review(low, values, { certNo: true, issuer: true }, NOW);
    expect(checked.pendingChecks).toBe(0);
    expect(checked.canApprove).toBe(true);
  });

  it("counts a corrected field as looked at, with the reading's value kept as the original", () => {
    const values = { ...initialValues(low), certNo: "23.HTR.71245" };
    const r = review(low, values, { issuer: true }, NOW);
    const certNo = r.fields.find((f) => f.key === "certNo")!;
    expect(certNo).toMatchObject({ fixed: true, source: "manual", needsCheck: false, original: "23.HTR.7I245" });
    expect(certNo.confidence).toBeUndefined();
    expect(r.dirty).toBe(true);
    expect(r.canApprove).toBe(true);
  });

  it("marks what the reading proposed with its source and confidence, and the AI's as AI", () => {
    const r = review(low, initialValues(low), {}, NOW);
    expect(r.fields.find((f) => f.key === "certNo")).toMatchObject({ source: "document", confidence: 61, needsCheck: true });
    expect(r.fields.find((f) => f.key === "issuer")).toMatchObject({ source: "ai", confidence: 72, needsCheck: true });
    expect(r.fields.find((f) => f.key === "holderName")).toMatchObject({ source: "document", confidence: 97, needsCheck: false });
  });

  it("is not dirty until something is changed", () => {
    expect(review(doc({}, confident), initialValues(doc({}, confident)), {}, NOW).dirty).toBe(false);
  });

  it("flags an expired certificate in the field and in the review, but still lets it be approved", () => {
    const expired = doc({}, { ...confident, validUntil: field("2026-10-15", 0.96) });
    const r = review(expired, initialValues(expired), {}, NOW);
    expect(r.expired).toBe(true);
    expect(r.fields.find((f) => f.key === "validUntil")?.expiredDays).toBe(3);
    expect(r.canApprove).toBe(true);
  });

  it("lets manual entry be confirmed once a certificate has its number and end of validity", () => {
    const scan = doc({ extractionStatus: "UNREADABLE", extraction: undefined });
    const empty = initialValues(scan);
    expect(review(scan, empty, {}, NOW).canApprove).toBe(false);

    const typed = { ...empty, docType: "OEKO_TEX", certNo: "23.HTR.71245", validUntil: "11.02.2027" };
    const r = review(scan, typed, {}, NOW);
    expect(r.canApprove).toBe(true);
    expect(r.fields.find((f) => f.key === "certNo")).toMatchObject({ source: "manual", fixed: false });
  });

  it("asks nothing but a type of a technical sheet (decision 6)", () => {
    const sheet = doc({ extractionStatus: "UNREADABLE", extraction: undefined });
    const values = { ...initialValues(sheet), docType: "TECH_SHEET" };
    expect(fieldErrors(values)).toEqual({});
    expect(fieldErrors({ ...values, docType: "UNKNOWN" })).toEqual({ docType: "type" });
  });

  it("names what a certificate still needs, and refuses dates that make no sense", () => {
    const values = { ...initialValues(doc({}, {})), docType: "GOTS" };
    expect(fieldErrors(values)).toEqual({ certNo: "required", validUntil: "required" });
    expect(fieldErrors({ ...values, certNo: "A", validUntil: "31.13.2027" })).toEqual({ validUntil: "date" });
    expect(fieldErrors({ ...values, certNo: "A", validFrom: "01.04.2027", validUntil: "31.03.2027" })).toEqual({ validUntil: "range" });
  });

  it("shows a confirmed document read-only with its corrections marked from the server's record", () => {
    const verified = doc(
      {
        reviewStatus: "VERIFIED",
        docType: "GOTS",
        certNo: "ASB-TC-551200",
        verification: { docType: "ACCEPTED", certNo: "EDITED", holderName: "ACCEPTED" },
      },
      { ...confident, certNo: field("ASB-TC-55120O", 0.7) },
    );
    const r = review(verified, initialValues(verified), {}, NOW);
    expect(r.fields.find((f) => f.key === "certNo")).toMatchObject({ fixed: true, original: "ASB-TC-55120O", needsCheck: false });
    expect(r.pendingChecks).toBe(0);
  });
});

describe("toVerifyRequest", () => {
  it("sends the full set, empty text as left out and dates as ISO", () => {
    const values = { docType: "GOTS", certNo: " ASB-1 ", holderName: "", issuer: "  ", validFrom: "01.04.2026", validUntil: "31.03.2027" };
    expect(toVerifyRequest(values)).toEqual({
      docType: "GOTS",
      certNo: "ASB-1",
      holderName: undefined,
      issuer: undefined,
      validFrom: "2026-04-01",
      validUntil: "2027-03-31",
    });
  });
});

describe("upload errors", () => {
  const problem = (status: number, extra: Record<string, unknown> = {}) =>
    new ApiError(status, { type: "urn:tekpas:problem:x", title: "x", status, ...extra });

  it("checks the file before it is sent", () => {
    expect(precheck({ name: "a.docx", size: 10 })).toBe("format");
    expect(precheck({ name: "a.PDF", size: 11 * 1024 * 1024 })).toBe("size");
    expect(precheck({ name: "a.jpeg", size: 0 })).toBe("empty");
    expect(precheck({ name: "a.pdf", size: 10 })).toBeUndefined();
  });

  it("tells the server's rejections apart", () => {
    expect(uploadErrorKind(problem(413, { errors: [{ field: "file", code: "FileTooLarge" }] }))).toBe("size");
    expect(uploadErrorKind(problem(415, { errors: [{ field: "file", code: "FileType" }] }))).toBe("format");
    expect(uploadErrorKind(problem(400, { errors: [{ field: "file", code: "FileEncrypted" }] }))).toBe("encrypted");
    expect(uploadErrorKind(problem(400, { errors: [{ field: "file", code: "FileCorrupt" }] }))).toBe("encrypted");
    expect(uploadErrorKind(problem(400, { errors: [{ field: "file", code: "FilePages" }] }))).toBe("pages");
    expect(uploadErrorKind(problem(400, { errors: [{ field: "file", code: "FileDimensions" }] }))).toBe("dimensions");
    expect(uploadErrorKind(problem(409, { reason: "DUPLICATE_DOCUMENT" }))).toBe("duplicate");
    expect(uploadErrorKind(problem(409, { reason: "DOCUMENT_LIMIT" }))).toBe("limit");
    expect(uploadErrorKind(problem(409, { reason: "BATCH_PUBLISHED" }))).toBe("published");
    expect(uploadErrorKind(problem(429))).toBe("rate");
    expect(uploadErrorKind(problem(502))).toBe("storage");
    expect(uploadErrorKind(problem(403))).toBe("forbidden");
  });

  it("calls a request that never got an answer a lost connection", () => {
    expect(uploadErrorKind(new TypeError("Network error"))).toBe("network");
  });
});
