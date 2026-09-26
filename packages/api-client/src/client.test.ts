import { describe, expect, it, type Mock, vi } from "vitest";
import { createApiClient, hasProblemType, isProblem, ProblemTypes } from "./client";

const BASE = "http://api.test";
const unauthorized = {
  type: ProblemTypes.unauthorized,
  title: "Unauthorized",
  status: 401,
};
const me = {
  id: "u1",
  email: "a@test.example",
  fullName: "A",
  role: "OWNER",
  locale: "tr",
  company: { id: "c1", name: "Co", type: "MANUFACTURER" },
};

/** openapi-fetch always calls fetch with a Request; the mocks read it as one. */
function mockFetch(handler: (request: Request) => Promise<Response>) {
  return vi.fn(handler) as unknown as typeof globalThis.fetch & Mock;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": status >= 400 ? "application/problem+json" : "application/json" },
  });
}

/**
 * Fake backend: accepts only the current token. `rotate()` makes the old token stale,
 * like an access token expiring.
 */
function fakeServer() {
  let valid = "t1";
  const seenAuth: (string | null)[] = [];
  const fetch = mockFetch(async (input) => {
    seenAuth.push(input.headers.get("Authorization"));
    const path = new URL(input.url).pathname;
    if (path === "/api/v1/auth/login") {
      return json(401, { ...unauthorized, type: ProblemTypes.invalidCredentials });
    }
    if (input.headers.get("Authorization") !== `Bearer ${valid}`) {
      return json(401, unauthorized);
    }
    if (path === "/api/v1/auth/me") return json(200, me);
    return json(404, { type: ProblemTypes.notFound, title: "Not found", status: 404 });
  });
  return {
    fetch,
    seenAuth,
    rotate: (next: string) => {
      valid = next;
    },
  };
}

