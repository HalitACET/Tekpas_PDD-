import type { MobileLanguage } from "@tekpas/shared/i18n/mobile";
import * as SecureStore from "expo-secure-store";

/** The person's choices on this phone (design v0.8 100a); "system" follows the phone. */
export type ThemePreference = "system" | "light" | "dark";
export type LanguagePreference = MobileLanguage | "system";

export interface Preferences {
  theme: ThemePreference;
  language: LanguagePreference;
}

const KEY = "tekpas.preferences";
export const DEFAULT_PREFERENCES: Preferences = { theme: "system", language: "system" };

/** Not secret, but SecureStore is the app's one storage (no AsyncStorage dependency for two words). */
export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      theme: parsed.theme === "light" || parsed.theme === "dark" ? parsed.theme : "system",
      language: parsed.language === "tr" || parsed.language === "en" || parsed.language === "de" ? parsed.language : "system",
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(preferences));
}
