import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import i18n, { deviceLanguage } from "@/lib/i18n";
import { DEFAULT_PREFERENCES, type Preferences, loadPreferences, savePreferences } from "@/lib/preferences";
import { dark, light, type Palette } from "./colors";

interface ThemeContextValue {
  colors: Palette;
  scheme: "light" | "dark";
  preferences: Preferences;
  setPreferences: (next: Preferences) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: light,
  scheme: "light",
  preferences: DEFAULT_PREFERENCES,
  setPreferences: () => {},
});

/** The palette of the chosen theme, and the language; both remembered on the phone. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preferences, setState] = useState<Preferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    void loadPreferences().then((saved) => {
      setState(saved);
      void i18n.changeLanguage(saved.language === "system" ? deviceLanguage() : saved.language);
    });
  }, []);

  const setPreferences = useCallback((next: Preferences) => {
    setState(next);
    void savePreferences(next);
    void i18n.changeLanguage(next.language === "system" ? deviceLanguage() : next.language);
  }, []);

  const scheme = preferences.theme === "system" ? (system === "dark" ? "dark" : "light") : preferences.theme;
  const value = useMemo(
    () => ({ colors: scheme === "dark" ? dark : light, scheme, preferences, setPreferences }),
    [scheme, preferences, setPreferences],
  ) satisfies ThemeContextValue;
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
