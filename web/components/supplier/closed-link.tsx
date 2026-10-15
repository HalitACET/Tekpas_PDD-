"use client";

import { CheckCircle2, Clock, Link as LinkIcon, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LinkContext } from "@/lib/api/public-request";
import { cn } from "@/lib/utils";
import { FactList, FirmTile, useDates } from "./frame";

/** What the API says about a link that cannot be used (404 LINK_INVALID, 410 LINK_EXPIRED, LINK_REVOKED, ALREADY_SUBMITTED). */
export type ClosedKind = "EXPIRED" | "REVOKED" | "SUBMITTED" | "INVALID";

const TONES = {
  EXPIRED: { icon: Clock, tile: "bg-status-pending-muted text-status-pending-foreground" },
  REVOKED: { icon: Unlink, tile: "bg-status-rejected-muted text-status-rejected-foreground" },
  SUBMITTED: { icon: CheckCircle2, tile: "bg-status-approved-muted text-status-approved-foreground" },
  INVALID: { icon: LinkIcon, tile: "bg-status-pending-muted text-status-pending-foreground" },
} as const;

/** "LINK_EXPIRED" → "EXPIRED"; anything unknown counts as an invalid link. */
export function closedKindOf(reason: string | null | undefined): ClosedKind {
  switch (reason) {
    case "LINK_EXPIRED":
      return "EXPIRED";
    case "LINK_REVOKED":
      return "REVOKED";
    case "ALREADY_SUBMITTED":
      return "SUBMITTED";
    default:
      return "INVALID";
  }
}

/** Design 44: why the link does not open, what it still tells, and whom to ask (a name; phone waits for M12). */
export function ClosedLink({ kind, link }: { kind: ClosedKind; link?: LinkContext | null }) {
  const t = useTranslations(`supplier.closed.${kind}` as never) as (key: string, values?: Record<string, string>) => string;
  const tClosed = useTranslations("supplier.closed");
  const tStep = useTranslations("enums.stepType");
  const dates = useDates();
  const { icon: Icon, tile } = TONES[kind];
  const manufacturer = link?.manufacturerName ?? "";

  const rows: { label: string; value: string; mono?: boolean }[] = [];
  if (link) {
    if (kind === "SUBMITTED") {
      if (link.submitterName) rows.push({ label: tClosed("sender"), value: link.submitterName });
      if (link.submittedAt) rows.push({ label: tClosed("sentAt"), value: dates.dateTimeShort(link.submittedAt) });
      if (link.code) rows.push({ label: tClosed("code"), value: link.code, mono: true });
    } else {
      rows.push({ label: tClosed("step"), value: tStep(link.stepType) });
      if (kind === "EXPIRED") rows.push({ label: tClosed("deadline"), value: dates.numeric(link.expiresAt) });
    }
  }

  return (
    <div className="flex flex-col gap-5 pt-4">
      <span className={cn("flex size-14 items-center justify-center rounded-full", tile)}>
        <Icon className="size-6" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="flex flex-col gap-2.5">
        <h1 className="font-serif text-[30px] leading-[1.1] font-normal tracking-[-0.02em]">{t("title")}</h1>
        <p className="text-base leading-[1.55] text-pretty text-muted-foreground">
          {t("body", { manufacturer, date: link ? dates.day(link.expiresAt) : "" })}
        </p>
      </div>
      {rows.length > 0 && <FactList rows={rows} />}
      <div className="flex flex-col gap-3 rounded-xl bg-muted p-4">
        <span className="text-[13px] font-semibold text-muted-foreground">{t("who")}</span>
        {link ? (
          <div className="flex items-center gap-3">
            <FirmTile name={link.manufacturerName} size={40} />
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-medium">{link.requesterName}</span>
              <span className="text-[13px] text-muted-foreground">{link.manufacturerName}</span>
            </span>
          </div>
        ) : (
          <p className="text-sm leading-[1.55]">{t("hint")}</p>
        )}
      </div>
      <span className="font-mono text-xs text-muted-foreground">{t("code")}</span>
    </div>
  );
}
