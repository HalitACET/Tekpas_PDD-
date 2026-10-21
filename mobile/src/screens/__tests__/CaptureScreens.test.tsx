import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import i18n from "@/lib/i18n";
import type { Page } from "@/lib/capture";
import type { uploadPhotos, waitForReading } from "@/lib/documents";
import { renderScreen } from "@/test/render";
import { ReviewScreen } from "../capture/ReviewScreen";
import { UploadScreen } from "../capture/UploadScreen";

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;
const page = (n: number, bytes = 400_000): Page => ({ uri: `file:///p${n}.jpg`, width: 1500, height: 2000, bytes });

describe("ReviewScreen", () => {
  const handlers = {
    subtitle: "KP-1 · İplik",
    onBack: jest.fn(),
    onAdd: jest.fn(),
    onRetake: jest.fn(),
    onRemove: jest.fn(),
    onSwap: jest.fn(),
    onType: jest.fn(),
    onUpload: jest.fn(),
  };

  it("swaps two pages by holding one and tapping the other", async () => {
    await renderScreen(<ReviewScreen {...handlers} pages={[page(1), page(2), page(3)]} />);

    await fireEvent(screen.getByLabelText(t("review.page", { n: 1 })), "longPress");
    await fireEvent.press(screen.getByLabelText(t("review.page", { n: 3 })));

    expect(handlers.onSwap).toHaveBeenCalledWith(0, 2);
  });

  it("stops adding pages at ten", async () => {
    await renderScreen(<ReviewScreen {...handlers} pages={Array.from({ length: 10 }, (_, i) => page(i + 1))} />);

    expect(screen.getByText(t("review.limitTitle", { max: 10 }))).toBeTruthy();
    expect(screen.queryByLabelText(t("review.addPage"))).toBeNull();
  });

  it("does not upload pages over 10 MB together", async () => {
    await renderScreen(<ReviewScreen {...handlers} pages={[page(1, 6_000_000), page(2, 6_000_000)]} />);

    expect(screen.getByText(t("review.tooLargeTitle"))).toBeTruthy();
    await fireEvent.press(screen.getByText(t("review.upload")));
    expect(handlers.onUpload).not.toHaveBeenCalled();
  });
});

describe("UploadScreen", () => {
  const base = { stepId: "s1", title: "GOTS · 2 sayfa", subtitle: "KP-1", pages: [page(1), page(2)], onCancel: jest.fn() };
  const uploaded = { ok: true as const, document: { id: "d9", extractionStatus: "QUEUED" } as never };

  it("uploads, waits for the reading and opens the form", async () => {
    const upload = jest.fn<ReturnType<typeof uploadPhotos>, Parameters<typeof uploadPhotos>>(async (_s, _p, options) => {
      options?.onProgress?.(0.5);
      return uploaded;
    });
    const wait = jest.fn<ReturnType<typeof waitForReading>, Parameters<typeof waitForReading>>(async () => ({ id: "d9" }) as never);
    const onUploaded = jest.fn();
    const onDone = jest.fn();

    await renderScreen(<UploadScreen {...base} upload={upload} wait={wait} onUploaded={onUploaded} onDone={onDone} />);

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("d9", true));
    expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ id: "d9" }));
    expect(upload.mock.calls[0][0]).toBe("s1");
  });

  it("keeps the pages after a lost connection and tries again", async () => {
    const upload = jest
      .fn<ReturnType<typeof uploadPhotos>, Parameters<typeof uploadPhotos>>()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(uploaded);
    const wait = jest.fn<ReturnType<typeof waitForReading>, Parameters<typeof waitForReading>>(async () => undefined);
    const onDone = jest.fn();

    await renderScreen(<UploadScreen {...base} upload={upload} wait={wait} onUploaded={jest.fn()} onDone={onDone} />);

    expect(await screen.findByText(t("upload.failedTitle"))).toBeTruthy();
    expect(screen.getByText(t("upload.failedBody", { count: 2 }))).toBeTruthy();
    await fireEvent.press(screen.getByText(t("common.retry")));

    // The reading never answered: the form opens, but not as a filled one.
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("d9", false));
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("says why the server refused the pages", async () => {
    const upload = jest.fn<ReturnType<typeof uploadPhotos>, Parameters<typeof uploadPhotos>>(async () => ({
      ok: false,
      status: 409,
      reason: "BATCH_PUBLISHED",
    }));

    await renderScreen(<UploadScreen {...base} upload={upload} onUploaded={jest.fn()} onDone={jest.fn()} />);

    expect(await screen.findByText(t("upload.published"))).toBeTruthy();
    expect(screen.queryByText(t("common.retry"))).toBeNull();
  });
});
