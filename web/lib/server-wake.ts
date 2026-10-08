/*
 * Render's free instance sleeps after a quiet while and needs about a minute to start (docs/DEPLOY.md). A
 * request that has not answered within WAKE_DETECT_MS most likely waits for that start. Instead of trusting
 * one long request (the Vercel proxy may cut it off), the app polls the liveness check with short timeouts
 * and repeats the real request once, when the server answers (design v0.3.2 31, 32).
 */

/** A request still waiting after this means the server is probably starting. */
export const WAKE_DETECT_MS = 3_000;
/** Time between two probes (from start to start). */
export const WAKE_POLL_MS = 3_000;
/** One probe waits this long at most. */
export const WAKE_PROBE_TIMEOUT_MS = 2_500;
/** Giving up after this (31b): the user can try again. */
export const WAKE_LIMIT_MS = 90_000;

/** Same origin, rewritten to the backend's /actuator/health/liveness (next.config.ts); no DB involved. */
export const LIVENESS_PATH = "/api/health";

/** Is the backend answering? A short request; any failure is "not yet". */
export async function isAwake(timeoutMs = WAKE_PROBE_TIMEOUT_MS): Promise<boolean> {
  try {
    const response = await fetch(LIVENESS_PATH, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Probes every WAKE_POLL_MS until the backend answers (true), WAKE_LIMIT_MS have passed since `startedAt`
 * (false) or `signal` aborts (false).
 */
export async function waitUntilAwake(startedAt: number, signal?: AbortSignal): Promise<boolean> {
  while (!signal?.aborted && Date.now() - startedAt < WAKE_LIMIT_MS) {
    const probeStarted = Date.now();
    if (await isAwake()) return !signal?.aborted;
    const wait = Math.max(0, WAKE_POLL_MS - (Date.now() - probeStarted));
    await sleep(wait, signal);
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
