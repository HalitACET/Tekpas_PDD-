"use client";

import { createApiClient, type components } from "@tekpas/api-client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { unwrap } from "./request";

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
