"use client";

import { useTranslations } from "next-intl";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { IssueCounts } from "@/lib/api/issues";

/**
 * The dot beside a batch's status chip in the list (design v0.7 87): red with the number of open blocking alerts, else
 * orange with the number of open warnings. Info level is not shown in the list.
 */
export function IssueDot({ counts }: { counts: IssueCounts }) {
  const t = useTranslations("issues");
  const blocking = counts.errors > 0;
  const n = blocking ? counts.errors : counts.warnings;
  if (n === 0) return null;
  const text = blocking ? t("listDotBlocking", { count: n }) : t("listDotWarnings", { count: n });
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-label={text}
            className={`flex items-center gap-1 rounded-full font-mono text-[11px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft ${
              blocking ? "text-status-rejected-foreground" : "text-status-expiring-foreground"
            }`}
          />
        }
      >
        <span className={`size-2 rounded-full ${blocking ? "bg-status-rejected" : "bg-status-expiring"}`} aria-hidden />
        {n}
      </TooltipTrigger>
      <TooltipContent side="top">{text}</TooltipContent>
    </Tooltip>
  );
}
