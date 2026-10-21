import type { components } from "@tekpas/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import { api } from "./session";

export type DocumentResponse = components["schemas"]["DocumentResponse"];
export type VerifyRequest = components["schemas"]["VerifyDocumentRequest"];
export type BatchResponse = components["schemas"]["BatchResponse"];
export type ChainStep = components["schemas"]["ChainResponse"]["steps"][number];

/** An answer that is not 2xx, with what the error box shows. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly reason?: string,
    readonly requestId?: string,
    /** RFC 7807 field errors (CLAUDE.md rule 7), on a 400. */
    readonly errors?: { field: string; message?: string }[],
  ) {
    super(`HTTP ${status}`);
  }
}

async function unwrap<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok || data === undefined) {
    const problem = error as { reason?: string; requestId?: string; errors?: { field: string; message?: string }[] } | undefined;
    throw new ApiError(
      response.status,
      problem?.reason,
      response.headers.get("X-Request-Id") ?? problem?.requestId,
      problem?.errors,
    );
  }
  return data;
}

export function useTasks(enabled = true) {
  return useQuery({
    queryKey: queryKeys.tasks.all,
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/tasks", { signal })),
    enabled,
  });
}

export function useAwaitingDocuments(enabled = true) {
  return useQuery({
    queryKey: queryKeys.documents.awaiting(),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/documents/awaiting-review", { signal })),
    enabled,
  });
}

export function useExpiringCertificates(enabled = true) {
  return useQuery({
    queryKey: queryKeys.certificates.expiring,
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/documents/expiring", { params: { query: { days: 30 } }, signal })),
    enabled,
  });
}

export function useBatches(q: string) {
  return useQuery({
    queryKey: queryKeys.batches.list(q),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/api/v1/batches", { params: { query: { q: q || undefined, size: 50 } }, signal })),
  });
}

export function useChain(batchId: string) {
  return useQuery({
    queryKey: queryKeys.batches.chain(batchId),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/batches/{id}/chain", { params: { path: { id: batchId } }, signal })),
  });
}

/** A document; while it is being read it is asked for again every two seconds. */
export function useDocument(id: string) {
  return useQuery({
    queryKey: queryKeys.documents.detail(id),
    queryFn: ({ signal }): Promise<DocumentResponse> =>
      unwrap(api.GET("/api/v1/documents/{id}", { params: { path: { id } }, signal })),
    refetchInterval: (query) => {
      const status = query.state.data?.extractionStatus;
      return status === "QUEUED" || status === "RUNNING" ? 2000 : false;
    },
  });
}

/** "Onayla": the person's values become the document's (CLAUDE.md rule 5). */
export function useVerifyDocument(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: VerifyRequest) =>
      unwrap(api.POST("/api/v1/documents/{id}/verify", { params: { path: { id } }, body })),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.documents.all });
      void client.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}
