import type { BatchStatus, ProductCategory } from "@tekpas/shared";

/** Every TanStack Query key of the app, in one place (web/CLAUDE.md). */
export interface ProductListFilters {
  q: string;
  category: ProductCategory | "";
}

export interface BatchListFilters {
  q: string;
  status: BatchStatus | "";
  productId: string;
}

export const queryKeys = {
  products: {
    all: ["products"] as const,
    lists: () => [...queryKeys.products.all, "list"] as const,
    list: (filters: ProductListFilters) => [...queryKeys.products.lists(), filters] as const,
    total: () => [...queryKeys.products.all, "total"] as const,
    detail: (id: string) => [...queryKeys.products.all, "detail", id] as const,
    byGtin: (gtin: string) => [...queryKeys.products.all, "gtin", gtin] as const,
  },
  batches: {
    all: ["batches"] as const,
    lists: () => [...queryKeys.batches.all, "list"] as const,
    list: (filters: BatchListFilters) => [...queryKeys.batches.lists(), filters] as const,
    nextBatchNo: () => [...queryKeys.batches.all, "next-batch-no"] as const,
    /** Under batches.all: any batch change (create, delete, status) refreshes the tab counts too. */
    statusCounts: () => [...queryKeys.batches.all, "status-counts"] as const,
  },
};
