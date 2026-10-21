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

/** A stand-in for XMLHttpRequest: records the request and answers as the test says. */
class FakeXhr {
  static sent: FakeXhr[] = [];
  static answers: ((xhr: FakeXhr) => void)[] = [];
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  responseText = "";
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader() {
    return null;
  }
  abort() {
    this.onabort?.();
  }
  send(body: unknown) {
    this.body = body;
    FakeXhr.sent.push(this);
    const answer = FakeXhr.answers.shift();
    if (answer) answer(this);
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

const xhr = () => new FakeXhr() as unknown as XMLHttpRequest;

describe("uploadPhotos", () => {
  beforeEach(() => {
    FakeXhr.sent = [];
    FakeXhr.answers = [];
  });

  it("sends the pages as one multipart request to the step, with the type, and reports the progress", async () => {
    FakeXhr.answers = [
      (x) => {
        x.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
        x.respond(202, { id: "d9", extractionStatus: "QUEUED" });
      },
    ];
    const progress: number[] = [];

    const result = await uploadPhotos("s1", [{ uri: "file:///a.jpg" }, { uri: "file:///b.jpg" }], {
      docType: "GOTS",
      onProgress: (f) => progress.push(f),
      xhr,
    });

    expect(result).toEqual({ ok: true, document: { id: "d9", extractionStatus: "QUEUED" } });
    const url = new URL(FakeXhr.sent[0].url);
    expect(url.pathname).toBe("/api/v1/steps/s1/documents/photos");
    expect(url.searchParams.get("docType")).toBe("GOTS");
    expect(FakeXhr.sent[0].method).toBe("POST");
    expect(FakeXhr.sent[0].body).toBeInstanceOf(FormData);
    expect(progress).toEqual([0.5, 1]);
  });

  it("answers a refusal with its reason and the page it was about", async () => {
    FakeXhr.answers = [
      (x) => x.respond(409, { status: 409, reason: "BATCH_PUBLISHED", requestId: "r1" }),
      (x) => x.respond(400, { status: 400, errors: [{ field: "pages[1]", code: "UNREADABLE" }] }),
    ];

    expect(await uploadPhotos("s1", [{ uri: "file:///a.jpg" }], { xhr })).toEqual({
      ok: false,
      status: 409,
      reason: "BATCH_PUBLISHED",
      field: undefined,
      code: undefined,
      requestId: "r1",
    });
    expect(await uploadPhotos("s1", [{ uri: "file:///a.jpg" }, { uri: "file:///b.jpg" }], { xhr })).toMatchObject({
      ok: false,
      status: 400,
      field: "pages[1]",
    });
  });

  it("answers a lost connection and a cancel without throwing", async () => {
    FakeXhr.answers = [(x) => x.onerror?.()];
    expect(await uploadPhotos("s1", [{ uri: "file:///a.jpg" }], { xhr })).toEqual({ ok: false });

    const controller = new AbortController();
    FakeXhr.answers = [() => controller.abort()];
    expect(await uploadPhotos("s1", [{ uri: "file:///a.jpg" }], { xhr, signal: controller.signal })).toEqual({
      ok: false,
      aborted: true,
    });
  });
});
