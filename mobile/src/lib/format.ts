import i18n from "./i18n";

/** The language the texts are in decides the date format too. */
export function locale(): string {
  return i18n.language === "en" ? "en-GB" : i18n.language === "de" ? "de-DE" : "tr-TR";
}

/** "13 Mar 2027" (dates without a time, as the API sends them: YYYY-MM-DD). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}

/** "14:32" today, "Dün" yesterday, "20 Eki" before (design v0.8 92a). */
export function formatWhen(iso: string, now: Date, yesterday: string): string {
  const date = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days === 0) return new Intl.DateTimeFormat(locale(), { hour: "2-digit", minute: "2-digit" }).format(date);
  if (days === 1) return yesterday;
  return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short" }).format(date);
}

/** "21 Eki 2026": the date in the task list's heading. */
export function formatToday(now: Date): string {
  return new Intl.DateTimeFormat(locale(), { day: "numeric", month: "short", year: "numeric" }).format(now);
}

/** "4,2 MB" */
export function formatSize(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.max(0.1, mb))} MB`;
}
