"use client";

import type { components } from "@tekpas/api-client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { type BatchListFilters, queryKeys } from "@/lib/query-keys";
import { unwrap } from "./request";

export type BatchResponse = components["schemas"]["BatchResponse"];
export type BatchCreateRequest = components["schemas"]["BatchCreateRequest"];
export type BatchStatusCounts = components["schemas"]["BatchStatusCounts"];

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
