import { createApiClient, type components } from "@tekpas/api-client";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

export type SessionUser = components["schemas"]["MeResponse"];

/**
 * unknown: the stored session is being restored; unreachable: the server did not answer, the stored refresh token is
 * kept for "Tekrar dene"; anonymous: nobody is signed in.
 */
export type SessionState =
  | { status: "unknown" }
  | { status: "unreachable" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: SessionUser };

/** The refresh token's key in the device's secure storage (Keychain, Keystore); never AsyncStorage. */
export const REFRESH_TOKEN_KEY = "tekpas.refreshToken";

/* The access token lives only in memory; the refresh token in SecureStore (mobile/CLAUDE.md). */
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

/** For a request the API client cannot make itself (none yet); the token is never stored. */
export function currentAccessToken(): string | undefined {
  return accessToken;
}

/**
 * The API client: a 401 on any call triggers one shared refresh and a single retry; if that fails the session is
 * dropped (the app shows the login).
 */
export const api = createApiClient({
  baseUrl: API_URL,
  // Looked up on every call, not once when the module loads: tests (and a future offline layer) replace it.
  fetch: (input, init) => globalThis.fetch(input, init),
  getAccessToken: () => accessToken,
  refreshAccessToken: () => refreshOnce().then((result) => result === "ok"),
  onUnauthorized: () => {
    void clearSession();
  },
});

type RefreshResult = "ok" | "rejected" | "unavailable";
let refreshInFlight: Promise<RefreshResult> | undefined;

/**
 * POST /auth/refresh with the stored token, which rotates it: the new one is stored before anything else happens.
 * Single-flight, and never repeated on a failure: the same token sent twice counts as reuse on the server.
 */
function refreshOnce(): Promise<RefreshResult> {
  refreshInFlight ??= (async (): Promise<RefreshResult> => {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) return "rejected";
    try {
      const { data, response } = await api.POST("/api/v1/auth/refresh", { body: { refreshToken } });
      if (data?.accessToken && data.refreshToken) {
        await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken);
        accessToken = data.accessToken;
        return "ok";
      }
      return response.status >= 500 ? "unavailable" : "rejected";
    } catch {
      return "unavailable";
    }
  })().finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

/** One shared refresh for a request the API client does not make (the upload with progress); true when it worked. */
export function refreshSession(): Promise<boolean> {
  return refreshOnce().then((result) => result === "ok");
}

/** On app start: the stored refresh token, if any, becomes a session. */
export async function restoreSession(): Promise<SessionState> {
  if (state.status === "authenticated") return state;
  const refreshed = await refreshOnce();
  if (refreshed === "unavailable") {
    setState({ status: "unreachable" });
    return state;
  }
  if (refreshed === "rejected") {
    await clearSession();
    return state;
  }
  try {
    const { data } = await api.GET("/api/v1/auth/me");
    if (data) {
      setState({ status: "authenticated", user: data });
    } else {
      await clearSession();
    }
  } catch {
    setState({ status: "unreachable" });
  }
  return state;
}

/** invalid: wrong e-mail or password (one message for both); unreachable: no answer; unavailable: a server error. */
export type LoginResult = "ok" | "invalid" | "unavailable" | "unreachable";

export const LOGIN_TIMEOUT_MS = 60_000;

/** The password only travels in this request; it is never stored. */
export async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const { data, response } = await api.POST("/api/v1/auth/login", {
      body: { email, password, client: "MOBILE" },
      signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
    });
    if (!data) {
      if (response.status === 400 || response.status === 401) return "invalid";
      return [502, 503, 504].includes(response.status) ? "unreachable" : "unavailable";
    }
    if (!data.refreshToken) return "unavailable";
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken);
    accessToken = data.accessToken;
    const { data: me } = await api.GET("/api/v1/auth/me");
    if (!me) return "unavailable";
    setState({ status: "authenticated", user: me });
    return "ok";
  } catch {
    return "unreachable";
  }
}

/** The server forgets the refresh token; the device forgets both, even when the server cannot be reached. */
export async function logout(): Promise<void> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  try {
    if (refreshToken) await api.POST("/api/v1/auth/logout", { body: { refreshToken } });
  } catch {
    // The device forgets the session anyway; the server's token expires on its own.
  } finally {
    await clearSession();
  }
}

async function clearSession() {
  accessToken = undefined;
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  setState({ status: "anonymous" });
}

/** Tests only. */
export function resetSessionForTests() {
  accessToken = undefined;
  refreshInFlight = undefined;
  state = { status: "unknown" };
  listeners.clear();
}
