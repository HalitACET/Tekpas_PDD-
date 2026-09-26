"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { restoreSession, setSessionLostHandler } from "@/lib/auth/session";
import { useSession } from "@/lib/auth/use-session";
import { ShellSkeleton } from "@/components/shell/shell-skeleton";

/**
 * Client-side guard for the panel. The refresh cookie is scoped to /api/v1/auth, so the server never
 * sees it on page requests; the session is restored here and nothing is rendered until it is known.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const toLogin = () => router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    setSessionLostHandler(toLogin);
    return () => setSessionLostHandler(undefined);
  }, [router, pathname]);

  useEffect(() => {
    if (session.status === "unknown") {
      void restoreSession();
    } else if (session.status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [session.status, router, pathname]);

  if (session.status !== "authenticated") {
    return <ShellSkeleton />;
  }
  return children;
}
