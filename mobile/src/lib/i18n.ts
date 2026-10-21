import { MOBILE_LANGUAGES, type MobileLanguage, mobileMessages } from "@tekpas/shared/i18n/mobile";
import { getLocales } from "expo-localization";
import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";

/** The device's first language the app speaks; Turkish otherwise (CLAUDE.md rule 8). */
export function deviceLanguage(): MobileLanguage {
  for (const locale of getLocales()) {
    const code = locale.languageCode as MobileLanguage | null;
    if (code && MOBILE_LANGUAGES.includes(code)) return code;
  }
  return "tr";
}

const i18n = createInstance();

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(MOBILE_LANGUAGES.map((lang) => [lang, { translation: mobileMessages[lang] }])),
  lng: deviceLanguage(),
  fallbackLng: "tr",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
