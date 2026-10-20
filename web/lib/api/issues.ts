"use client";

import type { components } from "@tekpas/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query-keys";
import { ApiError, unwrap } from "./request";

export type IssueList = components["schemas"]["IssueListResponse"];
export type Issue = components["schemas"]["IssueResponse"];
export type IssueCounts = components["schemas"]["IssueCounts"];
export type IssueSeverity = Issue["severity"];
export type IssueCode = Issue["code"];
export type IssueStatus = "OPEN" | "RESOLVED";
export type ExpiringCertificate = components["schemas"]["ExpiringCertificate"];

/** The batch's consistency issues (design v0.7 78–85): open or resolved, most severe first, with both counts. */
export function useBatchIssues(batchId: string, status: IssueStatus = "OPEN") {
  return useQuery({
    queryKey: queryKeys.batches.issues(batchId, status),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/api/v1/batches/{id}/issues", { params: { path: { id: batchId }, query: { status } }, signal })),
  });
}

/** After anything that changes what the issues say: the lists, the score, the header and the batch list. */
function useIssuesChanged() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
}

/** "Kontrolleri çalıştır": the server runs the rules and answers with the open issues. */
export function useValidateBatch(batchId: string) {
  const changed = useIssuesChanged();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/batches/{id}/validate", { params: { path: { id: batchId } } })),
    onSettled: changed,
  });
}

/** "Çözüldü işaretle": WARNING and INFO only, with an optional note (OWNER and ADMIN). */
export function useResolveIssue() {
  const changed = useIssuesChanged();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      unwrap(api.POST("/api/v1/issues/{id}/resolve", { params: { path: { id } }, body: note ? { note } : {} })),
    // A blocking issue stays as it is. Someone else's decision (409) leaves the card telling so for a moment before the
    // list is refreshed and the card moves to the resolved side (design v0.7 83).
    onSettled: (_data, error) => {
      const reason = issueReason(error);
      if (reason === "ISSUE_BLOCKING") return;
      if (reason === "ALREADY_RESOLVED") setTimeout(changed, 4000);
      else changed();
    },
  });
}

/** "Geri aç": takes back a person's decision (OWNER and ADMIN). */
export function useReopenIssue() {
  const changed = useIssuesChanged();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.POST("/api/v1/issues/{id}/reopen", { params: { path: { id } } })),
    onSettled: changed,
  });
}

/** Certificates ending within 30 days or already ended: the tasks page group and the menu badge. */
export function useExpiringCertificates({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.certificates.expiring,
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/documents/expiring", { params: { query: { days: 30 } }, signal })),
    staleTime: 30_000,
    enabled,
  });
}

/** The problem's `reason` of a refused decision (ISSUE_BLOCKING, ALREADY_RESOLVED, ...), or undefined. */
export function issueReason(error: unknown): string | undefined {
  return error instanceof ApiError ? (error.problem as { reason?: string } | undefined)?.reason : undefined;
}

/** The highest severity among open issues: the tab badge and the header button take its colour. */
export function topSeverity(counts: IssueCounts | undefined): IssueSeverity | undefined {
  if (!counts) return undefined;
  if (counts.errors > 0) return "ERROR";
  if (counts.warnings > 0) return "WARNING";
  if (counts.infos > 0) return "INFO";
  return undefined;
}

/**
 * The certificates of the tasks page: one row per certificate, with the batches it is used in (the same supplier's
 * certificate is uploaded once per batch). Closest end first.
 */
export interface CertificateTask {
  key: string;
  docType: ExpiringCertificate["docType"];
  validUntil: string;
  daysLeft: number;
  supplierName?: string | null;
  stepType: ExpiringCertificate["stepType"];
  /** The first use: where "Adıma git" and "Yenisini talep et" lead. */
  stepId: string;
  batchId: string;
  batches: { id: string; batchNo: string; stepId: string }[];
}

export function certificateTasks(items: ExpiringCertificate[] | undefined): CertificateTask[] {
  const byKey = new Map<string, CertificateTask>();
  for (const c of items ?? []) {
    const key = `${c.supplierId ?? c.holderName ?? c.stepId}|${c.docType}|${c.validUntil}`;
    const found = byKey.get(key);
    if (found) {
      found.batches.push({ id: c.batchId, batchNo: c.batchNo, stepId: c.stepId });
    } else {
      byKey.set(key, {
        key,
        docType: c.docType,
        validUntil: c.validUntil,
        daysLeft: c.daysLeft,
        supplierName: c.supplierName ?? c.holderName,
        stepType: c.stepType,
        stepId: c.stepId,
        batchId: c.batchId,
        batches: [{ id: c.batchId, batchNo: c.batchNo, stepId: c.stepId }],
      });
    }
  }
  return [...byKey.values()];
}
