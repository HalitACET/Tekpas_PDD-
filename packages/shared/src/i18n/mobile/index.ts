import de from "./de.json";
import en from "./en.json";
import tr from "./tr.json";

/**
 * The mobile app's texts (docs/m8-plan.md §4, CLAUDE.md rule 8): Turkish first, then English and German, with the
 * same keys in each (checked by a test). i18next interpolation ({{name}}), not the web's ICU.
 */
export const mobileMessages = { tr, en, de } as const;

export type MobileLanguage = keyof typeof mobileMessages;

export const MOBILE_LANGUAGES: MobileLanguage[] = ["tr", "en", "de"];
