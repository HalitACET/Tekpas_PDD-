import type { components } from "@tekpas/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./query-keys";
import { api } from "./session";

export type DocumentResponse = components["schemas"]["DocumentResponse"];
export type VerifyRequest = components["schemas"]["VerifyDocumentRequest"];
export type BatchResponse = components["schemas"]["BatchResponse"];
export type ChainStep = components["schemas"]["ChainResponse"]["steps"][number];
export type ChainResponse = components["schemas"]["ChainResponse"];
export type CreatedDataRequest = components["schemas"]["CreatedDataRequest"];

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

export function useBatch(id: string) {
  return useQuery({
    queryKey: queryKeys.batches.detail(id),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/batches/{id}", { params: { path: { id } }, signal })),
    enabled: !!id,
  });
}

export function useBatchScore(id: string) {
  return useQuery({
    queryKey: queryKeys.batches.score(id),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/batches/{id}/score", { params: { path: { id } }, signal })),
  });
}

/** The company's batch behind a scanned code; 404 when it is not the company's (or unknown). */
export function lookupBatch(gtin: string, batchNo: string, signal?: AbortSignal): Promise<BatchResponse> {
  return unwrap(api.GET("/api/v1/batches/lookup", { params: { query: { gtin, batchNo } }, signal }));
}

export function useChain(batchId: string) {
  return useQuery({
    queryKey: queryKeys.batches.chain(batchId),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/batches/{id}/chain", { params: { path: { id: batchId } }, signal })),
    enabled: !!batchId,
  });
}

export function useStepDocuments(stepId: string) {
  return useQuery({
    queryKey: queryKeys.steps.documents(stepId),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/api/v1/steps/{id}/documents", { params: { path: { id: stepId } }, signal })),
    enabled: !!stepId,
  });
}

export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.suppliers.detail(id ?? ""),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/suppliers/{id}", { params: { path: { id: id! } }, signal })),
    enabled: !!id,
  });
}

/** OWNER and ADMIN approve what a supplier sent; the answer is the batch's chain after it. */
export function useApproveStep(stepId: string, batchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<ChainResponse> =>
      unwrap(api.POST("/api/v1/steps/{id}/approve", { params: { path: { id: stepId } } })),
    onSettled: () => invalidateReview(client, batchId),
  });
}

/** A correction request: the reason is required; marking single fields is the web's (docs/m9-plan.md §10). */
export function useRejectStep(stepId: string, batchId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (reason: string): Promise<ChainResponse> =>
      unwrap(api.POST("/api/v1/steps/{id}/reject", { params: { path: { id: stepId } }, body: { reason, fields: [] } })),
    onSettled: () => invalidateReview(client, batchId),
  });
}

/** A new link for the supplier after a correction request; the token is shown this once. */
export function createDataRequest(stepId: string): Promise<CreatedDataRequest> {
  return unwrap(api.POST("/api/v1/steps/{id}/requests", { params: { path: { id: stepId } }, body: {} }));
}

function invalidateReview(client: ReturnType<typeof useQueryClient>, batchId: string) {
  void client.invalidateQueries({ queryKey: queryKeys.tasks.all });
  void client.invalidateQueries({ queryKey: queryKeys.batches.chain(batchId) });
  void client.invalidateQueries({ queryKey: queryKeys.batches.detail(batchId) });
  void client.invalidateQueries({ queryKey: queryKeys.batches.score(batchId) });
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
