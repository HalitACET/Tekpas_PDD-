import * as SecureStore from "expo-secure-store";
import { REFRESH_TOKEN_KEY, getSessionState, login, logout, resetSessionForTests, restoreSession } from "../session";

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const user = {
  id: "u1",
  email: "elif@karaca.example",
  fullName: "Elif Yılmaz",
  role: "ADMIN",
  company: { id: "c1", name: "Karaca Tekstil A.Ş." },
};

type Handler = (request: Request) => Response | Promise<Response>;
let routes: Record<string, Handler> = {};
const calls: { path: string; body: unknown }[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  resetSessionForTests();
  store.clear();
  routes = {};
  calls.length = 0;
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const path = new URL(request.url).pathname;
    const text = await request.clone().text();
    calls.push({ path, body: text ? JSON.parse(text) : undefined });
    const handler = routes[`${request.method} ${path}`];
    return handler
      ? handler(request)
      : json({ type: "urn:tekpas:problem:not-found", title: "Not found", status: 404 }, 404);
  }) as typeof fetch;
});

describe("session", () => {
  it("logs in as a mobile client and keeps the refresh token in secure storage, never the password", async () => {
    routes["POST /api/v1/auth/login"] = () =>
      json({ accessToken: "a1", refreshToken: "r1", tokenType: "Bearer", expiresIn: 900, user });
    routes["GET /api/v1/auth/me"] = (r) => (r.headers.get("Authorization") === "Bearer a1" ? json(user) : json({}, 401));

    expect(await login("elif@karaca.example", "gizli-parola")).toBe("ok");

    expect(calls[0]).toEqual({
      path: "/api/v1/auth/login",
      body: { email: "elif@karaca.example", password: "gizli-parola", client: "MOBILE" },
    });
    expect(store.get(REFRESH_TOKEN_KEY)).toBe("r1");
    expect([...store.values()]).not.toContain("gizli-parola");
    expect(getSessionState()).toEqual({ status: "authenticated", user });
  });

  it("says wrong credentials once for both fields and stores nothing", async () => {
    routes["POST /api/v1/auth/login"] = () =>
      json({ type: "urn:tekpas:problem:invalid-credentials", title: "Unauthorized", status: 401 }, 401);

    expect(await login("elif@karaca.example", "yanlis")).toBe("invalid");
    expect(store.size).toBe(0);
  });

  it("restores the session with the stored token and stores the rotated one", async () => {
    store.set(REFRESH_TOKEN_KEY, "r1");
    routes["POST /api/v1/auth/refresh"] = () =>
      json({ accessToken: "a2", refreshToken: "r2", tokenType: "Bearer", expiresIn: 900 });
    routes["GET /api/v1/auth/me"] = (r) => (r.headers.get("Authorization") === "Bearer a2" ? json(user) : json({}, 401));

    const state = await restoreSession();

    expect(calls[0]).toEqual({ path: "/api/v1/auth/refresh", body: { refreshToken: "r1" } });
    expect(store.get(REFRESH_TOKEN_KEY)).toBe("r2");
    expect(state).toEqual({ status: "authenticated", user });
  });

  it("forgets a token the server refuses, and keeps it when the server cannot be reached", async () => {
    store.set(REFRESH_TOKEN_KEY, "old");
    routes["POST /api/v1/auth/refresh"] = () =>
      json({ type: "urn:tekpas:problem:invalid-refresh-token", title: "Unauthorized", status: 401 }, 401);
    expect(await restoreSession()).toEqual({ status: "anonymous" });
    expect(store.has(REFRESH_TOKEN_KEY)).toBe(false);

    resetSessionForTests();
    store.set(REFRESH_TOKEN_KEY, "kept");
    routes["POST /api/v1/auth/refresh"] = () =>
      json({ type: "urn:tekpas:problem:internal", title: "Error", status: 503 }, 503);
    expect(await restoreSession()).toEqual({ status: "unreachable" });
    expect(store.get(REFRESH_TOKEN_KEY)).toBe("kept");
  });

  it("is anonymous without a stored token, without asking the server", async () => {
    expect(await restoreSession()).toEqual({ status: "anonymous" });
    expect(calls).toHaveLength(0);
  });

  it("logs out on the server and forgets the token on the device even when the server fails", async () => {
    store.set(REFRESH_TOKEN_KEY, "r1");
    routes["POST /api/v1/auth/logout"] = () => {
      throw new TypeError("Network request failed");
    };

    await logout();

    expect(calls[0]).toEqual({ path: "/api/v1/auth/logout", body: { refreshToken: "r1" } });
    expect(store.has(REFRESH_TOKEN_KEY)).toBe(false);
    expect(getSessionState()).toEqual({ status: "anonymous" });
  });
});
