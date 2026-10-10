"use client";

import { useEffect, useSyncExternalStore } from "react";

/*
 * The top bar's last crumb on a detail page ("Partiler / KP-2026-0918-A", design v0.3 09). The page knows the
 * label once its data arrived; the shell only renders it.
 */
let detail: string | undefined;
const listeners = new Set<() => void>();

function setDetail(next: string | undefined) {
  detail = next;
  listeners.forEach((listener) => listener());
}

export function useBreadcrumbDetail(): string | undefined {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => detail,
    () => undefined,
  );
}

/** Shows `label` after the page's crumb while the calling page is mounted. */
export function useSetBreadcrumbDetail(label: string | undefined) {
  useEffect(() => {
    setDetail(label);
    return () => setDetail(undefined);
  }, [label]);
}
