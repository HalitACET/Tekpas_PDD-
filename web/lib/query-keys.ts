import type { BatchStatus, ProductCategory, SupplierType } from "@tekpas/shared";

/** Every TanStack Query key of the app, in one place (web/CLAUDE.md). */
export interface ProductListFilters {
  q: string;
  category: ProductCategory | "";
}

export interface BatchListFilters {
  q: string;
  status: BatchStatus | "";
  productId: string;
  supplierId: string;
}

export interface SupplierListFilters {
  q: string;
  type: SupplierType | "";
}

export const queryKeys = {
  products: {
    all: ["products"] as const,
    lists: () => [...queryKeys.products.all, "list"] as const,
    list: (filters: ProductListFilters) => [...queryKeys.products.lists(), filters] as const,
    total: () => [...queryKeys.products.all, "total"] as const,
    detail: (id: string) => [...queryKeys.products.all, "detail", id] as const,
    /** How many steps a new batch of the product gets (v0.3 08). */
    chainPreview: (id: string) => [...queryKeys.products.all, "chain-preview", id] as const,
    byGtin: (gtin: string) => [...queryKeys.products.all, "gtin", gtin] as const,
  },
  batches: {
    all: ["batches"] as const,
    lists: () => [...queryKeys.batches.all, "list"] as const,
    list: (filters: BatchListFilters) => [...queryKeys.batches.lists(), filters] as const,
    nextBatchNo: () => [...queryKeys.batches.all, "next-batch-no"] as const,
    /** Under batches.all: any batch change (create, delete, status) refreshes the tab counts too. */
    statusCounts: () => [...queryKeys.batches.all, "status-counts"] as const,
    detail: (id: string) => [...queryKeys.batches.all, "detail", id] as const,
    chain: (id: string) => [...queryKeys.batches.all, "chain", id] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    lists: () => [...queryKeys.suppliers.all, "list"] as const,
    list: (filters: SupplierListFilters) => [...queryKeys.suppliers.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.suppliers.all, "detail", id] as const,
  },
};
