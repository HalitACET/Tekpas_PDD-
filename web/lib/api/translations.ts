"use client";

import type { components } from "@tekpas/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query-keys";
import { unwrap } from "./request";

export type TranslationsResponse = components["schemas"]["TranslationsResponse"];
export type TranslationField = components["schemas"]["TranslationField"];
export type TranslationEntry = components["schemas"]["TranslationEntry"];
export type TranslationUpdate = components["schemas"]["Entry"];

/** How often the section asks again while an AI suggestion runs (it takes a few seconds). */
const SUGGESTING_POLL_MS = 1500;

/** The batch's free texts and their translations (docs/m11-plan.md §3); polled while a suggestion runs. */
export function usePassportTranslations(batchId: string) {
  return useQuery({
    queryKey: queryKeys.passports.translations(batchId),
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/batches/{id}/translations", { params: { path: { id: batchId } }, signal })),
    refetchInterval: (query) => (query.state.data?.suggesting ? SUGGESTING_POLL_MS : false),
  });
}

/** After a change: the section's own data and the preview, which shows the approved translations. */
function useTranslationsChanged(batchId: string) {
  const queryClient = useQueryClient();
  return (data: TranslationsResponse) => {
    queryClient.setQueryData(queryKeys.passports.translations(batchId), data);
    void queryClient.invalidateQueries({ queryKey: queryKeys.passports.preview(batchId) });
  };
}

/** "Çevirileri öner" (demo companies only): 409 AI_NOT_AVAILABLE, NOTHING_TO_TRANSLATE or AI_LIMIT_REACHED. */
export function useSuggestTranslations(batchId: string) {
  const changed = useTranslationsChanged(batchId);
  return useMutation({
    mutationFn: () => unwrap(api.POST("/api/v1/batches/{id}/translations/suggest", { params: { path: { id: batchId } } })),
    onSuccess: changed,
  });
}

/** Edits and approvals; texts left out stay as they are, an empty text removes the translation. */
export function useSaveTranslations(batchId: string) {
  const changed = useTranslationsChanged(batchId);
  return useMutation({
    mutationFn: (entries: TranslationUpdate[]) =>
      unwrap(api.PUT("/api/v1/batches/{id}/translations", { params: { path: { id: batchId } }, body: { entries } })),
    onSuccess: changed,
  });
}
