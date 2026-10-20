"use client";

import type { components } from "@tekpas/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query-keys";
import { ApiError, unwrap } from "./request";

export type ScoreResponse = components["schemas"]["ScoreResponse"];
export type ScoreCriterion = components["schemas"]["ScoreCriterion"];
export type ScoreIssue = components["schemas"]["ScoreIssue"];
export type PassportVersion = components["schemas"]["PassportVersionResponse"];
export type PassportDetail = components["schemas"]["PassportDetailResponse"];
export type PassportSnapshot = components["schemas"]["PassportSnapshot"];

/** The compliance score of a batch (docs/m6-plan.md §2): computed on the server on every read. */
export function useBatchScore(batchId: string) {
  return useQuery({
    queryKey: queryKeys.batches.score(batchId),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/batches/{id}/score", { params: { path: { id: batchId } }, signal })),
  });
}

/** The batch's passport versions, newest first (the versions tab). */
export function usePassportVersions(batchId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.passports.versions(batchId),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/api/v1/batches/{id}/passports", { params: { path: { id: batchId } }, signal })),
    enabled,
  });
}

/** The passport as it would be published now, nothing saved ("Önizle"). Always fresh: the batch may have changed. */
export function usePassportPreview(batchId: string) {
  return useQuery({
    queryKey: queryKeys.passports.preview(batchId),
    queryFn: ({ signal }) =>
      unwrap(api.GET("/api/v1/batches/{id}/passport-preview", { params: { path: { id: batchId } }, signal })),
    staleTime: 0,
    gcTime: 0,
  });
}

/** One version with its frozen content; the panel's view of an old version. */
export function usePassport(id: string) {
  return useQuery({
    queryKey: queryKeys.passports.detail(id),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/passports/{id}", { params: { path: { id } }, signal })),
    // A version never changes.
    staleTime: Infinity,
  });
}

/** After anything that changes what the batch shows: its status, passport summary, score and the versions. */
function useBatchPassportChanged(batchId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.batches.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.passports.versions(batchId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.passports.preview(batchId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
  };
}

/** "Yayınla": a new version, frozen on the server (409 PUBLISH_BLOCKED carries the blockers). */
export function usePublishPassport(batchId: string) {
  const changed = useBatchPassportChanged(batchId);
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/batches/{id}/passports", { params: { path: { id: batchId } } })),
    onSuccess: changed,
    // A refused publishing still tells something new (the score, a blocker): refresh what the card shows.
    onError: changed,
  });
}

/** "Yeni sürüm (taslak)": the published version stays live, the batch can be changed again. */
export function useOpenPassportDraft(batchId: string) {
  const changed = useBatchPassportChanged(batchId);
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/batches/{id}/passports/draft", { params: { path: { id: batchId } } })),
    onSuccess: changed,
  });
}

/** "Geri çek": the QR code answers "withdrawn" from now on; the reason stays internal. */
export function useWithdrawPassport(batchId: string) {
  const changed = useBatchPassportChanged(batchId);
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      unwrap(api.POST("/api/v1/passports/{id}/withdraw", { params: { path: { id } }, body: { reason } })),
    onSuccess: changed,
  });
}

/** The blockers of a refused publishing (409 PUBLISH_BLOCKED), or none for any other error. */
export function blockersOf(error: unknown): ScoreIssue[] {
  if (!(error instanceof ApiError) || error.problem === undefined) return [];
  const blockers = (error.problem as { blockers?: unknown }).blockers;
  return Array.isArray(blockers) ? (blockers as ScoreIssue[]) : [];
}

export function reasonOf(error: unknown): string | undefined {
  return error instanceof ApiError ? (error.problem as { reason?: string } | undefined)?.reason : undefined;
}

/** A QR image of a passport as a blob (the endpoint wants the bearer token, so it cannot be a plain `src`). */
export async function fetchQr(id: string, kind: "png" | "svg", size = 1024, signal?: AbortSignal): Promise<Blob> {
  const answer =
    kind === "png"
      ? api.GET("/api/v1/passports/{id}/qr.png", { params: { path: { id }, query: { size } }, parseAs: "blob", signal })
      : api.GET("/api/v1/passports/{id}/qr.svg", { params: { path: { id } }, parseAs: "blob", signal });
  return unwrap<Blob>(answer as never);
}

/** The QR code to show in the card: a small PNG, kept while the card is open. */
export function useQrPreview(id: string) {
  return useQuery({
    queryKey: queryKeys.passports.qr(id, "preview"),
    queryFn: ({ signal }) => fetchQr(id, "png", 512, signal),
    // The image only depends on the batch's address, which never changes.
    staleTime: Infinity,
    gcTime: 60_000,
  });
}
