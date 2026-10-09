import { afterEach, describe, expect, it, vi } from "vitest";
import { checkLiveness, WAKE_LIMIT_MS, WAKE_REQUEST_TIMEOUT_MS, waitUntilAwake } from "./server-wake";

/** Render's answer while a sleeping service starts: 200, text/html, streamed line by line. */
function wakingPage(lines = 3, onEnd?: () => void) {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ < lines) {
        controller.enqueue(new TextEncoder().encode("<p>SERVICE WAKING UP</p>\n"));
      } else {
        onEnd?.();
        controller.close();
      }
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const up = () => new Response(JSON.stringify({ status: "UP" }), { headers: { "Content-Type": "application/json" } });

/** A request that answers only when its signal aborts (then it rejects, like fetch). */
function hanging(request: Request) {
  return new Promise<Response>((_, reject) => {
    request.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
}

function stubFetch(handler: (request: Request, n: number) => Promise<Response>) {
  let n = 0;
  const fetch = vi.fn((request: Request) => handler(request, ++n));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("checkLiveness", () => {
  it("is true only for a JSON UP", async () => {
    stubFetch(async () => up());
    expect(await checkLiveness(1_000)).toBe(true);

    stubFetch(async () => new Response(JSON.stringify({ status: "DOWN" }), { headers: { "Content-Type": "application/json" } }));
    expect(await checkLiveness(1_000)).toBe(false);

    stubFetch(async () => new Response("", { status: 503 }));
    expect(await checkLiveness(1_000)).toBe(false);
  });

  it("asks for JSON and reads Render's waking page to its end without parsing it", async () => {
    let ended = false;
    const fetch = stubFetch(async () => wakingPage(3, () => (ended = true)));
    const json = vi.spyOn(Response.prototype, "json");

    expect(await checkLiveness(1_000)).toBe(false);
    expect(ended).toBe(true);
    expect(json).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][0].headers.get("Accept")).toBe("application/json");
    json.mockRestore();
  });
});

describe("waitUntilAwake", () => {
  it("keeps one request open while the server starts, instead of short probes", async () => {
    vi.useFakeTimers();
    // The first request answers after 40 s, when the server has started.
    const fetch = stubFetch(
      (request) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(up()), 40_000);
          request.signal.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );

    const awake = waitUntilAwake(Date.now());
    await vi.advanceTimersByTimeAsync(40_000);

    expect(await awake).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("opens the next request when one ends without the server, and gives up after 3 minutes", async () => {
    vi.useFakeTimers();
    const fetch = stubFetch((request) => hanging(request));

    const awake = waitUntilAwake(Date.now());
    await vi.advanceTimersByTimeAsync(WAKE_REQUEST_TIMEOUT_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(WAKE_LIMIT_MS - WAKE_REQUEST_TIMEOUT_MS);

    expect(await awake).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(WAKE_LIMIT_MS).toBe(180_000);
  });

  it("waits a little before the next request when the last one ended at once", async () => {
    vi.useFakeTimers();
    const fetch = stubFetch(async (_, n) => (n < 3 ? wakingPage(1) : up()));

    const awake = waitUntilAwake(Date.now());
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await awake).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("stops when aborted, cancelling the open request", async () => {
    let aborted = false;
    stubFetch((request) => {
      request.signal.addEventListener("abort", () => (aborted = true));
      return hanging(request);
    });
    const controller = new AbortController();

    const awake = waitUntilAwake(Date.now(), controller.signal);
    controller.abort();

    expect(await awake).toBe(false);
    expect(aborted).toBe(true);
  });
});
