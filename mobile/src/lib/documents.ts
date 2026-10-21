import type { components } from "@tekpas/api-client";
import { api } from "./session";

export type DocumentResponse = components["schemas"]["DocumentResponse"];
export type DocType = DocumentResponse["docType"];

/** The pages of one document, at most this many (the server says the same). */
export const MAX_PAGES = 10;

/** A page as React Native's FormData takes a file: its local address, a name and a type. */
interface FilePart {
  uri: string;
  name: string;
  type: string;
}

export type UploadResult =
  | { ok: true; document: DocumentResponse }
  | { ok: false; status?: number; reason?: string; requestId?: string };

/**
 * POST /steps/{id}/documents/photos: the pages in their order, joined into one PDF by the server (docs/m8-plan.md
 * §3.1). A failure keeps nothing on the server; the pages stay on the phone for "Tekrar dene".
 */
export async function uploadPhotos(stepId: string, pages: { uri: string }[], docType?: DocType): Promise<UploadResult> {
  const form = new FormData();
  pages.forEach((page, i) => {
    const part: FilePart = { uri: page.uri, name: `page-${i + 1}.jpg`, type: "image/jpeg" };
    form.append("pages", part as unknown as Blob);
  });
  try {
    const { data, error, response } = await api.POST("/api/v1/steps/{id}/documents/photos", {
      params: { path: { id: stepId }, query: docType ? { docType } : {} },
      // multipart: the body goes as it is, the boundary is set by fetch.
      body: form as never,
      bodySerializer: (body) => body as unknown as FormData,
    });
    if (data) return { ok: true, document: data };
    const problem = error as { reason?: string; requestId?: string } | undefined;
    return { ok: false, status: response.status, reason: problem?.reason, requestId: problem?.requestId };
  } catch {
    return { ok: false };
  }
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
