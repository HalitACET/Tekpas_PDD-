export const locales = ["tr", "en", "de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "tr";

/** Cookie that remembers an explicit `?lang=` choice. */
export const LOCALE_COOKIE = "NEXT_LOCALE";
/** Request header the proxy uses to hand `?lang=` to the render. */
export const LOCALE_HEADER = "x-tekpas-locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return locales.includes(value as Locale);
}

/** Picks the first supported language from an Accept-Language header, honoring q-values. */
export function matchAcceptLanguage(header: string | null): Locale | undefined {
  if (!header) return undefined;
  return header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { lang: tag.toLowerCase().split("-")[0], q: q ? Number(q.trim().slice(2)) : 1 };
    })
    .filter(({ q }) => q > 0)
    .sort((a, b) => b.q - a.q)
    .map(({ lang }) => lang)
    .find(isLocale);
}
