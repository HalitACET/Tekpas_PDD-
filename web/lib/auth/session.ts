"use client";

import { createApiClient, type components } from "@tekpas/api-client";
import { isAwake, waitUntilAwake } from "@/lib/server-wake";

export type SessionUser = components["schemas"]["MeResponse"];

/**
 * starting: the server sleeps and is being woken before the session is restored (design v0.3.2 32);
 * unreachable: it did not answer (90 s, no connection or a server error). Neither drops the session: the
 * refresh cookie is still unused, "Tekrar dene" restores it later.
 */
export type SessionState =
  | { status: "unknown" }
  | { status: "starting"; startedAt: number }
  | { status: "unreachable"; reason: "timeout" | "network" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: SessionUser };

/*
 * The access token lives only in this module's memory: never in localStorage or a readable cookie.
 * The refresh token is an httpOnly cookie scoped to /api/v1/auth, sent by the browser on its own.
 */
let accessToken: string | undefined;
let state: SessionState = { status: "unknown" };
const listeners = new Set<() => void>();

function setState(next: SessionState) {
  state = next;
  listeners.forEach((listener) => listener());
}

export function getSessionState(): SessionState {
  return state;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Where to go when a session cannot be recovered; set by the app (router push). */
let onSessionLost: (() => void) | undefined;

export function setSessionLostHandler(handler: (() => void) | undefined) {
  onSessionLost = handler;
}

/**
 * Same-origin API client (K18: /api/v1/* is proxied to the backend). A 401 on any call triggers one
 * shared refresh and a single retry; if that fails, the session is dropped and the app redirects.
 */
export const api = createApiClient({
  // Same origin (K18). Absolute so the Request URL also parses outside a document (tests).
  baseUrl: typeof window === "undefined" ? "" : window.location.origin,
  getAccessToken: () => accessToken,
  refreshAccessToken: () => refreshAccessToken(),
  onUnauthorized: () => {
    const wasAuthenticated = state.status === "authenticated";
    clearSession();
    if (wasAuthenticated) onSessionLost?.();
  },
});

/** rejected: the cookie is not (or no longer) valid; unavailable: no connection, or the server failed. */
type RefreshResult = "ok" | "rejected" | "unavailable";

let refreshInFlight: Promise<RefreshResult> | undefined;

/**
 * POST /auth/refresh with the cookie. Single-flight: concurrent callers (React strict-mode double
 * effects, several 401s at once) share one request; a second request with the same cookie would be
 * rejected as token reuse. For the same reason it is never repeated on a timeout: the rotation is
 * single-use, so a slow refresh is waited for.
 */
function refreshOnce(): Promise<RefreshResult> {
  refreshInFlight ??= (async (): Promise<RefreshResult> => {
    try {
      const { data, response } = await api.POST("/api/v1/auth/refresh", {});
      accessToken = data?.accessToken;
      if (accessToken !== undefined) return "ok";
      return response.status >= 500 ? "unavailable" : "rejected";
    } catch {
      return "unavailable";
    }
  })().finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

export function refreshAccessToken(): Promise<boolean> {
  return refreshOnce().then((result) => result === "ok");
}

let restoreInFlight: Promise<SessionState> | undefined;

/**
 * On app start: turn the refresh cookie (if any) into an in-memory session. Runs once at a time.
 *
 * The liveness check comes first (design v0.3.2 32): a sleeping server is woken by polling it, and only
 * then the refresh is sent, exactly once. A refresh sent to a sleeping server could be processed after the
 * browser gave up on it, and a second one with the same cookie would count as token reuse.
 */
export function restoreSession(): Promise<SessionState> {
  if (state.status === "authenticated") return Promise.resolve(state);
  restoreInFlight ??= (async () => {
    if (!(await isAwake())) {
      const startedAt = Date.now();
      setState({ status: "starting", startedAt });
      if (!(await waitUntilAwake(startedAt))) {
        setState({ status: "unreachable", reason: "timeout" });
        return state;
      }
    }
    const refreshed = await refreshOnce();
    if (refreshed === "unavailable") {
      setState({ status: "unreachable", reason: "network" });
      return state;
    }
    if (refreshed === "rejected") {
      clearSession();
      return state;
    }
    return loadUser();
  })().finally(() => {
    restoreInFlight = undefined;
  });
  return restoreInFlight;
}

async function loadUser(): Promise<SessionState> {
  const { data } = await api.GET("/api/v1/auth/me");
  if (data) {
    setState({ status: "authenticated", user: data });
  } else {
    clearSession();
  }
  return state;
}

/**
 * "unreachable": no answer in time, no connection, or the proxy could not reach the backend (502/503/504):
 * most likely a sleeping server (lib/server-wake.ts). "unavailable": the server answered with an error.
 */
export type LoginResult = "ok" | "invalid" | "unavailable" | "unreachable";

/** One login attempt once the server is known to be awake. */
export const LOGIN_TIMEOUT_MS = 20_000;

/** The password only travels in this request; it is never stored. */
export async function login(
  email: string,
  password: string,
  rememberMe: boolean,
  { timeoutMs = LOGIN_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<LoginResult> {
  try {
    const { data, response } = await api.POST("/api/v1/auth/login", {
      body: { email, password, client: "WEB", rememberMe },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!data) {
      // 400 (malformed input) and 401 get the same single message.
      if (response.status === 400 || response.status === 401) return "invalid";
      return [502, 503, 504].includes(response.status) ? "unreachable" : "unavailable";
    }
    accessToken = data.accessToken;
    setState({ status: "authenticated", user: data.user });
    return "ok";
  } catch {
    // Network error or timeout.
    return "unreachable";
  }
}

export async function logout(): Promise<void> {
  try {
    await api.POST("/api/v1/auth/logout", {});
  } finally {
    clearSession();
  }
}

function clearSession() {
  accessToken = undefined;
  setState({ status: "anonymous" });
}

/** Tests only. */
export function resetSessionForTests() {
  accessToken = undefined;
  refreshInFlight = undefined;
  restoreInFlight = undefined;
  state = { status: "unknown" };
  listeners.clear();
}
