"use client";

import { createApiClient, type components } from "@tekpas/api-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { ApiError, unwrap } from "./request";

export type PublicRequestView = components["schemas"]["PublicRequestView"];
export type PublicSubmitRequest = components["schemas"]["PublicSubmitRequest"];
export type PublicSubmitResponse = components["schemas"]["PublicSubmitResponse"];
export type LinkContext = components["schemas"]["LinkContext"];

/**
 * The supplier has no account: this client sends no bearer token, never refreshes and never redirects to the
 * login. The link's token goes in the X-Request-Token header, never in a URL (K21).
 */
const publicApi = createApiClient({ baseUrl: typeof window === "undefined" ? "" : window.location.origin });

/**
 * Opens the link (counts as an opening on the server, so it is fetched once and never refetched by itself).
 * `token` is null until the fragment of the address has been read.
 */
export function usePublicRequest(token: string | null) {
  return useQuery({
    queryKey: queryKeys.publicRequest.view,
    queryFn: ({ signal }) =>
      unwrap(publicApi.GET("/api/v1/public/request", { params: { header: { "X-Request-Token": token ?? "" } }, signal })),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
}

export function useSubmitPublicRequest(token: string) {
  return useMutation({
    mutationFn: (body: PublicSubmitRequest) =>
      unwrap(publicApi.POST("/api/v1/public/request/submit", { params: { header: { "X-Request-Token": token } }, body })),
  });
}

export type PublicDocument = components["schemas"]["PublicDocument"];

/**
 * Uploads one file through the link and reports the progress. `fetch` cannot report how much of a request body
 * is sent, so this one call uses XMLHttpRequest. Like every call of this page the token goes in the
 * X-Request-Token header only: it is never in the address, never in a log and never in an error message (the
 * errors carry the server's problem, which does not hold it). Answers 201 with the document, or throws an
 * ApiError (the server refused) / a TypeError (no connection) / an AbortError (cancelled).
 */
export function uploadPublicDocument(
  token: string,
  file: File,
  { onProgress, signal }: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<PublicDocument> {
  return new Promise<PublicDocument>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/v1/public/request/documents");
    xhr.setRequestHeader("X-Request-Token", token);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      const json: unknown = (() => {
        try {
          return JSON.parse(xhr.responseText);
        } catch {
          return undefined;
        }
      })();
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        return resolve(json as PublicDocument);
      }
      const problem = typeof json === "object" && json !== null && "type" in json ? (json as ApiError["problem"]) : undefined;
      reject(new ApiError(xhr.status, problem, xhr.getResponseHeader("X-Request-Id") ?? problem?.requestId ?? undefined));
    };
    xhr.onerror = () => reject(new TypeError("Network error"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    const body = new FormData();
    body.append("file", file);
    xhr.send(body);
  });
}

/** Removes a document this link uploaded, before the form is sent. Answers 204. */
export function deletePublicDocument(token: string, id: string): Promise<void> {
  return unwrap(
    publicApi.DELETE("/api/v1/public/request/documents/{id}", { params: { header: { "X-Request-Token": token }, path: { id } } }),
  ).then(() => undefined);
}
