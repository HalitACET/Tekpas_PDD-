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
    /** GET /batches/{id}/score: under batches.all, so every change of the batch (a step, a document) refreshes it. */
    score: (id: string) => [...queryKeys.batches.all, "score", id] as const,
    /** GET /batches/{id}/issues (M7): under batches.all too, so a change of the batch refreshes the Uyarılar tab. */
    issues: (id: string, status: string) => [...queryKeys.batches.all, "issues", id, status] as const,
  },
  /** GET /documents/expiring (M7): the tasks page group and the menu badge. */
  certificates: {
    expiring: ["certificates", "expiring"] as const,
  },
  /** The passport versions of a batch (M6): the versions tab, the preview, one version, the QR images. */
  passports: {
    all: ["passports"] as const,
    versions: (batchId: string) => [...queryKeys.passports.all, "versions", batchId] as const,
    preview: (batchId: string) => [...queryKeys.passports.all, "preview", batchId] as const,
    detail: (id: string) => [...queryKeys.passports.all, "detail", id] as const,
    qr: (id: string, kind: string) => [...queryKeys.passports.all, "qr", id, kind] as const,
  },
  /** GET /tasks (design v0.4 48): the page and the menu badge share it. */
  tasks: {
    all: ["tasks"] as const,
  },
  /** GET /public/request: the supplier's page (design v0.4 39–45), opened once per visit. */
  publicRequest: {
    view: ["public-request"] as const,
  },
  documents: {
    all: ["documents"] as const,
    /** GET /steps/{id}/documents: the cards of a step's panel. */
    ofStep: (stepId: string) => [...queryKeys.documents.all, "step", stepId] as const,
    detail: (id: string) => [...queryKeys.documents.all, "detail", id] as const,
    /** The file's bytes, for the review dialog's preview. */
    file: (id: string) => [...queryKeys.documents.all, "file", id] as const,
  },
  suppliers: {
    all: ["suppliers"] as const,
    lists: () => [...queryKeys.suppliers.all, "list"] as const,
    list: (filters: SupplierListFilters) => [...queryKeys.suppliers.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.suppliers.all, "detail", id] as const,
  },
};
