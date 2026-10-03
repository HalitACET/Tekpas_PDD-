import type { ProductCategory } from "@tekpas/shared";

/** Every TanStack Query key of the app, in one place (web/CLAUDE.md). */
export interface ProductListFilters {
  q: string;
  category: ProductCategory | "";
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
};
