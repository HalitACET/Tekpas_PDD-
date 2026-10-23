"use client";

import type { components } from "@tekpas/api-client";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query-keys";
import { unwrap } from "./request";

export type AuditEntry = components["schemas"]["AuditEntry"];
export type AuditPage = components["schemas"]["AuditPage"];

/** The design's type filter (v1.2 180): "Adım ve belge" covers steps and documents. */
export const AUDIT_TYPES = {
  PRODUCT: ["PRODUCT"],
  BATCH: ["BATCH"],
  SUPPLIER: ["SUPPLIER"],
  STEP: ["STEP", "DOCUMENT"],
  PASSPORT: ["PASSPORT"],
  TRANSLATION: ["TRANSLATION"],
  USER: ["USER"],
  IMPORT: ["IMPORT"],
  ISSUE: ["ISSUE"],
} as const;

export type AuditTypeFilter = keyof typeof AUDIT_TYPES;

export interface AuditFilters {
  type?: AuditTypeFilter;
  userId?: string;
  /** An ISO day; days are Turkish days on the server. */
  from?: string;
}

/** One page of the trail, 0-based; the previous page stays on screen while the next one loads. */
export function useAudit(filters: AuditFilters, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.audit.page(filters, page),
    queryFn: ({ signal }) =>
      unwrap(
        api.GET("/api/v1/audit", {
          params: {
            query: {
              entityType: filters.type ? [...AUDIT_TYPES[filters.type]] : undefined,
              userId: filters.userId,
              from: filters.from,
              page,
            },
          },
          signal,
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });
}
