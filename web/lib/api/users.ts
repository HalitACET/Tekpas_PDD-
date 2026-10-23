"use client";

import { createApiClient, type components } from "@tekpas/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query-keys";
import { unwrap } from "./request";

export type UserResponse = components["schemas"]["UserResponse"];
export type UserInvitation = components["schemas"]["UserInvitation"];
export type UserInviteRequest = components["schemas"]["UserInviteRequest"];
export type TeamRole = UserInviteRequest["role"];
export type PublicInvitationView = components["schemas"]["PublicInvitationView"];

/** The roles a colleague can have, in the order the design lists them (v1.2 162); suppliers' users are not here. */
export const TEAM_ROLES = ["OWNER", "ADMIN", "EDITOR", "VIEWER"] as const satisfies readonly TeamRole[];

/** The company's users (OWNER and ADMIN; 403 for the others). */
export function useUsers(enabled = true) {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/users", { signal })),
    enabled,
  });
}

/** The signed-in user with the company owner's name, for "ask … for access". */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/auth/me", { signal })),
    staleTime: 5 * 60_000,
  });
}

function useUsersChanged() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.audit.all });
  };
}

export function useInviteUser() {
  const changed = useUsersChanged();
  return useMutation({
    mutationFn: (body: UserInviteRequest) => unwrap(api.POST("/api/v1/users/invitations", { body })),
    onSuccess: changed,
  });
}

export function useRenewInvitation() {
  const changed = useUsersChanged();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.POST("/api/v1/users/{id}/invitations", { params: { path: { id } } })),
    onSuccess: changed,
  });
}

export function useUpdateUser() {
  const changed = useUsersChanged();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; role?: TeamRole; active?: boolean }) =>
      unwrap(api.PATCH("/api/v1/users/{id}", { params: { path: { id } }, body })),
    onSuccess: changed,
  });
}

/**
 * The invited person has no account: no bearer token, no refresh, no redirect to the login. The link's token goes in
 * the X-Invitation-Token header, never in a URL (as the supplier's link, K21).
 */
const publicApi = createApiClient({ baseUrl: typeof window === "undefined" ? "" : window.location.origin });

export function usePublicInvitation(token: string | null) {
  return useQuery({
    queryKey: ["publicInvitation"],
    queryFn: ({ signal }) =>
      unwrap(publicApi.GET("/api/v1/public/invitation", { params: { header: { "X-Invitation-Token": token ?? "" } }, signal })),
    enabled: !!token,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useAcceptInvitation(token: string) {
  return useMutation({
    mutationFn: (password: string) =>
      unwrap(
        publicApi.POST("/api/v1/public/invitation/accept", {
          params: { header: { "X-Invitation-Token": token } },
          body: { password },
        }),
      ),
  });
}
