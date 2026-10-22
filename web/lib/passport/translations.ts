import type { PassportSnapshot, SnapshotStep } from "./types";

/** A free text as the page shows it: in the reader's language when an approved translation exists, else as written. */
export interface ShownText {
  text: string;
  /** The language the text is in, for `lang=` and for the "in Turkish" label. */
  language: string;
  /** Not in the reader's language (no translation was approved for it). */
  original: boolean;
}

/**
 * The free texts of a passport in the page's language (docs/m11-plan.md §3, design v1.1 141): the snapshot carries the
 * approved translations keyed by where the text is ({@code product.description}, {@code s3.fabricType}); a text without
 * one stays in its own language and the page says which. {@link aiAssisted} tells whether a text shown came from an
 * AI suggestion, for the one note at the end of the page.
 */
export function passportTexts(snapshot: PassportSnapshot, locale: string) {
  const byField = new Map<string, { text: string; aiAssisted: boolean }>();
  // A version 1 or 2 snapshot predates translations.
  for (const t of snapshot.translations ?? []) {
    if (t.language === locale) byField.set(t.field, t);
  }
  let aiAssisted = false;

  const shown = (field: string, text: string, language = "tr"): ShownText => {
    if (language === locale) return { text, language, original: false };
    const translation = byField.get(field);
    if (!translation) return { text, language, original: true };
    if (translation.aiAssisted) aiAssisted = true;
    return { text: translation.text, language: locale, original: false };
  };

  /** A step with its free texts (fabric type, the "other" dye process) in the page's language where approved. */
  const step = (s: SnapshotStep): SnapshotStep => {
    const d = s.data;
    if (!d) return s;
    const data = { ...d };
    if (d.fabricType) data.fabricType = shown(`${s.key}.fabricType`, d.fabricType).text;
    if (d.dyeProcess === "OTHER" && d.dyeProcessOther) data.dyeProcessOther = shown(`${s.key}.dyeProcessOther`, d.dyeProcessOther).text;
    return { ...s, data };
  };

  return {
    shown,
    step,
    /** Whether any text shown so far was translated with AI; read it after the texts are worked out. */
    get aiAssisted() {
      return aiAssisted;
    },
  };
}

export type PassportTexts = ReturnType<typeof passportTexts>;
