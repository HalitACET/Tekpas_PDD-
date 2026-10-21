import type { components } from "@tekpas/api-client";
import { API_URL } from "./config";
import { api, currentAccessToken, refreshSession } from "./session";

export type DocumentResponse = components["schemas"]["DocumentResponse"];
export type DocType = DocumentResponse["docType"];

/** The pages of one document, at most this many, and their size together (the server says the same). */
export const MAX_PAGES = 10;
export const MAX_BYTES = 10 * 1024 * 1024;

/** A page as React Native's FormData takes a file: its local address, a name and a type. */
interface FilePart {
  uri: string;
  name: string;
  type: string;
}

export type UploadResult =
  | { ok: true; document: DocumentResponse }
  | { ok: false; status?: number; reason?: string; field?: string; code?: string; requestId?: string; aborted?: boolean };

export interface UploadOptions {
  docType?: DocType;
  /** 0–1, as the bytes leave the phone (design v0.8 97a). */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
  /** The upload queue's key (M9): the server never makes a second document for it (200 answers the first one). */
  idempotencyKey?: string;
  /** Tests: the request class. */
  xhr?: () => XMLHttpRequest;
}

/**
 * POST /steps/{id}/documents/photos: the pages in their order, joined into one PDF by the server (docs/m8-plan.md
 * §3.1). XMLHttpRequest, not fetch, because it reports upload progress. A 401 refreshes the session once and sends
 * again. A failure keeps nothing on the server; the pages stay on the phone for "Tekrar dene".
 */
export async function uploadPhotos(stepId: string, pages: { uri: string }[], options: UploadOptions = {}): Promise<UploadResult> {
  const first = await send(stepId, pages, options);
  if (!first.ok && first.status === 401 && (await refreshSession())) {
    return send(stepId, pages, options);
  }
  return first;
}

function send(stepId: string, pages: { uri: string }[], options: UploadOptions): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = options.xhr?.() ?? new XMLHttpRequest();
    const query = options.docType ? `?docType=${encodeURIComponent(options.docType)}` : "";
    xhr.open("POST", `${API_URL}/api/v1/steps/${encodeURIComponent(stepId)}/documents/photos${query}`);
    const token = currentAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/json");
    if (options.idempotencyKey) xhr.setRequestHeader("Idempotency-Key", options.idempotencyKey);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let body: Record<string, unknown> | undefined;
      try {
        body = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : undefined;
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) {
        options.onProgress?.(1);
        resolve({ ok: true, document: body as unknown as DocumentResponse });
        return;
      }
      const error = (body?.errors as { field?: string; code?: string }[] | undefined)?.[0];
      resolve({
        ok: false,
        status: xhr.status,
        reason: body?.reason as string | undefined,
        field: error?.field,
        code: error?.code,
        requestId: (body?.requestId as string | undefined) ?? xhr.getResponseHeader("X-Request-Id") ?? undefined,
      });
    };
    xhr.onerror = () => resolve({ ok: false });
    xhr.ontimeout = () => resolve({ ok: false });
    xhr.onabort = () => resolve({ ok: false, aborted: true });
    options.signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    pages.forEach((page, i) => {
      const part: FilePart = { uri: page.uri, name: `page-${i + 1}.jpg`, type: "image/jpeg" };
      form.append("pages", part as unknown as Blob);
    });
    xhr.send(form);
  });
}

/** The reading is over once the document is no longer queued or being read. */
export function readingDone(document: Pick<DocumentResponse, "extractionStatus">): boolean {
  return document.extractionStatus !== "QUEUED" && document.extractionStatus !== "RUNNING";
}

export interface WaitOptions {
  intervalMs?: number;
  /** After this long the screen offers to fill the form by hand; the waiting goes on. */
  slowAfterMs?: number;
  onSlow?: () => void;
  /** After this long without an answer the waiting stops (the document stays; the task list shows it later). */
  giveUpAfterMs?: number;
  signal?: AbortSignal;
  /** Tests: the clock and the pause between polls. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Polls GET /documents/{id} every second until the reading is over (docs/m8-plan.md §4, decision 4) and answers with
 * the document as it is then. A failed poll is tried again; aborting, or two minutes without an end, stops it and
 * answers undefined.
 */
export async function waitForReading(documentId: string, options: WaitOptions = {}): Promise<DocumentResponse | undefined> {
  const { intervalMs = 1000, slowAfterMs = 20_000, giveUpAfterMs = 120_000, onSlow, signal } = options;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const started = now();
  let warned = false;
  while (!signal?.aborted && now() - started < giveUpAfterMs) {
    try {
      const { data } = await api.GET("/api/v1/documents/{id}", { params: { path: { id: documentId } }, signal });
      if (data && readingDone(data)) return data;
    } catch {
      // A lost poll on a weak connection: the next one tries again.
    }
    if (!warned && now() - started >= slowAfterMs) {
      warned = true;
      onSlow?.();
    }
    await sleep(intervalMs);
  }
  return undefined;
}

/** The certificate types: confirming one needs its number and its end of validity (the server's rule too). */
export const CERTIFICATE_TYPES: DocType[] = ["OEKO_TEX", "GOTS", "GRS", "BCI", "OCS", "BLUESIGN"];

/** The types offered at the review (design v0.8 96a); "Bilmiyorum" leaves the type to the reading. */
export const QUICK_TYPES: DocType[] = ["GOTS", "OEKO_TEX", "GRS", "INVOICE"];
