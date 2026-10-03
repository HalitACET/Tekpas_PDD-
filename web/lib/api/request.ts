import { type ApiProblem, isProblem } from "@tekpas/api-client";

/** A non-2xx answer of the API, with its RFC 7807 body when there is one. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ApiProblem | undefined,
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
    throw new ApiError(response.status, isProblem(error) ? error : undefined);
  }
  return data as T;
}
