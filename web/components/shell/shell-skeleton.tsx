"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Design: the skeleton is not shown for loads shorter than 300 ms (avoids a flash). */
const SHOW_AFTER_MS = 300;

/** Placeholder with the panel's shape while the session is being checked. No content is revealed. */
export function ShellSkeleton() {
  const t = useTranslations("common");
  const [visible, setVisible] = useState(false);

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
          <div className="flex min-w-0 flex-1 flex-col" aria-hidden>
            <div className="flex h-[52px] items-center gap-3 border-b px-6">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="ml-auto h-8 w-64" />
            </div>
            <div className="flex flex-1 flex-col gap-5 px-8 py-7">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-96 max-w-full" />
              <Skeleton className="flex-1 rounded-lg" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
