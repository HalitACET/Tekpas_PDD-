"use client";

import type { components } from "@tekpas/api-client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query-keys";
import { unwrap } from "./request";

export type TasksResponse = components["schemas"]["TasksResponse"];
export type TaskItem = components["schemas"]["TaskItem"];

/** The tasks page and the menu badge (design v0.4 48); refreshed when the window gets focus again. */
export function useTasks({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.tasks.all,
    queryFn: ({ signal }) => unwrap(api.GET("/api/v1/tasks", { signal })),
    staleTime: 30_000,
    enabled,
  });
}
