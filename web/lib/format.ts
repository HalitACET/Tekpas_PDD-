import type { Fiber } from "@tekpas/shared";

/**
 * The API stores GTIN-14. A GTIN-13 (EAN) is stored with a leading 0 and shown without it, as printed on
 * labels; a real GTIN-14 is shown as is.
 */
export function displayGtin(gtin14: string): string {
  return gtin14.length === 14 && gtin14.startsWith("0") ? gtin14.slice(1) : gtin14;
}

/** A count in the locale's form: tr/de "1.800", en "1,800". */
export function formatQuantity(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Whole percent in the locale's form: tr "%95", en "95%", de "95 %". */
export function formatPercent(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value / 100);
}

/**
 * "%95 organik pamuk · %5 elastan". Fiber names are lower-cased with the locale's rules (tr: "İpek" →
 * "ipek"), except in German, where nouns keep their capital.
 */
export function fiberText(
  composition: ReadonlyArray<{ fiber: Fiber; percent: number }>,
  locale: string,
  fiberName: (fiber: Fiber) => string,
): string {
  return composition
    .map(({ fiber, percent }) => {
      const name = fiberName(fiber);
      return `${formatPercent(percent, locale)} ${locale === "de" ? name : name.toLocaleLowerCase(locale)}`;
    })
    .join(" · ");
}

/**
 * "Güncelleme" column of the design: time today ("14:32"), "Dün" yesterday, day and month this year
 * ("12 Eyl"), with the year before that.
 */
export function formatUpdated(iso: string, now: Date, locale: string, yesterday: string): string {
  const date = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  if (days === 1) return yesterday;
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  })
    .format(date)
    .replace(/\.$/, "");
}

/**
 * Production period of a batch (09): "02.09 – 20.09.2026" within one year, both years otherwise, a single
 * date when only one end is known. Dates are plain ISO dates (no time zone).
 */
export function formatDateRange(from: string | null | undefined, to: string | null | undefined, locale: string): string {
  const date = (iso: string) => new Date(`${iso}T00:00:00`);
  const full = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  if (!from || !to) {
    const one = from ?? to;
    return one ? full.format(date(one)) : "";
  }
  // Without its year, the start keeps the full date's separators ("02.09", not ICU's day-month "02/09").
  const withoutYear = (d: Date) => {
    const parts = full.formatToParts(d);
    const year = parts.findIndex((p) => p.type === "year");
    const kept = parts.filter((_, i) => i !== year && !(parts[i].type === "literal" && (i === year - 1 || i === year + 1)));
    return kept.map((p) => p.value).join("");
  };
  const start = from.slice(0, 4) === to.slice(0, 4) ? withoutYear(date(from)) : full.format(date(from));
  return `${start} – ${full.format(date(to))}`;
}
