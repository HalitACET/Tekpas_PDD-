"use client";

import type { components } from "@tekpas/api-client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { type BatchListFilters, queryKeys } from "@/lib/query-keys";
import { unwrap } from "./request";

export type BatchResponse = components["schemas"]["BatchResponse"];
export type BatchCreateRequest = components["schemas"]["BatchCreateRequest"];
export type BatchStatusCounts = components["schemas"]["BatchStatusCounts"];
export type ChainResponse = components["schemas"]["ChainResponse"];
export type ChainStep = components["schemas"]["ChainStepResponse"];
export type CreatedDataRequest = components["schemas"]["CreatedDataRequest"];
export type DataRequestSummary = components["schemas"]["DataRequestSummary"];
export type StepData = components["schemas"]["StepData"];

/** Like the product list: no paging in the design, one page of up to 100 batches, newest change first. */
export const BATCH_PAGE_SIZE = 100;

export function useBatches(filters: BatchListFilters) {
  return useQuery({
    queryKey: queryKeys.batches.list(filters),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET("/api/v1/batches", {
          params: {
            query: {
              q: filters.q.trim() || undefined,
              status: filters.status || undefined,
              productId: filters.productId || undefined,
              supplierId: filters.supplierId || undefined,
              size: BATCH_PAGE_SIZE,
              sort: "updatedAt,desc",
            },
          },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** Batches per status for the list's tabs (v0.3.1 22): all of the company's, whatever the list's filters. */
export function useBatchStatusCounts() {
  return useQuery({
    queryKey: queryKeys.batches.statusCounts(),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/batches/status-counts", { signal })),
  });
}

/**
 * The next KP-YYYY-MMDD-<letter> number of today, to prefill the form. Only a suggestion: it is not
 * reserved, so it is fetched fresh each time the dialog opens.
 */
export function useNextBatchNo(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.batches.nextBatchNo(),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/batches/next-batch-no", { signal })).then((r) => r.batchNo),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCreateBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BatchCreateRequest) => unwrap(api.POST("/api/v1/batches", { body })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
      // The product list shows a batch count per product.
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    },
  });
}

/** One batch (design v0.3 09). Another company's batch is a 404, like a missing one. */
export function useBatch(id: string) {
  return useQuery({
    queryKey: queryKeys.batches.detail(id),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/batches/{id}", { params: { path: { id } }, signal })),
  });
}

/** The batch's supply chain: steps in chain order with their suppliers and inputs. */
export function useBatchChain(id: string) {
  return useQuery({
    queryKey: queryKeys.batches.chain(id),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/batches/{id}/chain", { params: { path: { id } }, signal })),
  });
}

/** v0.3.1 26: the default five-step chain for a batch that has none. */
export function useCreateDefaultChain(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/batches/{id}/chain", { params: { path: { id } } })),
    onSuccess: (chain) => {
      queryClient.setQueryData(queryKeys.batches.chain(id), chain);
      // The list's chain bar, the batch itself (its summary) and the tasks change too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });
}

/** v0.3 08: how many steps the new batch gets, copied from the product's last batch (or the default chain). */
export function useChainPreview(productId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.products.chainPreview(productId ?? ""),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/api/v1/products/{id}/chain-preview", { params: { path: { id: productId ?? "" } }, signal })),
    enabled: productId !== undefined && productId !== "",
  });
}

/** v0.3.1 25: assign a supplier of the network to an empty step (PATCH /steps/{id}). */
export function useAssignSupplier(batchId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ stepId, supplierId }: { stepId: string; supplierId: string }) =>
      unwrap(api.PATCH("/api/v1/steps/{id}", { params: { path: { id: stepId } }, body: { supplierId } })),
    onSuccess: (chain) => {
      queryClient.setQueryData(queryKeys.batches.chain(batchId), chain);
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      // The supplier list counts batches per supplier.
      void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
    },
  });
}

/**
 * After a change to a step: the chain answer replaces the cached one; the batch (stage, list bar) and the
 * tasks follow from the server.
 */
function useChainChanged(batchId: string) {
  const queryClient = useQueryClient();
  return (chain?: ChainResponse) => {
    if (chain) queryClient.setQueryData(queryKeys.batches.chain(batchId), chain);
    void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  };
}

/** v0.4 46a: a link for the step (its open one is revoked); the token is only in this answer. */
export function useCreateDataRequest(batchId: string) {
  const changed = useChainChanged(batchId);
  return useMutation({
    mutationFn: ({ stepId, validDays }: { stepId: string; validDays?: number }) =>
      unwrap(api.POST("/api/v1/steps/{id}/requests", { params: { path: { id: stepId } }, body: { validDays } })),
    onSuccess: () => changed(),
  });
}

/** v0.4 46a: another deadline, 3, 7 or 14 days from the link's creation. */
export function useChangeDeadline(batchId: string) {
  const changed = useChainChanged(batchId);
  return useMutation({
    mutationFn: ({ requestId, validDays }: { requestId: string; validDays: number }) =>
      unwrap(api.PATCH("/api/v1/requests/{id}", { params: { path: { id: requestId } }, body: { validDays } })),
    onSuccess: () => changed(),
  });
}

/** v0.4 46b/c. */
export function useRevokeDataRequest(batchId: string) {
  const changed = useChainChanged(batchId);
  return useMutation({
    mutationFn: (requestId: string) =>
      unwrap(api.POST("/api/v1/requests/{id}/revoke", { params: { path: { id: requestId } } })),
    onSuccess: () => changed(),
  });
}

/** v0.4 47a "Adımı onayla". */
export function useApproveStep(batchId: string) {
  const changed = useChainChanged(batchId);
  return useMutation({
    mutationFn: (stepId: string) => unwrap(api.POST("/api/v1/steps/{id}/approve", { params: { path: { id: stepId } } })),
    onSuccess: (chain) => changed(chain),
  });
}

/** v0.4 47b "Düzeltme talebini gönder": reason and the fields to mark on the supplier's form. */
export function useRejectStep(batchId: string) {
  const changed = useChainChanged(batchId);
  return useMutation({
    mutationFn: ({ stepId, reason, fields }: { stepId: string; reason: string; fields: string[] }) =>
      unwrap(api.POST("/api/v1/steps/{id}/reject", { params: { path: { id: stepId } }, body: { reason, fields } })),
    onSuccess: (chain) => changed(chain),
  });
}

/** The fibre origin, the manufacturer's own declaration: approved on saving (PLAN M4). */
export function useSaveOrigin(batchId: string) {
  const changed = useChainChanged(batchId);
  return useMutation({
    mutationFn: ({ stepId, data }: { stepId: string; data: StepData }) =>
      unwrap(api.PATCH("/api/v1/steps/{id}", { params: { path: { id: stepId } }, body: { data } })),
    onSuccess: (chain) => changed(chain),
  });
}

