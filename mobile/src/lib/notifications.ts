import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { api } from "./session";

/**
 * Push notifications on this phone (docs/m9-plan.md §5): the permission, the Expo token and its place on the server
 * (PUT/DELETE /me/push-tokens). Remote push needs the app's own build: Expo Go does not receive it, so there the
 * feature is "unavailable" and nothing is asked or sent.
 */

/** The Android channel; the backend sends to the same one (PushMessage.CHANNEL). */
export const PUSH_CHANNEL = "default";

/** on: this phone gets notifications; off: not wanted (or not asked yet); denied: wanted, refused in the settings. */
export type PushState = "on" | "off" | "denied" | "unavailable";

interface Stored {
  /** The explanation (design v0.9 106a) was shown once on this phone. */
  asked: boolean;
  /** The person wants notifications on this phone. */
  wanted: boolean;
  token?: string;
}

const KEY = "tekpas.push";
const EMPTY: Stored = { asked: false, wanted: false };

async function load(): Promise<Stored> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Stored>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

async function save(next: Stored): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(next));
}

/** False in Expo Go and on a simulator: remote push needs the installed app on a phone. */
export function pushAvailable(): boolean {
  return Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && Device.isDevice;
}

/** The app shows its own banner in front (design v0.9 106e); the system one is for the background. */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function pushState(): Promise<PushState> {
  if (!pushAvailable()) return "unavailable";
  const stored = await load();
  if (!stored.wanted) return "off";
  const { granted } = await Notifications.getPermissionsAsync();
  return granted ? "on" : "denied";
}

/** Whether to show the explanation once, after the first sign-in on this phone. */
export async function shouldExplain(): Promise<boolean> {
  return pushAvailable() && !(await load()).asked;
}

export async function markExplained(): Promise<void> {
  await save({ ...(await load()), asked: true });
}

/**
 * Asks for the permission (Android 13+ needs the channel first), gets the Expo token and gives it to the server.
 * "denied" when the phone refuses; the wish is kept so the profile can lead to the settings.
 */
export async function enablePush(): Promise<PushState> {
  if (!pushAvailable()) return "unavailable";
  const stored = await load();
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL, {
      name: "KozaPass",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    await save({ ...stored, asked: true, wanted: true });
    return "denied";
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const { response } = await api.PUT("/api/v1/me/push-tokens", {
    body: { token, platform: Platform.OS === "ios" ? "IOS" : "ANDROID" },
  });
  if (!response.ok) throw new Error(`Push token not registered (HTTP ${response.status})`);
  await save({ asked: true, wanted: true, token });
  return "on";
}

/** The server forgets this phone; the phone remembers that the person said no. */
export async function disablePush(): Promise<void> {
  const stored = await load();
  if (stored.token) {
    await api.DELETE("/api/v1/me/push-tokens", { params: { query: { token: stored.token } } }).catch(() => undefined);
  }
  await save({ ...stored, wanted: false, token: undefined });
}

/** On sign-out: nothing of the person is left on the phone, and their notifications stop here. */
export async function forgetPush(): Promise<void> {
  const stored = await load();
  if (stored.token) {
    await api.DELETE("/api/v1/me/push-tokens", { params: { query: { token: stored.token } } }).catch(() => undefined);
  }
  await save({ asked: stored.asked, wanted: false });
}

/**
 * After a sign-in or a restore: a phone that wants notifications registers again (the token may have changed, and a
 * token moves to whoever signs in on the phone). Never asks for a permission.
 */
export async function syncPush(): Promise<void> {
  if (!pushAvailable()) return;
  const stored = await load();
  if (!stored.wanted) return;
  const { granted } = await Notifications.getPermissionsAsync();
  if (granted) await enablePush().catch(() => undefined);
}

/** An address from a notification's data that the app opens: the tasks or a step's review, nothing else. */
export function notificationTarget(data: unknown): string | undefined {
  const url = (data as { url?: unknown } | null)?.url;
  if (typeof url !== "string") return undefined;
  const uuid = "[0-9a-fA-F-]{36}";
  return new RegExp(`^/$|^/step/${uuid}\\?batch=${uuid}$`).test(url) ? url : undefined;
}
