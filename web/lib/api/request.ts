import { type ApiProblem, isProblem } from "@tekpas/api-client";

/**
 * A non-2xx answer of the API, with its RFC 7807 body when there is one. A request that never got an
 * answer (offline, server unreachable) is not an ApiError: fetch rejects with a TypeError instead.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ApiProblem | undefined,
    /** X-Request-Id of the answer, to match a reported error with the server log. */
    readonly requestId?: string,
  ) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
    this.name = "ApiError";
  }

  hasType(type: string): boolean {
    return this.problem?.type === type;
  }
}

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** openapi-fetch result → data, or an ApiError that TanStack Query reports as the query's error. */
export async function unwrap<T>(request: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) {
    const problem = isProblem(error) ? error : undefined;
    throw new ApiError(response.status, problem, response.headers.get("X-Request-Id") ?? problem?.requestId ?? undefined);
  }
  return data as T;
}