describe("createApiClient", () => {
  it("sends the current access token", async () => {
    const server = fakeServer();
    const api = createApiClient({ baseUrl: BASE, fetch: server.fetch, getAccessToken: () => "t1" });

    const { data } = await api.GET("/api/v1/auth/me");

    expect(data?.company.name).toBe("Co");
    expect(server.seenAuth).toEqual(["Bearer t1"]);
  });

  it("refreshes once for three concurrent 401s and retries all of them", async () => {
    const server = fakeServer();
    let token = "stale";
    const refreshAccessToken = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      token = "t2";
      server.rotate("t2");
      return true;
    });
    const onUnauthorized = vi.fn();
    const api = createApiClient({
      baseUrl: BASE,
      fetch: server.fetch,
      getAccessToken: () => token,
      refreshAccessToken,
      onUnauthorized,
    });

    const results = await Promise.all([
      api.GET("/api/v1/auth/me"),
      api.GET("/api/v1/auth/me"),
      api.GET("/api/v1/auth/me"),
    ]);

    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.response.status)).toEqual([200, 200, 200]);
    expect(results.every((r) => r.data?.id === "u1")).toBe(true);
    expect(onUnauthorized).not.toHaveBeenCalled();
    // 3 first attempts with the stale token, 3 retries with the new one.
    expect(server.seenAuth.filter((a) => a === "Bearer stale")).toHaveLength(3);
    expect(server.seenAuth.filter((a) => a === "Bearer t2")).toHaveLength(3);
  });

  it("starts a new refresh for a later 401 after the previous one settled", async () => {
    const server = fakeServer();
    let n = 0;
    let token = "stale";
    const refreshAccessToken = vi.fn(async () => {
      token = `t${++n + 1}`;
      server.rotate(token);
      return true;
    });
    const api = createApiClient({ baseUrl: BASE, fetch: server.fetch, getAccessToken: () => token, refreshAccessToken });

    await api.GET("/api/v1/auth/me");
    token = "stale-again";
    await api.GET("/api/v1/auth/me");

    expect(refreshAccessToken).toHaveBeenCalledTimes(2);
  });

  it("reports the 401 when the refresh fails, without retrying", async () => {
    const server = fakeServer();
    const onUnauthorized = vi.fn();
    const api = createApiClient({
      baseUrl: BASE,
      fetch: server.fetch,
      getAccessToken: () => "stale",
      refreshAccessToken: async () => false,
      onUnauthorized,
    });

    const { response, error } = await api.GET("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(hasProblemType(error, ProblemTypes.unauthorized)).toBe(true);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized.mock.calls[0][0]).toMatchObject({ type: ProblemTypes.unauthorized });
    expect(server.fetch).toHaveBeenCalledTimes(1);
  });

  it("treats a throwing refresh like a failed one", async () => {
    const server = fakeServer();
    const onUnauthorized = vi.fn();
    const api = createApiClient({
      baseUrl: BASE,
      fetch: server.fetch,
      getAccessToken: () => "stale",
      refreshAccessToken: async () => {
        throw new Error("network down");
      },
      onUnauthorized,
    });

    const { response } = await api.GET("/api/v1/auth/me");

    expect(response.status).toBe(401);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("does not refresh on a 401 from login", async () => {
    const server = fakeServer();
    const refreshAccessToken = vi.fn(async () => true);
    const api = createApiClient({ baseUrl: BASE, fetch: server.fetch, refreshAccessToken });

    const { response, error } = await api.POST("/api/v1/auth/login", {
      body: { email: "a@test.example", password: "x", client: "WEB" },
    });

    expect(response.status).toBe(401);
    expect(hasProblemType(error, ProblemTypes.invalidCredentials)).toBe(true);
    expect(refreshAccessToken).not.toHaveBeenCalled();
  });

  it("keeps the request body when it retries", async () => {
    const bodies: string[] = [];
    let token = "stale";
    const fetch = mockFetch(async (input) => {
      bodies.push(await input.text());
      return input.headers.get("Authorization") === "Bearer t2"
        ? new Response(null, { status: 204 })
        : json(401, unauthorized);
    });
    const api = createApiClient({
      baseUrl: BASE,
      fetch,
      getAccessToken: () => token,
      refreshAccessToken: async () => {
        token = "t2";
        return true;
      },
    });

    // Any JSON body works for the check; /auth/me has none, so use a raw request through the client.
    const { response } = await api.POST("/api/v1/auth/me" as "/api/v1/auth/login", {
      body: { email: "a@test.example", password: "x", client: "WEB" },
    });

    expect(response.status).toBe(204);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1])).toMatchObject({ email: "a@test.example" });
  });
});

describe("auth endpoints", () => {
  it("never sends the (possibly expired) access token to login, refresh or logout", async () => {
    const seen: [string, string | null][] = [];
    const fetch = mockFetch(async (input) => {
      seen.push([new URL(input.url).pathname, input.headers.get("Authorization")]);
      return json(200, {});
    });
    const api = createApiClient({ baseUrl: BASE, fetch, getAccessToken: () => "expired" });

    await api.POST("/api/v1/auth/refresh", {});
    await api.POST("/api/v1/auth/logout", {});
    await api.POST("/api/v1/auth/login", { body: { email: "a@test.example", password: "x", client: "WEB" } });
    await api.GET("/api/v1/auth/me");

    expect(seen).toEqual([
      ["/api/v1/auth/refresh", null],
      ["/api/v1/auth/logout", null],
      ["/api/v1/auth/login", null],
      ["/api/v1/auth/me", "Bearer expired"],
    ]);
  });
});

describe("problem helpers", () => {
  it("recognizes problem bodies by shape and type", () => {
    expect(isProblem(unauthorized)).toBe(true);
    expect(isProblem({ status: 401 })).toBe(false);
    expect(hasProblemType(unauthorized, ProblemTypes.unauthorized)).toBe(true);
    expect(hasProblemType(unauthorized, ProblemTypes.forbidden)).toBe(false);
  });
});
