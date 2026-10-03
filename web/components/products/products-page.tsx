"use client";

import { PRODUCT_CATEGORIES, type ProductCategory } from "@tekpas/shared";
import { ChevronDown, Package, Plus, Search, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GuardedButton } from "@/components/common/guarded-button";
import { EmptyState, ListError, TableSkeleton } from "@/components/common/list-states";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type ProductListItem, useProducts, useProductTotal } from "@/lib/api/products";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { DeleteProductDialog } from "./delete-product-dialog";
import { ProductSheet, type ProductSheetTarget } from "./product-sheet";
import { PRODUCT_COLUMNS, ProductRow, ProductsTableHeader } from "./products-table";

/** Waits until the user pauses typing before searching. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** Design v0.3 01 (list with row menu) and 02 (empty), with the sheet (03/04) and delete dialogs (05/06). */
export function ProductsPage() {
  const t = useTranslations("products");
  const tPage = useTranslations("pages.products");
  const tCommon = useTranslations("common");
  const tCategory = useTranslations("enums.productCategory");
  const session = useSession();
  const canWrite = session.status === "authenticated" && canWriteCatalog(session.user.role);

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<ProductCategory | "">("");
  const search = useDebounced(q, 250);
  const products = useProducts({ q: search, category });
  const total = useProductTotal();

  const [sheet, setSheet] = useState<ProductSheetTarget>();
  const [deleting, setDeleting] = useState<ProductListItem>();
  // One "now" per render pass, so every row formats against the same day.
  const [now] = useState(() => new Date());

  const comingSoon = () => toast(tCommon("comingSoon.title"), { description: tCommon("comingSoon.description") });
  const filtered = q.trim() !== "" || category !== "";
  const rows = products.data?.content ?? [];

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.015em]">{tPage("title")}</h1>
            <p className="text-[13px] leading-[normal] text-muted-foreground">{tPage("sub")}</p>
          </div>
          <div className="ml-auto flex gap-3">
            <GuardedButton allowed={canWrite} variant="secondary" onClick={comingSoon}>
              <Upload strokeWidth={1.75} aria-hidden />
              {t("actions.import")}
            </GuardedButton>
            <GuardedButton allowed={canWrite} onClick={() => setSheet({ kind: "new" })}>
              <Plus strokeWidth={1.75} aria-hidden />
              {t("actions.new")}
            </GuardedButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 w-[300px] max-w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-muted-foreground focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/18">
            <Search className="size-3.5 flex-none" strokeWidth={1.75} aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("search")}
              aria-label={t("search")}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <label className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 text-[13px] text-muted-foreground">
              {t("categoryFilter")}
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ProductCategory | "")}
              aria-label={t("categoryFilter")}
              className="h-8 cursor-pointer appearance-none rounded-md border border-input bg-card pr-[30px] pl-[74px] text-[13px] font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/18"
            >
              <option value="">{t("allCategories")}</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {tCategory(c)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          </label>
          {products.data && total.data !== undefined && (
            <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
              {t("count", { shown: products.data.totalElements, total: total.data })}
            </span>
          )}
        </div>

        {/* Below md the design has no list yet (16, mobile): the desktop table scrolls sideways. */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <div role="table" aria-label={tPage("title")} aria-busy={products.isFetching} className="min-w-[1000px]">
            <ProductsTableHeader />
            {products.isPending ? (
              <TableSkeleton columns={PRODUCT_COLUMNS} label={tCommon("loading")} />
            ) : products.isError && !products.data ? (
              <ListError onRetry={() => void products.refetch()} retrying={products.isFetching} />
            ) : rows.length === 0 ? (
              <div className="sticky left-0 w-[min(100vw-2rem,100%)]">
                {filtered ? (
                  <EmptyState icon={Package} title={t("empty.filteredTitle")} body={t("empty.filteredBody")}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQ("");
                        setCategory("");
                      }}
                    >
                      {t("empty.clearFilters")}
                    </Button>
                  </EmptyState>
                ) : (
                  <EmptyState icon={Package} title={t("empty.title")} body={t("empty.body")}>
                    <GuardedButton allowed={canWrite} onClick={() => setSheet({ kind: "new" })}>
                      {t("actions.new")}
                    </GuardedButton>
                    <GuardedButton allowed={canWrite} variant="secondary" onClick={comingSoon}>
                      {t("actions.import")}
                    </GuardedButton>
                  </EmptyState>
                )}
              </div>
            ) : (
              <div role="rowgroup">
                {rows.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    canWrite={canWrite}
                    now={now}
                    onEdit={() => setSheet({ kind: "edit", id: product.id })}
                    onDelete={() => setDeleting(product)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ProductSheet target={sheet} onClose={() => setSheet(undefined)} />
      <DeleteProductDialog product={deleting} onClose={() => setDeleting(undefined)} />
    </TooltipProvider>
  );
}
