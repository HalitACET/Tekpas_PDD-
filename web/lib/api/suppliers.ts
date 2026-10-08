"use client";

import type { components } from "@tekpas/api-client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { queryKeys, type SupplierListFilters } from "@/lib/query-keys";
import { unwrap } from "./request";

export type SupplierResponse = components["schemas"]["SupplierResponse"];
export type SupplierCreateRequest = components["schemas"]["SupplierCreateRequest"];
export type SupplierUpdateRequest = components["schemas"]["SupplierUpdateRequest"];

/** Like the other lists: no paging in the design, one page of up to 100 suppliers by name. */
export const SUPPLIER_PAGE_SIZE = 100;

export function useSuppliers(filters: SupplierListFilters) {
  return useQuery({
    queryKey: queryKeys.suppliers.list(filters),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET("/api/v1/suppliers", {
          params: {
            query: {
              q: filters.q.trim() || undefined,
              type: filters.type || undefined,
              size: SUPPLIER_PAGE_SIZE,
              sort: "name,asc",
            },
          },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
  });
}

/** One supplier of the own network (e.g. the name on the batch list's supplier filter). */
export function useSupplier(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.suppliers.detail(id ?? ""),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/suppliers/{id}", { params: { path: { id: id ?? "" } }, signal })),
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SupplierCreateRequest) => unwrap(api.POST("/api/v1/suppliers", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all }),
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: SupplierUpdateRequest }) =>
      unwrap(api.PATCH("/api/v1/suppliers/{id}", { params: { path: { id } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all }),
  });
}

export function useRemoveSupplier() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/api/v1/suppliers/{id}", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all }),
  });
}
