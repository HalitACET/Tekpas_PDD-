import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import i18n from "@/lib/i18n";
import { ApiError, type BatchResponse } from "@/lib/queries";
import { renderScreen } from "@/test/render";
import { ScanScreen } from "../ScanScreen";

// The camera is native: the test plays its part, handing over what it read.
const mockCamera: { onScanned?: (result: { data: string }) => void; permission: unknown } = {
  permission: { granted: true, canAskAgain: true },
};
jest.mock("expo-camera", () => ({
  CameraView: (props: { onBarcodeScanned?: (result: { data: string }) => void }) => {
    mockCamera.onScanned = props.onBarcodeScanned;
    return null;
  },
  useCameraPermissions: () => [mockCamera.permission, jest.fn()],
}));

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;
const OURS = "https://kozapass.vercel.app/01/08691234567890/10/KP-2026-0915-A";
const batch = { id: "b1", batchNo: "KP-2026-0915-A" } as BatchResponse;

beforeEach(() => {
  mockCamera.permission = { granted: true, canAskAgain: true };
  mockCamera.onScanned = undefined;
});

async function scan(data: string) {
  await waitFor(() => expect(mockCamera.onScanned).toBeDefined());
  mockCamera.onScanned!({ data });
}

describe("ScanScreen", () => {
  it("opens the company's batch behind a code", async () => {
    const lookup = jest.fn(async () => batch);
    const onBatch = jest.fn();
    await renderScreen(<ScanScreen focused onBatch={onBatch} onNotNow={jest.fn()} lookup={lookup} openBrowser={jest.fn()} />);

    await scan(OURS);

    await waitFor(() => expect(onBatch).toHaveBeenCalledWith(batch));
    expect(lookup).toHaveBeenCalledWith("08691234567890", "KP-2026-0915-A", expect.anything());
  });

  it("opens our public passport for another company's batch, never the scanned host", async () => {
    const openBrowser = jest.fn(async () => undefined);
    await renderScreen(
      <ScanScreen
        focused
        onBatch={jest.fn()}
        onNotNow={jest.fn()}
        lookup={async () => {
          throw new ApiError(404);
        }}
        openBrowser={openBrowser}
      />,
    );

    await scan("https://evil.example.com/01/08691234567890/10/KP-2026-0915-A");

    await waitFor(() =>
      expect(openBrowser).toHaveBeenCalledWith("https://kozapass.vercel.app/01/08691234567890/10/KP-2026-0915-A"),
    );
  });

  it("shows what it read when the code is not a passport, and opens nothing", async () => {
    const lookup = jest.fn();
    await renderScreen(<ScanScreen focused onBatch={jest.fn()} onNotNow={jest.fn()} lookup={lookup} openBrowser={jest.fn()} />);

    await scan("https://kampanya.ornekmagaza.com/tr/indirim");

    expect(await screen.findByText(t("scan.unknownTitle"))).toBeTruthy();
    expect(screen.getByText("https://kampanya.ornekmagaza.com/tr/indirim")).toBeTruthy();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("offers to try again when the batch cannot be looked up", async () => {
    const lookup = jest
      .fn()
      .mockRejectedValueOnce(new TypeError("Network request failed"))
      .mockResolvedValueOnce(batch);
    const onBatch = jest.fn();
    await renderScreen(<ScanScreen focused onBatch={onBatch} onNotNow={jest.fn()} lookup={lookup} openBrowser={jest.fn()} />);

    await scan(OURS);
    expect(await screen.findByText(t("scan.offlineTitle"))).toBeTruthy();
    await fireEvent.press(screen.getByText(t("scan.retry")));

    await waitFor(() => expect(onBatch).toHaveBeenCalledWith(batch));
  });

  it("explains a refused camera and leads to the settings", async () => {
    mockCamera.permission = { granted: false, canAskAgain: false };
    await renderScreen(<ScanScreen focused onBatch={jest.fn()} onNotNow={jest.fn()} />);

    expect(screen.getByText(t("scan.deniedTitle"))).toBeTruthy();
    expect(screen.getByText(t("scan.openSettings"))).toBeTruthy();
  });
});
