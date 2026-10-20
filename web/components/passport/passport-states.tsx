import { Ban, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { AutoRefresh } from "./auto-refresh";

const H1 = "m-0 text-balance font-serif text-[clamp(30px,7.5cqi,42px)] leading-[1.1] font-normal tracking-[-0.02em]";

/** "Pasaport hazırlanıyor" (design v0.6 state b): skeleton, spinner, and the page asks again by itself. */
export function PassportPreparing() {
  const t = useTranslations("passport");
  return (
    <div aria-busy="true" className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <span className="h-3 w-[120px] rounded bg-skeleton" />
        <span className="h-9 w-[78%] rounded-md bg-skeleton" />
        <span className="h-3.5 w-[56%] rounded bg-skeleton" />
        <span className="h-3.5 w-[88%] rounded bg-skeleton" />
      </div>
      <div role="status" aria-live="polite" className="flex items-start gap-3.5 rounded-xl border border-story-border bg-card p-[18px]">
        <span className="mt-0.5 size-5 flex-none animate-spin rounded-full border-2 border-border border-t-brand" aria-hidden />
        <span className="flex flex-col gap-1">
          <strong className="text-base font-semibold">{t("loadTitle")}</strong>
          <span className="text-[15px] text-pretty text-muted-foreground">{t("loadBody")}</span>
        </span>
      </div>
      {["92px", "260px", "180px"].map((height) => (
        <div key={height} className="flex animate-pulse flex-col gap-2.5">
          <span className="h-3 w-[110px] rounded bg-skeleton" />
          <span className="w-full rounded-xl bg-skeleton" style={{ height }} />
        </div>
      ))}
      <AutoRefresh gaveUpText={t("loadGaveUp")} retryLabel={t("loadRetry")} />
    </div>
  );
}

/**
 * A code that has no passport to show (design v0.6 states c and d): never published or unreadable, or withdrawn.
 * The scanned code is shown as it was read, so the person can compare it with the label. A withdrawn passport shows
 * no product information and no reason, only that it is no longer valid.
 */
export function PassportMissing({ kind, gtin, lot }: { kind: "notfound" | "withdrawn"; gtin: string; lot: string }) {
  const t = useTranslations("passport");
  const Icon = kind === "withdrawn" ? Ban : Search;
  return (
    <div className="flex flex-col gap-5 pt-6 pb-10">
      <span className="flex size-[52px] items-center justify-center rounded-[14px] bg-muted text-muted-foreground">
        <Icon className="size-6" strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className={H1}>{kind === "withdrawn" ? t("withdrawnTitle") : t("notFoundTitle")}</h1>
      <div className="flex flex-col gap-2 rounded-xl border border-story-border bg-card p-4">
        <span className="text-[13px] font-medium text-muted-foreground">{t("scanned")}</span>
        <span className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1 font-mono text-[15px] tabular-nums">
          <span className="text-muted-foreground">GTIN</span>
          <span className="break-all">{gtin}</span>
          <span className="text-muted-foreground">{t("lot")}</span>
          <span className="break-all">{lot}</span>
        </span>
      </div>
      <span className="text-[15px] leading-[1.55] text-pretty text-muted-foreground">
        {kind === "withdrawn" ? t("withdrawnHint") : t("notFoundHint")}
      </span>
    </div>
  );
}
