import type { UploadResult, uploadPhotos } from "../documents";
import { BACKOFF_MS, type QueueStorage, UploadQueue } from "../upload-queue";

jest.mock("expo-file-system", () => ({ Directory: jest.fn(), File: jest.fn(), Paths: {} }));

/** The queue's folder, in memory: what was written and which items still have pages. */
function memoryStorage() {
  const state = { json: null as string | null, pages: new Map<string, string[]>() };
  const storage: QueueStorage = {
    read: async () => state.json,
    write: async (json) => {
      state.json = json;
    },
    keep: async (itemId, index, uri) => {
      const kept = `queue/${itemId}/page-${index + 1}.jpg`;
      state.pages.set(itemId, [...(state.pages.get(itemId) ?? []), uri]);
      return kept;
    },
    drop: async (itemId) => {
      state.pages.delete(itemId);
    },
    clear: async () => {
      state.pages.clear();
    },
  };
  return { state, storage };
}

const page = { uri: "file:///cache/p1.jpg", width: 1500, height: 2000, bytes: 400_000 };
const doc = { stepId: "s1", batchNo: "KP-1", stepType: "YARN", docType: "GOTS" as const, pages: [page] };

function setup(answers: UploadResult[]) {
  const { state, storage } = memoryStorage();
  let now = 1_000_000;
  const timers: { run: () => void; at: number }[] = [];
  const upload = jest.fn<ReturnType<typeof uploadPhotos>, Parameters<typeof uploadPhotos>>(async () => {
    return answers.shift() ?? { ok: false };
  });
  const queue = new UploadQueue({
    storage,
    upload,
    now: () => now,
    setTimer: (run, ms) => timers.push({ run, at: now + ms }),
    clearTimer: () => undefined,
  });
  const settle = () => new Promise((done) => setTimeout(done, 0));
  const advance = async (ms: number) => {
    now += ms;
    timers.splice(0).filter((t) => t.at <= now).forEach((t) => t.run());
    await settle();
  };
  return { queue, upload, state, settle, advance };
}

const ok = (id: string): UploadResult => ({ ok: true, document: { id } as never });

describe("UploadQueue", () => {
  it("keeps the pages in its own folder and uploads them with one key for every attempt", async () => {
    const { queue, upload, state, settle, advance } = setup([{ ok: false }, ok("d9")]);

    const item = await queue.add(doc);
    await settle();

    expect(item.pages[0].uri).toBe(`queue/${item.id}/page-1.jpg`);
    expect(queue.getSnapshot().items[0]).toMatchObject({ status: "waiting", attempts: 1 });
    expect(JSON.parse(state.json!)).toHaveLength(1);

    await advance(BACKOFF_MS[0]);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls.map((c) => c[2]?.idempotencyKey)).toEqual([item.id, item.id]);
    expect(queue.getSnapshot().items[0]).toMatchObject({ status: "uploaded", documentId: "d9" });
    expect(state.pages.has(item.id)).toBe(false);
    // What is on the server is not kept for the next start.
    expect(JSON.parse(state.json!)).toHaveLength(0);
  });

  it("waits while offline and goes as soon as the connection is back", async () => {
    const { queue, upload, settle } = setup([ok("d1")]);
    queue.setOnline(false);

    await queue.add(doc);
    await settle();
    expect(upload).not.toHaveBeenCalled();
    expect(queue.getSnapshot()).toMatchObject({ online: false, items: [{ status: "waiting" }] });

    queue.setOnline(true);
    await settle();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot().items[0].status).toBe("uploaded");
  });

  it("stops at a refusal and keeps the reason; tries again only when asked", async () => {
    const { queue, upload, settle } = setup([{ ok: false, status: 409, reason: "BATCH_PUBLISHED" }, ok("d2")]);

    const item = await queue.add(doc);
    await settle();
    expect(queue.getSnapshot().items[0]).toMatchObject({ status: "failed", refusal: { status: 409, reason: "BATCH_PUBLISHED" } });

    queue.retryNow(item.id);
    await settle();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(queue.getSnapshot().items[0].status).toBe("uploaded");
  });

  it("brings back what an earlier run left, an interrupted upload waiting again", async () => {
    const { queue, state, upload, settle } = setup([ok("d3")]);
    state.json = JSON.stringify([
      { ...doc, id: "i1", createdAt: "2026-10-21T10:00:00Z", status: "uploading", progress: 0.4, attempts: 0 },
    ]);

    await queue.load();
    await settle();

    expect(upload).toHaveBeenCalledWith("s1", doc.pages, expect.objectContaining({ idempotencyKey: "i1" }));
    expect(queue.getSnapshot().items[0].status).toBe("uploaded");
  });

  it("deletes a waiting document and everything on sign-out", async () => {
    const { queue, state, settle } = setup([]);
    queue.setOnline(false);
    const first = await queue.add(doc);
    await queue.add(doc);
    await settle();

    await queue.remove(first.id);
    expect(queue.getSnapshot().items).toHaveLength(1);
    expect(state.pages.has(first.id)).toBe(false);

    await queue.clear();
    expect(queue.getSnapshot().items).toHaveLength(0);
    expect(state.pages.size).toBe(0);
  });
});
