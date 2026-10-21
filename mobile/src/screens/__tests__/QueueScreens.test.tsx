import { fireEvent, screen } from "@testing-library/react-native";
import i18n from "@/lib/i18n";
import type { QueueItem } from "@/lib/upload-queue";
import { renderScreen } from "@/test/render";
import { QueueScreen, QueuedScreen } from "../QueueScreens";
import { ReviewScreen } from "../capture/ReviewScreen";
import { UploadScreen } from "../capture/UploadScreen";

jest.mock("expo-file-system", () => ({ Directory: jest.fn(), File: jest.fn(), Paths: {} }));

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;
const page = { uri: "file:///q/p1.jpg", width: 1500, height: 2000, bytes: 1_400_000 };
const item = (id: string, status: QueueItem["status"], extra: Partial<QueueItem> = {}): QueueItem => ({
  id,
  stepId: "s1",
  batchNo: "KP-2026-0915-A",
  stepType: "YARN",
  docType: "GOTS",
  pages: [page, page, page],
  createdAt: "2026-10-21T11:32:00Z",
  status,
  progress: 0,
  attempts: 0,
  ...extra,
});
const now = new Date("2026-10-21T15:00:00Z");

describe("QueueScreen", () => {
  it("shows each document's state, and deletes one only after a confirmation", async () => {
    const onRemove = jest.fn();
    const onRetry = jest.fn();
    await renderScreen(
      <QueueScreen
        queue={{
          online: false,
          items: [
            item("a", "uploading", { progress: 0.6 }),
            item("b", "waiting"),
            item("c", "failed", { refusal: { status: 409, reason: "BATCH_PUBLISHED" } }),
          ],
        }}
        onBack={jest.fn()}
        onRetry={onRetry}
        onRemove={onRemove}
        now={now}
      />,
    );

    expect(screen.getByText(t("queue.uploading", { pct: 60 }))).toBeTruthy();
    expect(screen.getByText(t("queue.waitingOffline"))).toBeTruthy();
    expect(screen.getByText(t("upload.published"))).toBeTruthy();
    expect(screen.getByText(t("queue.offline"))).toBeTruthy();

    await fireEvent.press(screen.getByText(t("queue.retryNow")));
    expect(onRetry).toHaveBeenCalledWith("b");

    await fireEvent.press(screen.getAllByText(t("queue.remove"))[0]);
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText(t("queue.deleteTitle"))).toBeTruthy();
    // The sheet's button comes last: the rows have their own "Sil".
    await fireEvent.press(screen.getAllByText(t("queue.deleteConfirm")).at(-1)!);
    expect(onRemove).toHaveBeenCalledWith("c");
  });

  it("says when nothing waits", async () => {
    await renderScreen(<QueueScreen queue={{ online: true, items: [] }} onBack={jest.fn()} onRetry={jest.fn()} onRemove={jest.fn()} />);

    expect(screen.getByText(t("queue.emptyTitle"))).toBeTruthy();
  });
});

describe("QueuedScreen", () => {
  it("tells what waits and how many with it", async () => {
    await renderScreen(<QueuedScreen item={item("a", "waiting")} waiting={2} onTasks={jest.fn()} onAnother={jest.fn()} />);

    expect(screen.getByText(t("queued.docValue", { type: "GOTS", count: 3 }))).toBeTruthy();
    expect(screen.getByText(t("queue.count", { count: 2 }))).toBeTruthy();
  });
});

describe("queueing from the capture flow", () => {
  it("offers the queue instead of the upload when offline", async () => {
    const onQueue = jest.fn();
    const onUpload = jest.fn();
    await renderScreen(
      <ReviewScreen
        subtitle="KP-1 · İplik"
        pages={[page]}
        onBack={jest.fn()}
        onAdd={jest.fn()}
        onRetake={jest.fn()}
        onRemove={jest.fn()}
        onSwap={jest.fn()}
        onType={jest.fn()}
        onUpload={onUpload}
        offline
        onQueue={onQueue}
      />,
    );

    expect(screen.getByText(t("review.offline"))).toBeTruthy();
    await fireEvent.press(screen.getByText(t("review.queue")));
    expect(onQueue).toHaveBeenCalled();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("offers the queue when an upload breaks", async () => {
    const onQueue = jest.fn();
    await renderScreen(
      <UploadScreen
        stepId="s1"
        title="GOTS · 1 sayfa"
        subtitle="KP-1"
        pages={[page]}
        upload={async () => ({ ok: false })}
        onUploaded={jest.fn()}
        onDone={jest.fn()}
        onCancel={jest.fn()}
        onQueue={onQueue}
      />,
    );

    await fireEvent.press(await screen.findByText(t("upload.queue")));
    expect(onQueue).toHaveBeenCalled();
    expect(screen.getByText(t("upload.failedBodyQueue"))).toBeTruthy();
  });
});
