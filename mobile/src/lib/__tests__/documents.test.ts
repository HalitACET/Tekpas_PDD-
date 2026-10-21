import { readingDone, uploadPhotos, waitForReading } from "../documents";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let responses: (() => Response)[] = [];
const requests: Request[] = [];

beforeEach(() => {
  responses = [];
  requests.length = 0;
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    requests.push(request);
    const next = responses.shift();
    if (!next) throw new TypeError("Network request failed");
    return next();
  }) as typeof fetch;
});

const doc = (status: string) => ({ id: "d1", extractionStatus: status });

describe("waitForReading", () => {
  it("polls until the reading is over and answers with the document", async () => {
    responses = [() => json(doc("QUEUED")), () => json(doc("RUNNING")), () => json(doc("READ"))];
    const sleeps: number[] = [];

    const result = await waitForReading("d1", { sleep: async (ms) => void sleeps.push(ms) });

    expect(result?.extractionStatus).toBe("READ");
    expect(sleeps).toEqual([1000, 1000]);
    expect(new URL(requests[0].url).pathname).toBe("/api/v1/documents/d1");
  });

  it("says once that it takes long, and goes on waiting", async () => {
    let t = 0;
    responses = [...Array.from({ length: 25 }, () => () => json(doc("RUNNING"))), () => json(doc("UNREADABLE"))];
    const onSlow = jest.fn();

    const result = await waitForReading("d1", { onSlow, now: () => t, sleep: async (ms) => void (t += ms) });

    expect(onSlow).toHaveBeenCalledTimes(1);
    expect(result?.extractionStatus).toBe("UNREADABLE");
  });

  it("tries again after a lost poll and stops when aborted", async () => {
    const controller = new AbortController();
    responses = [() => json(doc("QUEUED"))];
    let sleeps = 0;

    const result = await waitForReading("d1", {
      signal: controller.signal,
      sleep: async () => {
        sleeps += 1;
        if (sleeps === 2) controller.abort();
      },
    });

    expect(result).toBeUndefined();
    expect(sleeps).toBe(2);
  });

  it("gives up after two minutes when the server never answers", async () => {
    let t = 0;

    const result = await waitForReading("d1", { now: () => t, sleep: async (ms) => void (t += ms) });

    expect(result).toBeUndefined();
    expect(t).toBe(120_000);
  });

  it("counts a failed or unreadable reading as over", () => {
    expect(readingDone({ extractionStatus: "FAILED" })).toBe(true);
    expect(readingDone({ extractionStatus: "PARTIAL" })).toBe(true);
    expect(readingDone({ extractionStatus: "QUEUED" })).toBe(false);
  });
});

describe("uploadPhotos", () => {
  it("sends the pages as one multipart request to the step, with the type", async () => {
    responses = [() => json({ id: "d9", extractionStatus: "QUEUED" }, 202)];

    const result = await uploadPhotos("s1", [{ uri: "file:///a.jpg" }, { uri: "file:///b.jpg" }], "GOTS");

    expect(result).toEqual({ ok: true, document: { id: "d9", extractionStatus: "QUEUED" } });
    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/api/v1/steps/s1/documents/photos");
    expect(url.searchParams.get("docType")).toBe("GOTS");
    expect(requests[0].method).toBe("POST");
  });

  it("answers a refusal and a lost connection without throwing", async () => {
    responses = [
      () => json({ type: "urn:tekpas:problem:conflict", title: "Conflict", status: 409, reason: "BATCH_PUBLISHED" }, 409),
    ];
    expect(await uploadPhotos("s1", [{ uri: "file:///a.jpg" }])).toEqual({
      ok: false,
      status: 409,
      reason: "BATCH_PUBLISHED",
      requestId: undefined,
    });

    expect(await uploadPhotos("s1", [{ uri: "file:///a.jpg" }])).toEqual({ ok: false });
  });
});
