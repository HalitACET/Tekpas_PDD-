"use client";

import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A write action that read-only users see but cannot use: disabled (still focusable, so keyboard and
 * screen reader users reach the reason) with a tooltip "Bu işlem için yetkiniz yok". In the page header the
 * tooltip opens below, right-aligned (design v0.3.1 21).
 */
export function GuardedButton({
  allowed,
  tooltipSide = "bottom",
  tooltipAlign = "end",
  ...props
}: ComponentProps<typeof Button> & {
  allowed: boolean;
  tooltipSide?: ComponentProps<typeof TooltipContent>["side"];
  tooltipAlign?: ComponentProps<typeof TooltipContent>["align"];
}) {
  const t = useTranslations("common");
  if (allowed) return <Button {...props} />;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button {...props} onClick={undefined} disabled focusableWhenDisabled aria-description={t("readOnly")} />}
      />
      <TooltipContent side={tooltipSide} align={tooltipAlign}>
        {t("readOnly")}
      </TooltipContent>
    </Tooltip>
  );
}
