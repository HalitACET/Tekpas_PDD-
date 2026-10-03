"use client";

import type { components } from "@tekpas/api-client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { type ProductListFilters, queryKeys } from "@/lib/query-keys";
import { unwrap } from "./request";

export type ProductListItem = components["schemas"]["ProductListItem"];
export type ProductResponse = components["schemas"]["ProductResponse"];
export type ProductCreateRequest = components["schemas"]["ProductCreateRequest"];
export type ProductUpdateRequest = components["schemas"]["ProductUpdateRequest"];

/**
 * The design has no paging: one page of up to 100 products, newest change first. A longer list shows its
 * first 100 (PLAN.md, design debt).
 */
export const PRODUCT_PAGE_SIZE = 100;

export function useProducts(filters: ProductListFilters) {
  return useQuery({
    queryKey: queryKeys.products.list(filters),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET("/api/v1/products", {
          params: {
            query: {
              q: filters.q.trim() || undefined,
              category: filters.category || undefined,
              size: PRODUCT_PAGE_SIZE,
              sort: "updatedAt,desc",
            },
          },
          signal,
        }),
      ),
    // Typing in the search keeps the current rows on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
}

/** All products of the company, regardless of filters: the "7 / 7 ürün" counter's right-hand side. */
export function useProductTotal() {
  return useQuery({
    queryKey: queryKeys.products.total(),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/api/v1/products", { params: { query: { size: 1 } }, signal })).then((page) => page.totalElements),
  });
}

/** One product with its description (the list rows do not carry it), for the edit sheet. */
export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.products.detail(id ?? ""),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/products/{id}", { params: { path: { id: id ?? "" } }, signal })),
    enabled: id !== undefined,
  });
}

/**
 * Own product with exactly this (14-digit) GTIN, if any. The search also matches partial GTINs, so only an
 * exact match counts. Another company's GTIN is not visible here; the API answers 409 on save.
 */
export function useOwnProductWithGtin(gtin14: string | undefined) {
  return useQuery({
    queryKey: queryKeys.products.byGtin(gtin14 ?? ""),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/api/v1/products", { params: { query: { q: gtin14, size: 5 } }, signal })).then(
        (page) => page.content.find((p) => p.gtin === gtin14) ?? null,
      ),
    enabled: gtin14 !== undefined,
    staleTime: 5_000,
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ProductCreateRequest) => unwrap(api.POST("/api/v1/products", { body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ProductUpdateRequest }) =>
      unwrap(api.PATCH("/api/v1/products/{id}", { params: { path: { id } }, body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE("/api/v1/products/{id}", { params: { path: { id } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all }),
  });
}
