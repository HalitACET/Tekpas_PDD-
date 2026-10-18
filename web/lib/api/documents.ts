"use client";

import type { components } from "@tekpas/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { currentAccessToken, refreshAccessToken, api } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query-keys";
import { ApiError, unwrap } from "./request";

export type DocumentResponse = components["schemas"]["DocumentResponse"];
export type VerifyDocumentRequest = components["schemas"]["VerifyDocumentRequest"];

/** The reading runs in the background; the panel asks again every 1.5 s until it ends (docs/m5-plan.md §3). */
export const READING_POLL_MS = 1500;

export const isReading = (doc: Pick<DocumentResponse, "extractionStatus">) =>
  doc.extractionStatus === "QUEUED" || doc.extractionStatus === "RUNNING";

/** The documents of a step, newest first (at most 10). */
export function useStepDocuments(stepId: string) {
  return useQuery({
    queryKey: queryKeys.documents.ofStep(stepId),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/steps/{id}/documents", { params: { path: { id: stepId } }, signal })),
    refetchInterval: (query) => (query.state.data?.some(isReading) ? READING_POLL_MS : false),
  });
}

/** One document; it keeps asking while it is being read. `initial` is the card the person opened. */
export function useDocument(id: string, initial?: DocumentResponse) {
  return useQuery({
    queryKey: queryKeys.documents.detail(id),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/documents/{id}", { params: { path: { id } }, signal })),
    initialData: initial,
    // The list's copy is as fresh as the card; ask once more when the dialog opens.
    initialDataUpdatedAt: 0,
    refetchInterval: (query) => (query.state.data && isReading(query.state.data) ? READING_POLL_MS : false),
  });
}

/**
 * After a change to a document: its own copy and the step's list are replaced, and what counts documents
 * (the chain's dot, the suppliers' certificate chips) follows from the server.
 */
function useDocumentChanged(stepId: string) {
  const queryClient = useQueryClient();
  return (doc?: DocumentResponse) => {
    if (doc) {
      queryClient.setQueryData(queryKeys.documents.detail(doc.id), doc);
      queryClient.setQueryData<DocumentResponse[]>(queryKeys.documents.ofStep(stepId), (list) =>
        list?.map((d) => (d.id === doc.id ? doc : d)),
      );
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.documents.ofStep(stepId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  };
}

/** "Onayla": the person's values become the document's real fields (OWNER and ADMIN). */
export function useVerifyDocument(stepId: string) {
  const changed = useDocumentChanged(stepId);
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: VerifyDocumentRequest }) =>
      unwrap(api.POST("/api/v1/documents/{id}/verify", { params: { path: { id } }, body })),
    onSuccess: (doc) => changed(doc),
  });
}

/** "Tekrar oku": a failed reading goes back in the queue. */
export function useRereadDocument(stepId: string) {
  const changed = useDocumentChanged(stepId);
  return useMutation({
    mutationFn: (id: string) => unwrap(api.POST("/api/v1/documents/{id}/reread", { params: { path: { id } } })),
    onSuccess: (doc) => changed(doc),
  });
}

/** Called once an upload became a document. */
export function useDocumentUploaded(stepId: string) {
  const changed = useDocumentChanged(stepId);
  return () => changed();
}

/**
 * The file's bytes for the preview. The endpoint wants the bearer token and answers with a redirect to a 60
 * second signed link (the redirect drops the header), so the browser cannot show it with a plain `src`: it is
 * fetched here and shown from a blob URL. The blob is typed with the type the server found in the bytes, not
 * with the storage's header.
 */
export function useDocumentFile(id: string, mimeType: string) {
  return useQuery({
    queryKey: queryKeys.documents.file(id),
    queryFn: async ({ signal }) => {
      const bytes = await unwrap<Blob>(
        api.GET("/api/v1/documents/{id}/file", { params: { path: { id } }, parseAs: "blob", signal }) as never,
      );
      return new Blob([bytes], { type: mimeType });
    },
    staleTime: Infinity,
    gcTime: 60_000,
    retry: 1,
  });
}

/**
 * Uploads one file to a step and reports the progress. The API client wraps `fetch`, which cannot report how much
 * of a request body is sent; this one call uses XMLHttpRequest with the same bearer token (and the same single
 * refresh on a 401). Answers 202 with the new document, or throws an ApiError / a TypeError (no connection).
 */
export function uploadStepDocument(
  stepId: string,
  file: File,
  { onProgress, signal }: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<DocumentResponse> {
  const send = () =>
    new Promise<{ status: number; text: string; requestId?: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/v1/steps/${encodeURIComponent(stepId)}/documents`);
      const token = currentAccessToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("Accept", "application/json");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
      };
      xhr.onload = () =>
        resolve({ status: xhr.status, text: xhr.responseText, requestId: xhr.getResponseHeader("X-Request-Id") ?? undefined });
      xhr.onerror = () => reject(new TypeError("Network error"));
      xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
      signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      const body = new FormData();
      body.append("file", file);
      xhr.send(body);
    });

  return (async () => {
    let answer = await send();
    if (answer.status === 401 && (await refreshAccessToken())) answer = await send();
    const json: unknown = (() => {
      try {
        return JSON.parse(answer.text);
      } catch {
        return undefined;
      }
    })();
    if (answer.status < 200 || answer.status >= 300) {
      const problem = typeof json === "object" && json !== null && "type" in json ? (json as ApiError["problem"]) : undefined;
      throw new ApiError(answer.status, problem, answer.requestId ?? problem?.requestId ?? undefined);
    }
    onProgress?.(100);
    return json as DocumentResponse;
  })();
}
