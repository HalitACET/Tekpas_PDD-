"use client";

import type { Fiber } from "@tekpas/shared";
import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProductListItem } from "@/lib/api/products";
import { displayGtin, fiberText, formatUpdated } from "@/lib/format";

/** Column template of design v0.3 01. */
export const PRODUCT_COLUMNS = "grid-cols-[170px_minmax(0,1fr)_130px_250px_80px_110px_48px]";

const MENU_BUTTON =
  "flex size-8 cursor-pointer items-center justify-center rounded-md border border-transparent text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft data-popup-open:border-input data-popup-open:bg-accent";

export function ProductsTableHeader() {
  const t = useTranslations("products.cols");
  return (
    <div
      role="row"
      className={`grid h-9 items-center rounded-t-lg border-b bg-muted pr-1 pl-4 text-xs font-medium text-muted-foreground ${PRODUCT_COLUMNS}`}
    >
      <span role="columnheader">{t("gtin")}</span>
      <span role="columnheader">{t("product")}</span>
      <span role="columnheader">{t("category")}</span>
      <span role="columnheader">{t("fibers")}</span>
      <span role="columnheader" className="pr-4 text-right">
        {t("batches")}
      </span>
      <span role="columnheader">{t("updated")}</span>
      <span role="columnheader" />
    </div>
  );
}

export function ProductRow({
  product,
  canWrite,
  now,
  onEdit,
  onDelete,
}: {
  product: ProductListItem;
  canWrite: boolean;
  now: Date;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("products");
  const tCommon = useTranslations("common");
  const tFiber = useTranslations("enums.fiber");
  const tCategory = useTranslations("enums.productCategory");
  const locale = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuLabel = `${t("rowMenu.label")}: ${product.name}`;

  return (
    <div
      role="row"
      data-menu-open={menuOpen || undefined}
      className={`grid h-12 items-center border-b pr-1 pl-4 text-[13px] last:border-b-0 hover:bg-accent data-menu-open:bg-accent ${PRODUCT_COLUMNS}`}
    >
      <span role="cell" className="font-mono text-xs tabular-nums">
        {displayGtin(product.gtin)}
      </span>
      <span role="cell" className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{product.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{product.sku}</span>
      </span>
      <span role="cell">
        <span className="rounded-[4px] border px-[7px] py-0.5 text-[11px] font-medium">{tCategory(product.category)}</span>
      </span>
      <span role="cell" className="truncate">
        {product.declaredFiberComposition
          ? fiberText(product.declaredFiberComposition, locale, (f: Fiber) => tFiber(f))
          : null}
      </span>
      <span role="cell" className={`pr-4 text-right tabular-nums ${product.batchCount ? "" : "text-muted-foreground"}`}>
        {product.batchCount}
      </span>
      <span role="cell" className="text-xs text-muted-foreground">
        <time dateTime={product.updatedAt}>{formatUpdated(product.updatedAt, now, locale, t("yesterday"))}</time>
      </span>
      <span role="cell" className="flex justify-center">
        {canWrite ? (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger aria-label={menuLabel} className={MENU_BUTTON}>
              <Ellipsis className="size-4" strokeWidth={1.75} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="w-[180px] p-1">
              <DropdownMenuItem onClick={onEdit} className="h-8 gap-2 rounded-[4px] px-2 text-[13px]">
                <Pencil className="size-[15px]" strokeWidth={1.75} aria-hidden />
                {t("rowMenu.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="mx-0" />
              <DropdownMenuItem
                onClick={onDelete}
                className="h-8 gap-2 rounded-[4px] px-2 text-[13px] text-status-rejected-foreground focus:bg-status-rejected-muted focus:text-status-rejected-foreground not-data-[variant=destructive]:focus:**:text-status-rejected-foreground"
              >
                <Trash2 className="size-[15px]" strokeWidth={1.75} aria-hidden />
                {t("rowMenu.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          // Read-only users see the menu button disabled, with the reason (design debt: not in v0.3).
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
            <TooltipContent>{tCommon("readOnly")}</TooltipContent>
          </Tooltip>
        )}
      </span>
    </div>
  );
}
