import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import i18n from "@/lib/i18n";
import { renderScreen, signedInAs, testSession as mockSession } from "@/test/render";
import { NotificationBanner } from "@/components/NotificationBanner";
import { ProfileScreen } from "../ProfileScreen";
import { NotificationAskScreen } from "../NotificationScreens";

// Read when a screen renders, after the imports: jest allows a factory to use names starting with "mock".
jest.mock("@/lib/use-session", () => ({ useSession: () => mockSession.state }));
const mockPush = {
  state: "off" as string,
  enablePush: jest.fn(async () => "on"),
  disablePush: jest.fn(async () => undefined),
  forgetPush: jest.fn(async () => undefined),
  markExplained: jest.fn(async () => undefined),
};
jest.mock("@/lib/notifications", () => ({
  ...jest.requireActual("@/lib/notifications"),
  pushState: () => Promise.resolve(mockPush.state),
  enablePush: () => mockPush.enablePush(),
  disablePush: () => mockPush.disablePush(),
  forgetPush: () => mockPush.forgetPush(),
  markExplained: () => mockPush.markExplained(),
}));
const mockReceived: { listener?: (n: unknown) => void } = {};
jest.mock("expo-notifications", () => ({
  addNotificationReceivedListener: (listener: (n: unknown) => void) => {
    mockReceived.listener = listener;
    return { remove: jest.fn() };
  },
}));

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

beforeEach(() => {
  signedInAs("ADMIN");
  jest.clearAllMocks();
  mockPush.state = "off";
});

describe("NotificationAskScreen", () => {
  it("asks the system only on Bildirimlere izin ver, and leads to the settings when refused", async () => {
    const onDone = jest.fn();
    const onDenied = jest.fn();
    const enable = jest.fn().mockResolvedValueOnce("denied").mockResolvedValueOnce("on");

    await renderScreen(<NotificationAskScreen onDone={onDone} onDenied={onDenied} enable={enable} />);
    expect(screen.getByText(t("notifications.exampleTitle"))).toBeTruthy();

    await fireEvent.press(screen.getByText(t("notifications.allow")));
    await waitFor(() => expect(onDenied).toHaveBeenCalled());
    await fireEvent.press(screen.getByText(t("notifications.allow")));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("remembers a not now and asks nothing", async () => {
    const onDone = jest.fn();
    const enable = jest.fn();

    await renderScreen(<NotificationAskScreen onDone={onDone} onDenied={jest.fn()} enable={enable} />);
    await fireEvent.press(screen.getByText(t("notifications.notNow")));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(mockPush.markExplained).toHaveBeenCalled();
    expect(enable).not.toHaveBeenCalled();
  });
});

describe("NotificationBanner", () => {
  it("shows a notification that arrives in front and opens what it is about", async () => {
    const onOpen = jest.fn();
    const id = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
    await renderScreen(<NotificationBanner onOpen={onOpen} />);

    await act(async () =>
      mockReceived.listener!({
        request: {
          identifier: "n1",
          content: { title: "Yeni veri: İplik", body: "Ege İplik verisini gönderdi", data: { url: `/step/${id}?batch=${id}` } },
        },
      }),
    );
    await fireEvent.press(screen.getByText("Yeni veri: İplik"));

    expect(onOpen).toHaveBeenCalledWith(`/step/${id}?batch=${id}`);
  });
});

describe("ProfileScreen notifications", () => {
  it("turns notifications on from the switch", async () => {
    await renderScreen(<ProfileScreen />);
    expect(await screen.findByText(t("profile.push.off"))).toBeTruthy();

    await fireEvent.press(screen.getByRole("switch", { name: t("profile.push.label") }));

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: t("profile.push.label") })).toHaveProp("accessibilityState", {
        checked: true,
        disabled: false,
      }),
    );
    expect(mockPush.enablePush).toHaveBeenCalled();
  });

  it("leads to the settings when the system refused, and explains Expo Go", async () => {
    mockPush.state = "denied";
    const { unmount } = await renderScreen(<ProfileScreen />);
    expect(await screen.findByText(t("profile.push.denied"))).toBeTruthy();
    expect(screen.getByText(t("profile.push.openSettings"))).toBeTruthy();
    await unmount();

    mockPush.state = "unavailable";
    await renderScreen(<ProfileScreen />);
    expect(await screen.findByText(t("profile.push.expoGo"))).toBeTruthy();
  });

  it("stops this phone's notifications on sign-out", async () => {
    await renderScreen(<ProfileScreen />);
    await fireEvent.press(screen.getByLabelText(t("profile.logout")));
    await fireEvent.press(screen.getAllByText(t("profile.logout")).at(-1)!);

    await waitFor(() => expect(mockPush.forgetPush).toHaveBeenCalled());
  });
});
