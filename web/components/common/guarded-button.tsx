"use client";

import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * A write action that read-only users see but cannot use: disabled (still focusable, so keyboard and
 * screen reader users reach the reason) with a tooltip "Bu işlem için yetkiniz yok".
 */
export function GuardedButton({ allowed, ...props }: ComponentProps<typeof Button> & { allowed: boolean }) {
  const t = useTranslations("common");
  if (allowed) return <Button {...props} />;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button {...props} onClick={undefined} disabled focusableWhenDisabled aria-description={t("readOnly")} />}
      />
      <TooltipContent>{t("readOnly")}</TooltipContent>
    </Tooltip>
  );
}
