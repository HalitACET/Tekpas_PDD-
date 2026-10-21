import { QueryClient } from "@tanstack/react-query";

/** One client for the app: a failed read is tried once more; lists are fresh for 30 seconds. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
      mutations: { retry: 0 },
    },
  });
}
