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
      // The list's chain bar and the batch itself (its summary) change too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
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
      // The supplier list counts batches per supplier.
      void queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
    },
  });
}
