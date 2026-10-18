import type { Page } from "@playwright/test";

/*
 * The supplier's link page (design v0.4 39–45) talks to GET /public/request and POST /public/request/submit
 * with the token in the X-Request-Token header, and to nothing else (no session, no refresh).
 */

/** The page's clock: ten days into October, as in the design (deadline 17 October, "7 gün kaldı"). */
export const SUPPLIER_NOW = new Date(2026, 9, 10, 14, 30);
export const TOKEN = "Vq3xT9kLm2PbH7sYdE4wRz1NfJc6UaGoKi0XtBe8MhS";

type StepType = "YARN" | "FABRIC" | "DYEING" | "SEWING";

export function publicView(stepType: StepType, extra: Record<string, unknown> = {}) {
  return {
    code: "KP-R-7HQ2",
    manufacturerName: "Karaca Tekstil A.Ş.",
    requesterName: "Elif Yılmaz",
    productName: "Organik pamuk tişört, ekru",
    batchNo: "KP-2026-0918-A",
    stepType,
    expiresAt: new Date(2026, 9, 17, 14, 30).toISOString(),
    data: {},
    documents: [],
    aiReading: false,
    ...extra,
  };
}

/** A correction request (design 45): the previous yarn data and the reason, the fibre composition marked. */
export function correctionView() {
  return publicView("YARN", {
    data: {
      fiberComposition: [
        { fiber: "COTTON", percent: 80 },
        { fiber: "POLYESTER", percent: 20 },
      ],
      originCountry: "TR",
      energySources: [
        { source: "GRID", percent: 60 },
        { source: "SOLAR", percent: 40 },
      ],
      energyKwhPerKg: 3.4,
      deliveredKg: 640,
      yarnCount: "Ne 30/1",
      yarnProcess: "CARDED",
    },
    rejection: {
      reason:
        "Teknik föyde lif oranı %80 pamuk · %20 polyester görünüyor; etiket beyanımız %95 pamuk · %5 elastan. Teslim ettiğiniz ipliğin lif oranını kontrol edip doğru değeri girer misiniz?",
      fields: ["fiberComposition"],
      at: new Date(2026, 9, 8, 15, 12).toISOString(),
      byName: "Elif Yılmaz",
    },
  });
}

export const LINK = {
  manufacturerName: "Karaca Tekstil A.Ş.",
  requesterName: "Elif Yılmaz",
  stepType: "YARN",
  expiresAt: new Date(2026, 9, 17, 14, 30).toISOString(),
};

export interface Closed {
  status: 404 | 410;
  reason: "LINK_INVALID" | "LINK_EXPIRED" | "LINK_REVOKED" | "ALREADY_SUBMITTED";
  link?: Record<string, unknown>;
}

export interface PublicMock {
  /** How often the link was opened (GET). */
  opens: number;
  tokens: (string | null)[];
  urls: string[];
  submits: { token: string | null; body: unknown }[];
}

/**
 * Answers the public API. `view` opens; `closed` answers 404 or 410 instead. A submit answers like the API does,
 * or with `submitProblem` (status and body of a problem).
 */
export async function mockPublicRequest(
  page: Page,
  { view, closed, submitProblem }: { view?: object; closed?: Closed; submitProblem?: { status: number; body: object } },
): Promise<PublicMock> {
  const state: PublicMock = { opens: 0, tokens: [], urls: [], submits: [] };
  await page.route("**/api/health", (route) => route.fulfill({ json: { status: "UP" } }));
  await page.route(/\/api\/v1\/public\/request$/, (route) => {
    state.opens++;
    state.tokens.push(route.request().headers()["x-request-token"] ?? null);
    state.urls.push(route.request().url());
    if (closed) {
      return route.fulfill({
        status: closed.status,
        contentType: "application/problem+json",
        json: {
          type: closed.status === 404 ? "urn:tekpas:problem:link-invalid" : "urn:tekpas:problem:link-gone",
          title: closed.status === 404 ? "Not Found" : "Gone",
          status: closed.status,
          reason: closed.reason,
          ...(closed.link ? { link: closed.link } : {}),
        },
      });
    }
    return route.fulfill({ json: view });
  });
  await page.route(/\/api\/v1\/public\/request\/submit$/, (route) => {
    state.submits.push({ token: route.request().headers()["x-request-token"] ?? null, body: route.request().postDataJSON() });
    if (submitProblem) {
      return route.fulfill({ status: submitProblem.status, contentType: "application/problem+json", json: submitProblem.body });
    }
    return route.fulfill({
      json: { code: "KP-R-7HQ2", submittedAt: new Date(2026, 9, 10, 14, 32).toISOString(), manufacturerName: "Karaca Tekstil A.Ş." },
    });
  });
  return state;
}

/*
 * The Documents section (design v0.5 49–55) talks to POST /public/request/documents (multipart, one file) and
 * DELETE /public/request/documents/{id}, with the token in the X-Request-Token header like everything else.
 */

/** What the mocked server does with a file, by its name. Default: accepts it. */
export type UploadBehaviour =
  | { accept: true }
  | { problem: { status: number; body: object } }
  /** The connection drops. */
  | { abort: true; delayMs?: number }
  /** The answer waits until `release()` is called (to look at the uploading state). */
  | { hold: Promise<void> };

export interface DocumentsMock {
  uploads: { token: string | null; url: string; name: string; bytes: number }[];
  deletes: { token: string | null; url: string; id: string }[];
}

