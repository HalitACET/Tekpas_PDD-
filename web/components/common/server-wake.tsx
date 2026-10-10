"use client";

import { type QueryKey, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { formatElapsed, WAKE_DETECT_MS, WAKE_LIMIT_MS, waitUntilAwake } from "@/lib/server-wake";

export type ServerWake = { phase: "idle" } | { phase: "waking"; startedAt: number } | { phase: "gaveUp" };

/**
 * Design v0.3.2 32: a list whose first page has not arrived within 3 s probably waits for a sleeping server.
 * A long liveness request is then kept open (lib/server-wake.ts) and the list fetched again once the server
 * answers. After 3 minutes the page shows its error card with "Tekrar dene".
 *
 * @param waiting the list is loading and has nothing to show yet
 * @param onAwake fetch again (cancelling the request that waits)
 */
export function useServerWake(waiting: boolean, onAwake: () => void): { wake: ServerWake; reset: () => void } {
  const [wake, setWake] = useState<ServerWake>({ phase: "idle" });
  const [attempt, setAttempt] = useState(0);
  const awake = useRef(onAwake);
  useEffect(() => {
    awake.current = onAwake;
  });

  useEffect(() => {
    if (!waiting) return;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setWake({ phase: "waking", startedAt });
      void waitUntilAwake(startedAt, controller.signal).then((ready) => {
        if (controller.signal.aborted) return;
        if (ready) {
          setWake({ phase: "idle" });
          awake.current();
        } else {
          setWake({ phase: "gaveUp" });
        }
      });
    }, WAKE_DETECT_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
      setWake({ phase: "idle" });
    };
  }, [waiting, attempt]);

  return {
    // Once the list has something to show (or failed), there is nothing to wait for.
    wake: waiting ? wake : { phase: "idle" },
    reset: () => {
      setWake({ phase: "idle" });
      setAttempt((n) => n + 1);
    },
  };
}

/**
 * useServerWake for a list query: waiting = no data yet and fetching. When the server answers, the request
 * that still waits is cancelled first; a plain refetch would join it (TanStack only cancels a running fetch
 * on refetch once there is data).
 */
export function useListWake(query: UseQueryResult<unknown>, queryKey: QueryKey) {
  const queryClient = useQueryClient();
  const fetchAgain = () => {
    void queryClient.cancelQueries({ queryKey }).then(() => query.refetch());
  };
  const { wake, reset } = useServerWake(query.isPending && query.fetchStatus === "fetching", fetchAgain);
  return {
    wake,
    /** "Tekrar dene" after giving up: wait for the server again. */
    retry: () => {
      reset();
      fetchAgain();
    },
  };
}

/** The strip above the list while the server starts: spinner, note, elapsed time and a 2 px progress line. */
export function ServerWakeStrip({
  startedAt,
  body = "body",
}: {
  startedAt: number;
  /** What happens when the server is ready: the list fills in, or the panel opens. */
  body?: "body" | "sessionBody";
}) {
  const t = useTranslations("common.serverWake");
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.min(Math.max(0, now - startedAt), WAKE_LIMIT_MS);

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex h-10 items-center gap-2.5 overflow-hidden rounded-lg border bg-card px-3.5 text-[13px]"
    >
      <span
        className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-muted-foreground border-r-transparent"
        aria-hidden
      />
      <span className="font-medium">{t("title")}</span>
      <span className="truncate text-muted-foreground">{t(body)}</span>
      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
        {t("elapsed", { elapsed: formatElapsed(elapsed) })}
      </span>
      <span
        className="absolute bottom-0 left-0 h-0.5 bg-primary transition-[width] duration-1000 ease-linear"
        style={{ width: `${(elapsed / WAKE_LIMIT_MS) * 100}%` }}
        aria-hidden
      />
    </div>
  );
}
