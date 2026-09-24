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
  /** Called on every 401 response with its problem body (when there is one). */
  onUnauthorized?: (problem: ApiProblem | undefined, request: Request) => void;
  /** Custom fetch, e.g. for tests. */
  fetch?: typeof globalThis.fetch;
}

export type ApiClient = Client<paths>;

export function createApiClient(options: ApiClientOptions): ApiClient {
  const client = createClient<paths>({ baseUrl: options.baseUrl, fetch: options.fetch });
  client.use(authMiddleware(options));
  return client;
}

function authMiddleware({ getAccessToken, onUnauthorized }: ApiClientOptions): Middleware {
  return {
    async onRequest({ request }) {
      const token = await getAccessToken?.();
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      return request;
    },
    async onResponse({ request, response }) {
      if (response.status === 401 && onUnauthorized) {
        const body: unknown = await response
          .clone()
          .json()
          .catch(() => undefined);
        onUnauthorized(isProblem(body) ? body : undefined, request);
      }
      return response;
    },
  };
}
