"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Design: the skeleton is not shown for loads shorter than 300 ms (avoids a flash). */
const SHOW_AFTER_MS = 300;

/**
 * Placeholder with the panel's shape while the session is being checked. No content is revealed. A notice
 * (the server is starting, or could not be reached) shows at once, above the content placeholder.
 */
export function ShellSkeleton({ notice }: { notice?: ReactNode }) {
  const t = useTranslations("common");
  const [delayed, setVisible] = useState(false);
  const visible = delayed || notice !== undefined;

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-dvh bg-background" aria-busy="true">
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
      {visible && (
        <>
          <div className="hidden w-60 shrink-0 flex-col gap-3 border-r bg-sidebar p-3 md:flex" aria-hidden>
            <Skeleton className="mb-3 h-10 w-32" />
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-[52px] items-center gap-3 border-b px-6" aria-hidden>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="ml-auto h-8 w-64" />
            </div>
            <div className="flex flex-1 flex-col gap-5 px-8 py-7">
              {/* Not hidden: the only part of the skeleton a screen reader should hear. */}
              {notice}
              <Skeleton className="h-7 w-48" aria-hidden />
              <Skeleton className="h-4 w-96 max-w-full" aria-hidden />
              <Skeleton className="flex-1 rounded-lg" aria-hidden />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
