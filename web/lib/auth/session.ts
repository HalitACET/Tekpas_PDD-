"use client";

import { createApiClient, type components } from "@tekpas/api-client";

export type SessionUser = components["schemas"]["MeResponse"];

export type SessionState =
  | { status: "unknown" }
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

let refreshInFlight: Promise<boolean> | undefined;

/**
 * POST /auth/refresh with the cookie. Single-flight: concurrent callers (React strict-mode double
 * effects, several 401s at once) share one request; a second request with the same cookie would be
 * rejected as token reuse.
 */
export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const { data } = await api.POST("/api/v1/auth/refresh", {});
      accessToken = data?.accessToken;
      return accessToken !== undefined;
    } catch {
      return false;
    }
  })().finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

let restoreInFlight: Promise<SessionState> | undefined;

/** On app start: turn the refresh cookie (if any) into an in-memory session. Runs once at a time. */
export function restoreSession(): Promise<SessionState> {
  if (state.status === "authenticated") return Promise.resolve(state);
  restoreInFlight ??= (async () => {
    const refreshed = await refreshAccessToken();
    if (!refreshed) {
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