/** A rejected file as the API words it (field `file`, a code), see UploadRejectedException. */
export function fileProblem(status: number, code: string): { status: number; body: object } {
  return {
    status,
    body: {
      type: "urn:tekpas:problem:validation",
      title: "Validation failed",
      status,
      errors: [{ field: "file", code, message: code }],
    },
  };
}

/** A conflict: DUPLICATE_DOCUMENT or DOCUMENT_LIMIT. */
export function conflictProblem(reason: "DUPLICATE_DOCUMENT" | "DOCUMENT_LIMIT") {
  return { status: 409, body: { type: "urn:tekpas:problem:conflict", title: "Conflict", status: 409, reason } };
}

export const tooManyRequests = { status: 429, body: { type: "urn:tekpas:problem:rate-limited", title: "Too Many Requests", status: 429 } };

export function closedProblem(reason: "LINK_EXPIRED" | "LINK_REVOKED" | "ALREADY_SUBMITTED") {
  return { status: 410, body: { type: "urn:tekpas:problem:link-gone", title: "Gone", status: 410, reason } };
}

/**
 * Answers the two document calls. `behave(name, attempt)` decides per file (attempt counts that name's uploads
 * from 1); the default is to accept. `onDelete` can refuse a removal.
 */
export async function mockPublicDocuments(
  page: Page,
  {
    behave = () => ({ accept: true }),
    onDelete,
  }: { behave?: (name: string, attempt: number) => UploadBehaviour; onDelete?: () => { status: number; body?: object } | undefined } = {},
): Promise<DocumentsMock> {
  const state: DocumentsMock = { uploads: [], deletes: [] };
  const attempts = new Map<string, number>();
  let counter = 0;
  await page.route(/\/api\/v1\/public\/request\/documents$/, async (route) => {
    const request = route.request();
    const buffer = request.postDataBuffer() ?? Buffer.alloc(0);
    const name = /filename="([^"]*)"/.exec(buffer.subarray(0, 600).toString("latin1"))?.[1] ?? "";
    // The file name travels as UTF-8 bytes in the part header.
    const utf8Name = /filename="([^"]*)"/.exec(buffer.subarray(0, 600).toString("utf8"))?.[1] ?? name;
    const boundary = /boundary=(.+)$/.exec(request.headers()["content-type"] ?? "")?.[1] ?? "";
    const headerEnd = buffer.indexOf("\r\n\r\n");
    const bytes = Math.max(0, buffer.length - (headerEnd + 4) - `\r\n--${boundary}--\r\n`.length);
    state.uploads.push({ token: request.headers()["x-request-token"] ?? null, url: request.url(), name: utf8Name, bytes });
    const attempt = (attempts.get(utf8Name) ?? 0) + 1;
    attempts.set(utf8Name, attempt);
    const what = behave(utf8Name, attempt);
    if ("abort" in what) {
      if (what.delayMs) await new Promise((resolve) => setTimeout(resolve, what.delayMs));
      return route.abort("connectionreset");
    }
    if ("hold" in what) await what.hold;
    if ("problem" in what) {
      return route.fulfill({ status: what.problem.status, contentType: "application/problem+json", json: what.problem.body });
    }
    counter++;
    return route.fulfill({
      status: 201,
      json: {
        id: `d0c00000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
        fileName: utf8Name,
        sizeBytes: bytes,
        previous: false,
        uploadedAt: new Date(2026, 9, 10, 14, 31).toISOString(),
      },
    });
  });
  await page.route(/\/api\/v1\/public\/request\/documents\/[0-9a-f-]+$/, (route) => {
    const request = route.request();
    state.deletes.push({
      token: request.headers()["x-request-token"] ?? null,
      url: request.url(),
      id: request.url().split("/").at(-1)!,
    });
    const refusal = onDelete?.();
    if (refusal) {
      return route.fulfill({ status: refusal.status, contentType: "application/problem+json", json: refusal.body ?? {} });
    }
    return route.fulfill({ status: 204 });
  });
  return state;
}

/** A stored document of the view (what `documents` of the opened link holds). */
export function publicDocument(name: string, sizeBytes: number, { previous = false, at = new Date(2026, 9, 10, 14, 31) } = {}) {
  return {
    id: `${Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`,
    fileName: name,
    sizeBytes,
    previous,
    uploadedAt: at.toISOString(),
  };
}

/**
 * A correction request about the documents (design v0.5 55a/55b): the earlier submission's files are read-only,
 * the Documents section is the field to correct, nothing else is.
 */
export function documentsCorrectionView(kind: "unreadable" | "expired", previous: ReturnType<typeof publicDocument>[]) {
  const base = correctionView();
  return {
    ...base,
    documents: previous,
    rejection: {
      reason:
        kind === "unreadable"
          ? "Belge okunaksız. Yüklediğiniz teknik föy fotoğrafı bulanık, değerler okunamıyor. PDF hâlini ya da daha net bir fotoğrafını yükler misiniz?"
          : "Sertifika süresi dolmuş. OEKO-TEX sertifikanızın süresi 15 Ekim 2026’da dolmuş. Yenilenmiş sertifikayı yükler misiniz?",
      fields: ["documents"],
      at: new Date(2026, 9, 8, 15, 12).toISOString(),
      byName: "Elif Yılmaz",
    },
  };
}
