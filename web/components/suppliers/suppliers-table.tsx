"use client";

import { formatPhone, type StepStatus } from "@tekpas/shared";
import { Ellipsis, Pencil, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StepStatusBadge } from "@/components/common/step-status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SupplierResponse } from "@/lib/api/suppliers";

/** Column template of design v0.3 14 (v0.3.1 27/28 add the row menu). */
export const SUPPLIER_COLUMNS = "grid-cols-[minmax(0,1fr)_120px_140px_170px_160px_70px_150px_40px]";

const MENU_BUTTON =
  "flex size-8 cursor-pointer items-center justify-center rounded-md border border-transparent text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft data-popup-open:border-input data-popup-open:bg-accent";

export function SuppliersTableHeader() {
  const t = useTranslations("suppliers.cols");
  return (
    <div
      role="row"
      className={`grid h-9 items-center rounded-t-lg border-b bg-muted px-4 text-xs font-medium text-muted-foreground ${SUPPLIER_COLUMNS}`}
    >
      <span role="columnheader">{t("name")}</span>
      <span role="columnheader">{t("type")}</span>
      <span role="columnheader">{t("city")}</span>
      <span role="columnheader">{t("contact")}</span>
      <span role="columnheader">{t("certificates")}</span>
      <span role="columnheader" className="pr-5 text-right">
        {t("batches")}
      </span>
      <span role="columnheader">{t("status")}</span>
      <span role="columnheader" />
    </div>
  );
}

/** A dash for a value that is not there yet, with the reason for screen readers. */
function Missing({ reason }: { reason: string }) {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">{reason}</span>
    </span>
  );
}

export function SupplierRow({
  supplier,
  canWrite,
  onEdit,
  onRemove,
}: {
  supplier: SupplierResponse;
  canWrite: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations("suppliers");
  const tType = useTranslations("enums.companyType");
  const tCommon = useTranslations("common");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuLabel = `${t("rowMenu.label")}: ${supplier.name}`;

  return (
    <div
      role="row"
      data-menu-open={menuOpen || undefined}
      className={`grid h-12 items-center border-b px-4 text-[13px] last:border-b-0 hover:bg-accent data-menu-open:bg-accent ${SUPPLIER_COLUMNS}`}
    >
      <span role="cell" className="truncate font-medium">
        {supplier.name}
      </span>
      <span role="cell">
        <span className="rounded-[4px] border px-[7px] py-0.5 text-[11px] font-medium">{tType(supplier.type)}</span>
      </span>
      <span role="cell" className="text-muted-foreground">
        {supplier.city}
      </span>
      <span role="cell" className="font-mono text-xs">
        {supplier.phone ? formatPhone(supplier.phone) : <Missing reason={t("noPhone")} />}
      </span>
      <span role="cell">
        {/* Certificates arrive with documents (M5). */}
        <Missing reason={t("noCertificates")} />
      </span>
      <span role="cell" className={`pr-5 text-right tabular-nums ${supplier.batchCount ? "" : "text-muted-foreground"}`}>
        {supplier.batchCount}
      </span>
      <span role="cell">
        {supplier.latestStepStatus ? (
          <StepStatusBadge status={supplier.latestStepStatus as StepStatus} />
        ) : (
          <Missing reason={t("noStatus")} />
        )}
      </span>
      <span role="cell" className="flex justify-center">
        {canWrite ? (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger aria-label={menuLabel} className={MENU_BUTTON}>
              <Ellipsis className="size-4" strokeWidth={1.75} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-[190px] p-1">
              <DropdownMenuItem onClick={onEdit} className="h-8 gap-2 rounded-[4px] px-2 text-[13px]">
                <Pencil className="size-[15px]" strokeWidth={1.75} aria-hidden />
                {t("rowMenu.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-0" />
              <DropdownMenuItem
                onClick={onRemove}
                className="h-8 gap-2 rounded-[4px] px-2 text-[13px] text-status-rejected-foreground focus:bg-status-rejected-muted focus:text-status-rejected-foreground not-data-[variant=destructive]:focus:**:text-status-rejected-foreground"
              >
                <Unlink className="size-[15px]" strokeWidth={1.75} aria-hidden />
                {t("rowMenu.remove")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={menuLabel}
                  aria-description={tCommon("readOnly")}
                  disabled
                  focusableWhenDisabled
                  className="text-muted-foreground"
                />
              }
            >
              <Ellipsis className="size-4" strokeWidth={1.75} aria-hidden />
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              {tCommon("readOnly")}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </div>
  );
}
