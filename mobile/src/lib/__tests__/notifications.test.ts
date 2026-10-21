import * as SecureStore from "expo-secure-store";
import { resetApi, route, calls } from "@/test/render";
import * as Notifications from "expo-notifications";
import { disablePush, enablePush, notificationTarget, pushState, shouldExplain } from "../notifications";

const mockEnv = { executionEnvironment: "standalone", isDevice: true, granted: true };
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get executionEnvironment() {
      return mockEnv.executionEnvironment;
    },
    expoConfig: { extra: { eas: { projectId: "proj-1" } } },
  },
  ExecutionEnvironment: { StoreClient: "storeClient", Standalone: "standalone", Bare: "bare" },
}));
jest.mock("expo-device", () => ({
  get isDevice() {
    return mockEnv.isDevice;
  },
}));
jest.mock("expo-notifications", () => ({
  AndroidImportance: { HIGH: 4 },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: mockEnv.granted })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: mockEnv.granted })),
  getExpoPushTokenAsync: jest.fn(async () => ({ type: "expo", data: "ExponentPushToken[abc123]" })),
  setNotificationHandler: jest.fn(),
}));

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  store.clear();
  resetApi();
  jest.clearAllMocks();
  mockEnv.executionEnvironment = "standalone";
  mockEnv.isDevice = true;
  mockEnv.granted = true;
});

describe("notifications", () => {
  it("asks once, then registers the phone's token with the server", async () => {
    route("PUT", /\/me\/push-tokens$/, { status: 204, body: null });

    expect(await shouldExplain()).toBe(true);
    expect(await enablePush()).toBe("on");

    expect(calls[0]).toMatchObject({
      method: "PUT",
      path: "/api/v1/me/push-tokens",
      body: { token: "ExponentPushToken[abc123]", platform: expect.stringMatching(/ANDROID|IOS/) },
    });
    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj-1" });
    expect(await pushState()).toBe("on");
    expect(await shouldExplain()).toBe(false);
  });

  it("keeps the wish when the phone refuses, so the profile can lead to the settings", async () => {
    mockEnv.granted = false;

    expect(await enablePush()).toBe("denied");

    expect(await pushState()).toBe("denied");
    expect(calls).toHaveLength(0);
  });

  it("removes the phone from the server when switched off", async () => {
    route("PUT", /\/me\/push-tokens$/, { status: 204, body: null });
    route("DELETE", /\/me\/push-tokens$/, { status: 204, body: null });
    await enablePush();

    await disablePush();

    const removal = calls.find((c) => c.method === "DELETE");
    expect(removal?.path).toBe("/api/v1/me/push-tokens");
    expect(await pushState()).toBe("off");
  });

  it("asks nothing in Expo Go, where remote push does not arrive", async () => {
    mockEnv.executionEnvironment = "storeClient";

    expect(await shouldExplain()).toBe(false);
    expect(await enablePush()).toBe("unavailable");
    expect(await pushState()).toBe("unavailable");
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("opens only the tasks or a step's review from a notification", () => {
    const id = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
    expect(notificationTarget({ url: `/step/${id}?batch=${id}` })).toBe(`/step/${id}?batch=${id}`);
    expect(notificationTarget({ url: "/" })).toBe("/");
    expect(notificationTarget({ url: "https://evil.example.com" })).toBeUndefined();
    expect(notificationTarget({ url: "/profile" })).toBeUndefined();
    expect(notificationTarget(null)).toBeUndefined();
  });
});
