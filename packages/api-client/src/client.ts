import createClient, { type Client, type Middleware } from "openapi-fetch";
import type { components, paths } from "./generated/schema";

/** RFC 7807 body of every error response (see backend ApiProblem). */
export type ApiProblem = components["schemas"]["ApiProblem"];
export type FieldViolation = components["schemas"]["FieldViolation"];

/** Problem type URNs sent by the backend (`urn:tekpas:problem:<slug>`); UI texts are keyed on these. */
export const ProblemTypes = {
  badRequest: "urn:tekpas:problem:bad-request",
  validation: "urn:tekpas:problem:validation",
  unauthorized: "urn:tekpas:problem:unauthorized",
  forbidden: "urn:tekpas:problem:forbidden",
  notFound: "urn:tekpas:problem:not-found",
  invalidCredentials: "urn:tekpas:problem:invalid-credentials",
  invalidRefreshToken: "urn:tekpas:problem:invalid-refresh-token",
  internal: "urn:tekpas:problem:internal",
} as const;

export type ProblemType = (typeof ProblemTypes)[keyof typeof ProblemTypes];

export function isProblem(value: unknown): value is ApiProblem {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.status === "number"
  );
}

export function hasProblemType(value: unknown, type: ProblemType): value is ApiProblem {
  return isProblem(value) && value.type === type;
}

export interface ApiClientOptions {
  /** Origin of the API, e.g. "" for same-origin (web proxy, K18) or "http://192.168.1.5:8080" (mobile). */
  baseUrl: string;
  /** Current access token, if any. Called before every request. */
  getAccessToken?: () => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Gets a new access token (web: POST /auth/refresh with the cookie) and resolves true on success.
   * On a 401 the client calls it once for all requests that fail at the same time (single-flight),
   * then retries each of them once. Not used for login, refresh and logout themselves.
   */
  refreshAccessToken?: () => Promise<boolean>;
  /** Called when a 401 cannot be recovered (no refresh, refresh failed, or the retry is 401 again). */
  onUnauthorized?: (problem: ApiProblem | undefined, request: Request) => void;
  /** Custom fetch, e.g. for tests. */
  fetch?: typeof globalThis.fetch;
}

export type ApiClient = Client<paths>;

/**
 * These authenticate by other means (credentials, refresh token): they get no Authorization header,
 * and a 401 from them must not trigger a refresh. An expired bearer on /auth/refresh would otherwise
 * be rejected before the refresh cookie is even read.
 */
const NO_REFRESH_PATHS = ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout"];

export function createApiClient(options: ApiClientOptions): ApiClient {
  const client = createClient<paths>({ baseUrl: options.baseUrl, fetch: options.fetch });
  client.use(authMiddleware(options));
  return client;
}

function authMiddleware(options: ApiClientOptions): Middleware {
  const { getAccessToken, onUnauthorized } = options;
  const refresh = options.refreshAccessToken ? singleFlight(options.refreshAccessToken) : undefined;
  // Unsent copies of requests, kept so a 401 can be retried with the same body.
  const pending = new Map<string, Request>();

  const withToken = async (request: Request) => {
    const token = await getAccessToken?.();
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
    return request;
  };

  return {
    async onRequest({ request, id }) {
      if (isNoRefreshPath(request)) {
        return request;
      }
      if (refresh) {
        pending.set(id, request.clone());
      }
      return withToken(request);
    },
    async onResponse({ request, response, id }) {
      const original = pending.get(id);
      pending.delete(id);
      if (response.status !== 401) {
        return response;
      }

      if (refresh && original && (await refresh())) {
        const retried = await (options.fetch ?? globalThis.fetch)(await withToken(original));
        if (retried.status !== 401) {
          return retried;
        }
        response = retried;
      }

      if (onUnauthorized) {
        const body: unknown = await response
          .clone()
          .json()
          .catch(() => undefined);
        onUnauthorized(isProblem(body) ? body : undefined, request);
      }
      return response;
    },
    onError({ id }) {
      pending.delete(id);
    },
  };
}

function isNoRefreshPath(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return NO_REFRESH_PATHS.some((p) => path === p);
}

/** Concurrent callers share one in-flight call; the next call after it settles starts a new one. */
function singleFlight(fn: () => Promise<boolean>): () => Promise<boolean> {
  let inFlight: Promise<boolean> | undefined;
  return () => {
    inFlight ??= fn()
      .catch(() => false)
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };
}
