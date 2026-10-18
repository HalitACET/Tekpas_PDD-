import type { Page, Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Browser-side stand-in for the documents endpoints (M5): the cards of a step, one document, its file, the
 * confirmation and "Tekrar oku". The files are the backend's synthetic test documents (nothing real).
 */
const FILES = path.resolve(__dirname, "../../backend/src/test/resources/documents");

export type DocKind = "reading" | "full" | "low" | "unreadable" | "error" | "approved" | "expired";

export interface MockDocument {
  id: string;
  stepId: string;
  docType: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number | null;
  extractionStatus: string;
  reviewStatus: string;
  failureCode: string | null;
  source: "PANEL" | "SUPPLIER_LINK";
  uploadedByName: string | null;
  createdAt: string;
  extraction: unknown;
  extractionMethod: string | null;
  extractedAt: string | null;
  certNo: string | null;
  holderName: string | null;
  issuer: string | null;
  validFrom: string | null;
  validUntil: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  verification: unknown;
  /** Mock only: the bytes the file endpoint serves. */
  file: string;
}

/** What the backend's reading produced for a test document (the golden files), as the API sends it. */
function expected(file: string): { detectedType: string; method: string; fields: Record<string, { value: string; confidence: number; source: string; evidence: unknown }>; warnings: string[] } {
  return JSON.parse(readFileSync(path.join(FILES, `${file}.expected.json`), "utf-8")).extraction;
}

/** Kinds of the design's cards (56a) with the design's data; `createdAt` is given by the caller where it matters. */
export function mockDocument(kind: DocKind, stepId: string, over: Partial<MockDocument> = {}): MockDocument {
  const base = {
    stepId,
    docType: "UNKNOWN",
    mimeType: "application/pdf",
    pageCount: 1,
    reviewStatus: "UNREVIEWED",
    failureCode: null,
    source: "SUPPLIER_LINK" as const,
    uploadedByName: "Selin Arslan",
    createdAt: new Date(2026, 9, 17, 9, 14).toISOString(),
    extraction: null,
    extractionMethod: null,
    extractedAt: null,
    certNo: null,
    holderName: null,
    issuer: null,
    validFrom: null,
    validUntil: null,
    verifiedByName: null,
    verifiedAt: null,
    verification: null,
  };
  const read = (extraction: ReturnType<typeof expected>) => ({
    extraction,
    extractionMethod: extraction.method,
    extractionStatus: "READ",
    extractedAt: new Date(2026, 9, 17, 9, 15).toISOString(),
  });
  switch (kind) {
    case "reading":
      return {
        ...base,
        id: "60000000-0000-4000-8000-000000000001",
        originalName: "kumas_teknik_foy_0918.pdf",
        sizeBytes: 800_000,
        pageCount: 1,
        extractionStatus: "RUNNING",
        source: "PANEL",
        uploadedByName: "Elif Yılmaz",
        createdAt: new Date(2026, 9, 18, 10, 2).toISOString(),
        file: "technical-sheet.pdf",
        ...over,
      };
    case "full":
      return {
        ...base,
        id: "60000000-0000-4000-8000-000000000002",
        originalName: "gots_kapsam_2026.pdf",
        sizeBytes: 1_400_000,
        file: "gots-turkce.pdf",
        ...read(expected("gots-turkce.pdf")),
        ...over,
      };
    case "low": {
      // The design's 57c: a number read at 0.61, an issuer the LLM guessed, a date at 0.74.
      const e = expected("oekotex-turkce-buyuk-harf.pdf");
      e.fields.certNo = { ...e.fields.certNo, confidence: 0.61 };
      e.fields.issuer = { ...e.fields.issuer, confidence: 0.72, source: "LLM" };
      e.fields.validUntil = { ...e.fields.validUntil, confidence: 0.74 };
      return {
        ...base,
        id: "60000000-0000-4000-8000-000000000003",
        originalName: "oekotex_100_2026.pdf",
        sizeBytes: 1_100_000,
        pageCount: 1,
        createdAt: new Date(2026, 9, 17, 9, 15).toISOString(),
        file: "oekotex-turkce-buyuk-harf.pdf",
        ...read(e),
        ...over,
      };
    }
    case "unreadable":
      return {
        ...base,
        id: "60000000-0000-4000-8000-000000000004",
        originalName: "IMG_2041.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 3_800_000,
        pageCount: null,
        createdAt: new Date(2026, 9, 17, 9, 16).toISOString(),
        extractionStatus: "UNREADABLE",
        extractionMethod: "NONE",
        failureCode: "NO_TEXT_LAYER",
        extractedAt: new Date(2026, 9, 17, 9, 17).toISOString(),
        file: "photo-certificate.jpg",
        ...over,
      };
    case "error":
      return {
        ...base,
        id: "60000000-0000-4000-8000-000000000005",
        originalName: "scan_0917.pdf",
        sizeBytes: 8_900_000,
        pageCount: 1,
        createdAt: new Date(2026, 9, 17, 9, 17).toISOString(),
        extractionStatus: "FAILED",
        extractionMethod: "NONE",
        failureCode: "EXTRACT_TIMEOUT",
        extractedAt: new Date(2026, 9, 17, 9, 19).toISOString(),
        file: "scanned-oekotex.pdf",
        ...over,
      };
    case "approved": {
      const e = expected("gots-scope-certificate.pdf");
      // The reading proposed ...5821; the person corrected it to ...5827 when confirming (57f).
      return {
        ...base,
        id: "60000000-0000-4000-8000-000000000006",
        originalName: "gots_islem_2026.pdf",
        sizeBytes: 600_000,
        pageCount: 1,
        source: "PANEL",
        uploadedByName: "Elif Yılmaz",
        createdAt: new Date(2026, 9, 16, 14, 30).toISOString(),
        file: "gots-scope-certificate.pdf",
        ...read(e),
        reviewStatus: "VERIFIED",
        docType: "GOTS",
        certNo: "DEMO-GOTS-SC-55827",
        holderName: e.fields.holderName.value,
        issuer: e.fields.issuer.value,
        validFrom: e.fields.validFrom.value,
        validUntil: e.fields.validUntil.value,
        verifiedByName: "Elif Yılmaz",
        verifiedAt: new Date(2026, 9, 17, 10, 42).toISOString(),
        verification: { docType: "ACCEPTED", certNo: "EDITED", holderName: "ACCEPTED", issuer: "ACCEPTED", validFrom: "ACCEPTED", validUntil: "ACCEPTED" },
        ...over,
      };
    }
    case "expired":
      return {
        ...base,
        id: "60000000-0000-4000-8000-000000000007",
        originalName: "oekotex_100_2025.pdf",
        sizeBytes: 1_000_000,
        pageCount: 1,
        file: "oekotex-expired.pdf",
        ...read(expected("oekotex-expired.pdf")),
        ...over,
      };
  }
}

const problem = (route: Route, status: number, body: Record<string, unknown>) =>
  route.fulfill({ status, contentType: "application/problem+json", body: JSON.stringify({ status, ...body }) });

const MIME: Record<string, string> = { ".pdf": "application/pdf", ".jpg": "image/jpeg" };

interface Options {
  /** Documents by step id (the panel's cards). */
  docs: MockDocument[];
  /** How a new upload is answered: a document, a refusal, or never. */
  upload?: (file: { name: string; size: number }) => { status: number; body?: Record<string, unknown> } | "hang";
}

/** Installs the document routes; returns the live documents so a test can read what was confirmed. */
export async function mockDocumentsApi(page: Page, { docs, upload }: Options) {
  const find = (id: string | undefined) => docs.find((d) => d.id === id);
  const idOf = (route: Route, offset = 1) => new URL(route.request().url()).pathname.split("/").at(-offset);
  const json = (d: MockDocument) => {
    const { file, ...rest } = d;
    void file;
    return rest;
  };

  await page.route(/\/api\/v1\/steps\/[0-9a-f-]{36}\/documents$/, async (route) => {
    const stepId = idOf(route, 2);
    if (route.request().method() === "GET") {
      return route.fulfill({ json: docs.filter((d) => d.stepId === stepId).map(json) });
    }
    const body = route.request().postDataBuffer()?.toString("latin1") ?? "";
    const name = /filename="([^"]+)"/.exec(body)?.[1] ?? "dosya.pdf";
    const answer = upload?.({ name, size: body.length }) ?? { status: 202 };
    if (answer === "hang") return;
    if (answer.status !== 202) return problem(route, answer.status, answer.body ?? {});
    const created = mockDocument("reading", stepId ?? "", {
      id: `60000000-0000-4000-8000-0000000001${String(docs.length).padStart(2, "0")}`,
      originalName: name,
      createdAt: new Date().toISOString(),
    });
    docs.unshift(created);
    return route.fulfill({ status: 202, json: json(created) });
  });

  await page.route(/\/api\/v1\/documents\/[0-9a-f-]{36}$/, (route) => {
    const doc = find(idOf(route));
    return doc ? route.fulfill({ json: json(doc) }) : problem(route, 404, { type: "urn:tekpas:problem:not-found", title: "Not found" });
  });

  await page.route(/\/api\/v1\/documents\/[0-9a-f-]{36}\/file(\?.*)?$/, (route) => {
    const doc = find(idOf(route, 2));
    if (!doc) return problem(route, 404, { type: "urn:tekpas:problem:not-found", title: "Not found" });
    return route.fulfill({
      status: 200,
      contentType: MIME[path.extname(doc.file)] ?? "application/octet-stream",
      body: readFileSync(path.join(FILES, doc.file)),
    });
  });

  await page.route(/\/api\/v1\/documents\/[0-9a-f-]{36}\/verify$/, (route) => {
    const doc = find(idOf(route, 2));
    if (!doc) return problem(route, 404, { type: "urn:tekpas:problem:not-found", title: "Not found" });
    const body = route.request().postDataJSON();
    Object.assign(doc, {
      reviewStatus: "VERIFIED",
      docType: body.docType,
      certNo: body.certNo ?? null,
      holderName: body.holderName ?? null,
      issuer: body.issuer ?? null,
      validFrom: body.validFrom ?? null,
      validUntil: body.validUntil ?? null,
      verifiedByName: "Elif Yılmaz",
      verifiedAt: new Date().toISOString(),
    });
    return route.fulfill({ json: json(doc) });
  });

  await page.route(/\/api\/v1\/documents\/[0-9a-f-]{36}\/reread$/, (route) => {
    const doc = find(idOf(route, 2));
    if (!doc) return problem(route, 404, { type: "urn:tekpas:problem:not-found", title: "Not found" });
    Object.assign(doc, { extractionStatus: "RUNNING", failureCode: null, extractionMethod: null, createdAt: new Date().toISOString() });
    return route.fulfill({ status: 202, json: json(doc) });
  });

  return docs;
}
