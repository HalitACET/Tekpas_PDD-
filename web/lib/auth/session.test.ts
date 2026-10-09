import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The web session against a fake backend (global fetch). Covers the acceptance criteria that do not
 * need a browser: silent refresh when the access token expires, one refresh for concurrent 401s,
 * session restore on app start (strict-mode double call), login and logout.
 */

const ME = {
  id: "u1",
  email: "a@test.example",
  fullName: "Elif Yılmaz",
  role: "ADMIN",
  locale: "tr",
  company: { id: "c1", name: "Karaca Tekstil A.Ş.", type: "MANUFACTURER" },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" },
  });
const problem = (status: number, slug: string) => json(status, { type: `urn:tekpas:problem:${slug}`, title: slug, status });

/** Accepts only the latest access token; each refresh issues a new one while the cookie is valid. */
function fakeBackend({ cookie = true, password = "right" } = {}) {
  let hasCookie = cookie;
  let issued = 0;
  let valid = "";
  const calls: string[] = [];
  const loginBodies: unknown[] = [];
  const fetch = vi.fn(async (input: Request) => {
    const path = new URL(input.url).pathname;
    calls.push(path);
    const auth = input.headers.get("Authorization");
    switch (path) {
      case "/api/v1/auth/refresh":
        await new Promise((r) => setTimeout(r, 5));
        // Like Spring's bearer filter: a stale Authorization header is rejected before the cookie is read.
        if (auth && auth !== `Bearer ${valid}`) return problem(401, "unauthorized");
        if (!hasCookie) return problem(401, "invalid-refresh-token");
        valid = `t${++issued}`;
        return json(200, { accessToken: valid, tokenType: "Bearer", expiresIn: 900 });
      case "/api/v1/auth/login": {
        const body = await input.json();
        loginBodies.push(body);
        if (body.password === "boom") return new Response("Internal Server Error", { status: 500 });
        if (body.password === "gateway") return new Response("Bad Gateway", { status: 502 });
        if (body.password === "hang") {
          // Never answers; gives up only when the caller aborts (like a server that does not wake up).
          return new Promise<Response>((_, reject) =>
            input.signal.addEventListener("abort", () => reject(input.signal.reason)),
          );
        }
        if (body.password !== password) return problem(401, "invalid-credentials");
        hasCookie = true;
        valid = `t${++issued}`;
        return json(200, { accessToken: valid, tokenType: "Bearer", expiresIn: 900, user: ME });
      }
      case "/api/v1/auth/logout":
        hasCookie = false;
        return new Response(null, { status: 204 });
      case "/api/v1/auth/me":
        return auth === `Bearer ${valid}` ? json(200, ME) : problem(401, "unauthorized");
      default:
        return problem(404, "not-found");
    }
  });
  return {
    fetch,
    calls,
    loginBodies,
    count: (path: string) => calls.filter((c) => c === path).length,
    /** The access token expires (or is revoked) on the server side. */
    expireAccessToken: () => {
      valid = "expired";
    },
    dropCookie: () => {
      hasCookie = false;
    },
  };
}

async function loadSession(backend: ReturnType<typeof fakeBackend>) {
  vi.stubGlobal("fetch", backend.fetch);
  vi.resetModules();
  return import("./session");
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session", () => {
  it("restores the session from the refresh cookie with a single refresh, even when called twice", async () => {
    const backend = fakeBackend();
    const session = await loadSession(backend);

    const [a, b] = await Promise.all([session.restoreSession(), session.restoreSession()]);

    expect(a).toEqual({ status: "authenticated", user: ME });
    expect(b).toEqual(a);
    expect(backend.count("/api/v1/auth/refresh")).toBe(1);
    expect(backend.count("/api/v1/auth/me")).toBe(1);
  });

  it("is anonymous when there is no refresh cookie", async () => {
    const session = await loadSession(fakeBackend({ cookie: false }));

    expect(await session.restoreSession()).toEqual({ status: "anonymous" });
  });

  it("renews an expired access token silently and does one refresh for three concurrent 401s", async () => {
    const backend = fakeBackend({ cookie: false });
    const session = await loadSession(backend);
    expect(await session.login("a@test.example", "right", true)).toBe("ok");
    const lost = vi.fn();
    session.setSessionLostHandler(lost);

    backend.expireAccessToken();
    const results = await Promise.all([
      session.api.GET("/api/v1/auth/me"),
      session.api.GET("/api/v1/auth/me"),
      session.api.GET("/api/v1/auth/me"),
    ]);

    expect(results.map((r) => r.response.status)).toEqual([200, 200, 200]);
    expect(backend.count("/api/v1/auth/refresh")).toBe(1);
    expect(lost).not.toHaveBeenCalled();
    expect(session.getSessionState().status).toBe("authenticated");
  });

  it("drops the session and signals it once the refresh cookie is gone too", async () => {
    const backend = fakeBackend({ cookie: false });
    const session = await loadSession(backend);
    await session.login("a@test.example", "right", true);
    const lost = vi.fn();
    session.setSessionLostHandler(lost);

    backend.expireAccessToken();
    backend.dropCookie();
    const { response } = await session.api.GET("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(session.getSessionState()).toEqual({ status: "anonymous" });
    expect(lost).toHaveBeenCalled();
  });

  it("maps login failures to one generic result, and server errors to 'unavailable'", async () => {
    const session = await loadSession(fakeBackend({ cookie: false }));

    expect(await session.login("a@test.example", "wrong", true)).toBe("invalid");
    expect(await session.login("a@test.example", "boom", true)).toBe("unavailable");
    // The proxy could not reach the backend: treated like a sleeping server.
    expect(await session.login("a@test.example", "gateway", true)).toBe("unreachable");
    expect(session.getSessionState().status).not.toBe("authenticated");
  });

  it("reports a login that does not answer in time as unreachable (probably a sleeping server)", async () => {
    const session = await loadSession(fakeBackend({ cookie: false }));

    const started = Date.now();
    expect(await session.login("a@test.example", "hang", true, { timeoutMs: 200 })).toBe("unreachable");
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("does not rely on one long request: an attempt waits 20 s at most", async () => {
    const session = await loadSession(fakeBackend());
    expect(session.LOGIN_TIMEOUT_MS).toBe(20_000);
  });

  it("sends rememberMe with the login request", async () => {
    const backend = fakeBackend({ cookie: false });
    const session = await loadSession(backend);

    await session.login("a@test.example", "right", false);

    expect(backend.loginBodies).toEqual([
      { email: "a@test.example", password: "right", client: "WEB", rememberMe: false },
    ]);
  });

  it("logs out on the server and clears the session", async () => {
    const backend = fakeBackend({ cookie: false });
    const session = await loadSession(backend);
    await session.login("a@test.example", "right", true);

    await session.logout();

    expect(backend.count("/api/v1/auth/logout")).toBe(1);
    expect(session.getSessionState()).toEqual({ status: "anonymous" });
    expect(await session.restoreSession()).toEqual({ status: "anonymous" });
  });
});
