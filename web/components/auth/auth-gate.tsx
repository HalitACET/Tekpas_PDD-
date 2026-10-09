"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { ServerWakeStrip } from "@/components/common/server-wake";
import { Button } from "@/components/ui/button";
import { supplierRedirect } from "@/lib/auth/permissions";
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

  // UX only: supplier users cannot use the product and batch pages (the API answers 403 anyway).
  const redirect = session.status === "authenticated" ? supplierRedirect(session.user.role, pathname) : undefined;
  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  if (session.status === "starting") {
    return <ShellSkeleton notice={<ServerWakeStrip startedAt={session.startedAt} body="sessionBody" />} />;
  }
  if (session.status === "unreachable") {
    return <ShellSkeleton notice={<SessionUnreachable reason={session.reason} />} />;
  }
  if (session.status !== "authenticated" || redirect) {
    return <ShellSkeleton />;
  }
  return children;
}

/**
 * Like the login's 31b: the server did not start within 90 s, or could not be reached. The session is
 * kept (the refresh cookie was never used); "Tekrar dene" starts over.
 */
function SessionUnreachable({ reason }: { reason: "timeout" | "network" }) {
  const t = useTranslations("common.serverWake");
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border bg-card px-3.5 py-3 text-[13px] leading-[1.45]">
      <Clock className="mt-px size-[18px] shrink-0 text-status-expiring" strokeWidth={1.75} aria-hidden />
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="font-medium">{reason === "timeout" ? t("gaveUpTitle") : t("networkTitle")}</span>
        <span className="text-xs text-muted-foreground">{reason === "timeout" ? t("gaveUpBody") : t("networkBody")}</span>
      </span>
      <Button variant="secondary" size="sm" onClick={() => void restoreSession()}>
        {t("retry")}
      </Button>
    </div>
  );
}
