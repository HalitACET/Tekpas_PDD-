/** Every TanStack Query key of the app, in one place, shaped like the web's (web/lib/query-keys.ts). */
export const queryKeys = {
  tasks: {
    all: ["tasks"] as const,
  },
  certificates: {
    expiring: ["certificates", "expiring"] as const,
  },
  documents: {
    all: ["documents"] as const,
    awaiting: () => [...queryKeys.documents.all, "awaiting-review"] as const,
    detail: (id: string) => [...queryKeys.documents.all, "detail", id] as const,
  },
  batches: {
    all: ["batches"] as const,
    list: (q: string) => [...queryKeys.batches.all, "list", q] as const,
    chain: (id: string) => [...queryKeys.batches.all, "chain", id] as const,
  },
};
