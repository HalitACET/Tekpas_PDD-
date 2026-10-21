import { Directory, File, Paths } from "expo-file-system";
import type { Page } from "./capture";
import { type DocType, type UploadResult, uploadPhotos } from "./documents";

/**
 * The upload queue (docs/m9-plan.md §5, design v0.9 107): a document photographed without a connection, or whose
 * upload broke, waits on the phone and goes up by itself when the connection comes back. The pages are copied into
 * the app's own folder (the cache may be emptied by the system); the list is a JSON file next to them. Every attempt
 * sends the same Idempotency-Key, so a lost answer never makes a second document (backend V15). It runs while the
 * app is open; there is no background task (plan §10, decision 5).
 */

export type QueueStatus = "waiting" | "uploading" | "uploaded" | "failed";

export interface QueueItem {
  /** Also the Idempotency-Key. */
  id: string;
  stepId: string;
  batchNo: string;
  stepType: string;
  supplierName?: string | null;
  docType?: DocType;
  pages: Page[];
  createdAt: string;
  status: QueueStatus;
  /** 0–1 while uploading. */
  progress: number;
  attempts: number;
  /** Not before this time (ms): the pause after a failed attempt. */
  nextAt?: number;
  /** Why the server refused it (failed): what the upload screen words the same way. */
  refusal?: { status?: number; reason?: string; field?: string };
  documentId?: string;
}

export interface QueueSnapshot {
  items: QueueItem[];
  online: boolean;
}

/** Where the queue keeps its list and pages; the tests give one in memory. */
export interface QueueStorage {
  read(): Promise<string | null>;
  write(json: string): Promise<void>;
  /** Copies a page into the queue's folder and answers its new address. */
  keep(itemId: string, index: number, uri: string): Promise<string>;
  drop(itemId: string): Promise<void>;
  clear(): Promise<void>;
}

/** After the 1st, 2nd and later failed attempts (the server's job queue waits the same). */
export const BACKOFF_MS = [30_000, 120_000, 600_000];

export interface QueueDeps {
  storage: QueueStorage;
  upload: typeof uploadPhotos;
  now: () => number;
  setTimer: (run: () => void, ms: number) => unknown;
  clearTimer: (timer: unknown) => void;
}

function uuid(): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += "-";
    else if (i === 14) out += "4";
    else if (i === 19) out += hex[(Math.random() * 4) | 8];
    else out += hex[(Math.random() * 16) | 0];
  }
  return out;
}

/** Network trouble or a server that cannot answer now: worth another try later. */
function retryable(result: Extract<UploadResult, { ok: false }>): boolean {
  const s = result.status;
  return s === undefined || s === 401 || s === 408 || s === 429 || s >= 500;
}

export class UploadQueue {
  private items: QueueItem[] = [];
  private online = true;
  private running = false;
  private loaded: Promise<void> | undefined;
  private timer: unknown;
  private abort: AbortController | undefined;
  private snapshot: QueueSnapshot = { items: [], online: true };
  private readonly listeners = new Set<() => void>();

