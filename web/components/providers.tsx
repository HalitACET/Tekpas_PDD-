"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { type ReactNode, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api/request";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Lists stay fresh for a moment (tab switches, re-mounts); mutations invalidate explicitly.
        staleTime: 30_000,
        // 4xx answers will not change on a retry; network errors and 5xx get one more try.
        retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/** Theme follows the OS by default; the user menu can pin light or dark (stored by next-themes). */
export function Providers({ children }: { children: ReactNode }) {
  // One client per browser session (not shared between server renders).
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
        {/* Above a sheet or dialog footer (design v0.3.2 33), so "Kaydet" stays reachable. */}
        <Toaster position="bottom-right" offset={{ bottom: 84, right: 24 }} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
