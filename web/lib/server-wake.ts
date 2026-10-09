import { discardBody } from "@tekpas/api-client";

/*
 * Render's free instance sleeps after 15 quiet minutes and needs 1–2.5 minutes to start (docs/DEPLOY.md).
 * Meanwhile Render answers in its place with a "SERVICE WAKING UP" HTML page that streams line by line, also
 * to `Accept: application/json`. So only a JSON {"status":"UP"} counts as awake; an HTML page, a 5xx or no
 * answer means "still starting", and the HTML is never parsed.
 *
 * While the server starts, one long liveness request is kept open instead of short probes that would cut the
 * waking request off again and again; when it ends without the server, the next one opens. The real request
 * is repeated once, after the server answered (design v0.3.2 31, 32).
 */

/** A request still waiting after this means the server is probably starting. */
export const WAKE_DETECT_MS = 3_000;
/** One liveness request is kept open this long at most. */
export const WAKE_REQUEST_TIMEOUT_MS = 60_000;
/** A liveness request that ended sooner (no connection, 502/503) is repeated this long after it started. */
export const WAKE_RETRY_MS = 3_000;
/** Giving up after this (31b): the user can try again. */
export const WAKE_LIMIT_MS = 180_000;

/** Same origin, rewritten to the backend's /actuator/health/liveness (next.config.ts); no DB involved. */
export const LIVENESS_PATH = "/api/health";

/**
 * One liveness request, kept open up to `timeoutMs`: true only for a JSON {"status":"UP"}. Anything else
 * (Render's waking page, an error status, no answer, `signal` aborted) is false.
 */
export async function checkLiveness(timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  const url = typeof window === "undefined" ? LIVENESS_PATH : new URL(LIVENESS_PATH, window.location.origin).href;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(
      new Request(url, { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal }),
    );
    const type = response.headers.get("Content-Type") ?? "";
    if (!response.ok || !type.includes("json")) {
      // Render's waking page streams until the service has started: this request stays open meanwhile.
      await discardBody(response);
      return false;
    }
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && (body as { status?: unknown }).status === "UP";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/**
 * Liveness requests one after the other until one answers UP (true), WAKE_LIMIT_MS have passed since
 * `startedAt` (false) or `signal` aborts (false).
 */
export async function waitUntilAwake(startedAt: number, signal?: AbortSignal): Promise<boolean> {
  const remaining = () => WAKE_LIMIT_MS - (Date.now() - startedAt);
  while (!signal?.aborted && remaining() > 0) {
    const requestStarted = Date.now();
    if (await checkLiveness(Math.min(WAKE_REQUEST_TIMEOUT_MS, remaining()), signal)) return !signal?.aborted;
    const wait = Math.min(WAKE_RETRY_MS - (Date.now() - requestStarted), remaining());
    if (wait > 0) await sleep(wait, signal);
  }
  return false;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** "0:34" */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