  constructor(private readonly deps: QueueDeps) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): QueueSnapshot => this.snapshot;

  /** Reads what an earlier run left; an upload cut by closing the app waits again. */
  load(): Promise<void> {
    this.loaded ??= this.deps.storage
      .read()
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as QueueItem[]) : [];
        this.items = saved.map((item) => (item.status === "uploading" ? { ...item, status: "waiting", progress: 0 } : item));
      })
      .catch(() => {
        this.items = [];
      })
      .finally(() => {
        this.changed();
        this.kick();
      });
    return this.loaded;
  }

  async add(input: {
    stepId: string;
    batchNo: string;
    stepType: string;
    supplierName?: string | null;
    docType?: DocType;
    pages: Page[];
  }): Promise<QueueItem> {
    await this.load();
    const id = uuid();
    const pages: Page[] = [];
    for (let i = 0; i < input.pages.length; i++) {
      pages.push({ ...input.pages[i], uri: await this.deps.storage.keep(id, i, input.pages[i].uri) });
    }
    const item: QueueItem = {
      ...input,
      id,
      pages,
      createdAt: new Date(this.deps.now()).toISOString(),
      status: "waiting",
      progress: 0,
      attempts: 0,
    };
    this.items = [...this.items, item];
    await this.save();
    this.kick();
    return item;
  }

  async remove(id: string): Promise<void> {
    if (this.items.find((i) => i.id === id)?.status === "uploading") this.abort?.abort();
    this.items = this.items.filter((i) => i.id !== id);
    await this.deps.storage.drop(id);
    await this.save();
  }

  /** "Şimdi dene": no waiting for the pause. */
  retryNow(id: string): void {
    this.update(id, { status: "waiting", nextAt: undefined, refusal: undefined });
    this.kick();
  }

  setOnline(online: boolean): void {
    if (online === this.online) return;
    this.online = online;
    this.changed();
    if (online) {
      // A new connection: whatever waits for a pause may go now.
      this.items = this.items.map((i) => (i.status === "waiting" ? { ...i, nextAt: undefined } : i));
      this.kick();
    }
  }

  /** On sign-out: the pages that did not go up are deleted from the phone. */
  async clear(): Promise<void> {
    this.abort?.abort();
    this.items = [];
    await this.deps.storage.clear();
    await this.save();
  }

  /** Starts the next due upload, one at a time; plans a wake-up for the next pause. */
  kick(): void {
    if (this.running || !this.online) return;
    const now = this.deps.now();
    const next = this.items.find((i) => i.status === "waiting" && (i.nextAt ?? 0) <= now);
    if (!next) {
      this.plan();
      return;
    }
    void this.run(next);
  }

  private plan(): void {
    if (this.timer !== undefined) this.deps.clearTimer(this.timer);
    this.timer = undefined;
    const waits = this.items.filter((i) => i.status === "waiting" && i.nextAt !== undefined).map((i) => i.nextAt!);
    if (waits.length === 0) return;
    this.timer = this.deps.setTimer(() => {
      this.timer = undefined;
      this.kick();
    }, Math.max(0, Math.min(...waits) - this.deps.now()));
  }

  private async run(item: QueueItem): Promise<void> {
    this.running = true;
    const controller = new AbortController();
    this.abort = controller;
    this.update(item.id, { status: "uploading", progress: 0 });
    const result = await this.deps.upload(item.stepId, item.pages, {
      docType: item.docType,
      signal: controller.signal,
      idempotencyKey: item.id,
      onProgress: (progress) => this.update(item.id, { progress }),
    });
    this.running = false;
    this.abort = undefined;
    if (!this.items.some((i) => i.id === item.id)) {
      // Removed while it was going up.
      this.kick();
      return;
    }
    if (result.ok) {
      this.update(item.id, { status: "uploaded", progress: 1, documentId: result.document.id, nextAt: undefined });
      await this.deps.storage.drop(item.id);
    } else if (result.aborted || retryable(result)) {
      const attempts = item.attempts + 1;
      const pause = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length) - 1];
      this.update(item.id, { status: "waiting", progress: 0, attempts, nextAt: this.deps.now() + pause });
    } else {
      this.update(item.id, {
        status: "failed",
        progress: 0,
        refusal: { status: result.status, reason: result.reason, field: result.field },
      });
    }
    await this.save();
    this.kick();
  }

  private update(id: string, patch: Partial<QueueItem>): void {
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
    this.changed();
  }

  /** What survives a restart: everything not yet on the server. */
  private async save(): Promise<void> {
    await this.deps.storage.write(JSON.stringify(this.items.filter((i) => i.status !== "uploaded")));
    this.changed();
  }

  private changed(): void {
    this.snapshot = { items: this.items, online: this.online };
    this.listeners.forEach((listener) => listener());
  }
}

/** The app's folder for the queue: Paths.document/upload-queue/{item}/page-{n}.jpg and queue.json. */
export function fileStorage(): QueueStorage {
  const root = () => {
    const dir = new Directory(Paths.document, "upload-queue");
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    return dir;
  };
  const list = () => new File(root(), "queue.json");
  return {
    async read() {
      const file = list();
      return file.exists ? file.text() : null;
    },
    async write(json) {
      const file = list();
      if (!file.exists) file.create();
      file.write(json);
    },
    async keep(itemId, index, uri) {
      const dir = new Directory(root(), itemId);
      if (!dir.exists) dir.create({ idempotent: true });
      const target = new File(dir, `page-${index + 1}.jpg`);
      new File(uri).copySync(target);
      return target.uri;
    },
    async drop(itemId) {
      const dir = new Directory(root(), itemId);
      if (dir.exists) dir.delete();
    },
    async clear() {
      const dir = new Directory(Paths.document, "upload-queue");
      if (dir.exists) dir.delete();
    },
  };
}

export const uploadQueue = new UploadQueue({
  storage: fileStorage(),
  upload: uploadPhotos,
  now: () => Date.now(),
  setTimer: (run, ms) => setTimeout(run, ms),
  clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
});
