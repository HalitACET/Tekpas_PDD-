"use client";

import { Combobox } from "@base-ui/react/combobox";
import type { Fiber } from "@tekpas/shared";
import { ChevronDown, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { ProductListItem } from "@/lib/api/products";
import { displayGtin, fiberText } from "@/lib/format";

/**
 * Design v0.3 08 product picker: a 40 px field showing the chosen product and its GTIN; open, it becomes a
 * search over name and GTIN with a count, each option showing the fiber composition and GTIN.
 */
export function ProductCombobox({
  id,
  products,
  value,
  onChange,
  invalid,
}: {
  id: string;
  products: ProductListItem[];
  value: string;
  onChange: (productId: string) => void;
  invalid?: boolean;
}) {
  const t = useTranslations("batches.create");
  const tFiber = useTranslations("enums.fiber");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value) ?? null;

  const matches = (product: ProductListItem, query: string) => {
    const q = query.trim().toLocaleLowerCase(locale);
    if (!q) return true;
    return [product.name, product.gtin, displayGtin(product.gtin)].some((v) => v.toLocaleLowerCase(locale).includes(q));
  };

  return (
    <Combobox.Root
      items={products}
      value={selected}
      onValueChange={(product: ProductListItem | null) => onChange(product?.id ?? "")}
      open={open}
      onOpenChange={setOpen}
      itemToStringLabel={(product: ProductListItem) => product.name}
      isItemEqualToValue={(a: ProductListItem, b: ProductListItem) => a.id === b.id}
      filter={matches}
      openOnInputClick
      autoHighlight
    >
      <Combobox.InputGroup
        aria-invalid={invalid || undefined}
        className="relative flex h-10 items-center gap-2 rounded-md border border-input bg-card px-2.5 shadow-xs transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/18 aria-invalid:border-status-rejected aria-invalid:ring-[3px] aria-invalid:ring-status-rejected-muted data-popup-open:border-ring data-popup-open:ring-[3px] data-popup-open:ring-ring/18"
      >
        {open && <Search className="size-[15px] flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />}
        <Combobox.Input
          id={id}
          placeholder={open ? t("productSearch") : t("productPlaceholder")}
          className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {!open && selected && (
          <span className="font-mono text-[11px] text-muted-foreground">{displayGtin(selected.gtin)}</span>
        )}
        <Combobox.Trigger
          aria-label={t("product")}
          className="flex size-6 cursor-pointer items-center justify-center text-muted-foreground outline-none"
        >
          <ChevronDown className="size-4" strokeWidth={1.75} aria-hidden />
        </Combobox.Trigger>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} className="isolate z-50 outline-none">
          <Combobox.Popup className="flex max-h-[min(320px,var(--available-height))] w-(--anchor-width) flex-col rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-none">
            <ProductCount label={(count) => t("productCount", { count })} />
            <Combobox.Empty>
              <span className="block px-2 py-3 text-[13px] text-muted-foreground">{t("productNone")}</span>
            </Combobox.Empty>
            <Combobox.List className="overflow-y-auto outline-none">
              {(product: ProductListItem) => (
                <Combobox.Item
                  key={product.id}
                  value={product}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md p-2 outline-none select-none data-highlighted:bg-accent data-selected:bg-accent"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px] font-medium">{product.name}</span>
                    {product.declaredFiberComposition && (
                      <span className="truncate text-xs text-muted-foreground">
                        {fiberText(product.declaredFiberComposition, locale, (f: Fiber) => tFiber(f))}
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{displayGtin(product.gtin)}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}

/** "2 ürün": how many products the current search shows. */
function ProductCount({ label }: { label: (count: number) => string }) {
  const items = Combobox.useFilteredItems<ProductListItem>();
  return (
    <span className="px-2 py-1.5 text-[11px] text-muted-foreground" aria-live="polite">
      {label(items.length)}
    </span>
  );
}
