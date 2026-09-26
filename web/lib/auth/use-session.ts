"use client";

import { useSyncExternalStore } from "react";
import { getSessionState, type SessionState, subscribeSession } from "./session";

const SERVER_STATE: SessionState = { status: "unknown" };

export function useSession(): SessionState {
  return useSyncExternalStore(subscribeSession, getSessionState, () => SERVER_STATE);
}

/**
 * Only same-site relative paths are allowed as a post-login target ("/batches", not "//evil.example"
 * or "https://…"), so ?next= cannot be used as an open redirect.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/batches"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (next.startsWith("/login")) return fallback;
  return next;
}
