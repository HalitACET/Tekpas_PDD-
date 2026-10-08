"use client";

import { SUPPLIER_TYPES, type SupplierType } from "@tekpas/shared";
import { ChevronDown, Factory, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { GuardedButton } from "@/components/common/guarded-button";
import { EmptyState, ListError, TableSkeleton } from "@/components/common/list-states";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type SupplierResponse, useSuppliers } from "@/lib/api/suppliers";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { RemoveSupplierDialog } from "./remove-supplier-dialog";
import { SupplierDialog, type SupplierDialogState } from "./supplier-dialog";
import { SupplierRow, SuppliersTableHeader } from "./suppliers-table";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Design v0.3 14 (list) and 15 (add, also used to edit), v0.3.1 27/28 (removing the link). Certificates show
 * "—" until documents arrive (M5); the status is the supplier's latest step status, "—" without steps.
 */
export function SuppliersPage() {
  const t = useTranslations("suppliers");
  const tPage = useTranslations("pages.suppliers");
  const tCommon = useTranslations("common");
  const tType = useTranslations("enums.companyType");
  const session = useSession();
  const canWrite = session.status === "authenticated" && canWriteCatalog(session.user.role);

  const [q, setQ] = useState("");
  const [type, setType] = useState<SupplierType | "">("");
  const search = useDebounced(q, 250);
  const suppliers = useSuppliers({ q: search, type });
  const rows = suppliers.data?.content ?? [];
  const filtered = q.trim() !== "" || type !== "";

  const [dialog, setDialog] = useState<SupplierDialogState>();
  const [removing, setRemoving] = useState<SupplierResponse>();

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl leading-7 font-semibold tracking-[-0.015em]">{tPage("title")}</h1>
            <p className="text-[13px] leading-[normal] text-muted-foreground">{tPage("sub")}</p>
          </div>
          <div className="ml-auto flex gap-3">
            <GuardedButton allowed={canWrite} onClick={() => setDialog({ kind: "new" })}>
              <Plus strokeWidth={1.75} aria-hidden />
              {t("actions.new")}
            </GuardedButton>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 w-[280px] max-w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-muted-foreground focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring-soft">
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
            <span className="pointer-events-none absolute left-2.5 text-[13px] text-muted-foreground">{t("typeFilter")}</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as SupplierType | "")}
              aria-label={t("typeFilter")}
              className="h-8 w-[146px] cursor-pointer appearance-none rounded-md border border-input bg-card pr-[30px] pl-10 text-[13px] font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft"
            >
              <option value="">{t("all")}</option>
              {SUPPLIER_TYPES.map((s) => (
                <option key={s} value={s}>
                  {tType(s)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          </label>
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {suppliers.isPending
              ? tCommon("loading")
              : suppliers.data
                ? t("count", { count: suppliers.data.totalElements })
                : null}
          </span>
        </div>

        {/* Below md the design has no list yet (16, mobile): the desktop table scrolls sideways. */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <div role="table" aria-label={tPage("title")} aria-busy={suppliers.isFetching} className="min-w-[1080px]">
            <SuppliersTableHeader />
            {suppliers.isPending ? (
              <TableSkeleton label={tCommon("loading")} />
            ) : suppliers.isError && !suppliers.data ? (
              <ListError
                title={t("listError")}
                error={suppliers.error}
                onRetry={() => void suppliers.refetch()}
                retrying={suppliers.isFetching}
              />
            ) : rows.length === 0 ? (
              <div className="sticky left-0 w-[min(100vw-2rem,100%)]">
                {filtered ? (
                  <EmptyState icon={Factory} title={t("empty.filteredTitle")} body={t("empty.filteredBody")}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQ("");
                        setType("");
                      }}
                    >
                      {t("empty.clearFilters")}
                    </Button>
                  </EmptyState>
                ) : (
                  <EmptyState icon={Factory} title={tPage("emptyTitle")} body={tPage("emptyBody")}>
                    <GuardedButton allowed={canWrite} tooltipAlign="center" onClick={() => setDialog({ kind: "new" })}>
                      {t("actions.new")}
                    </GuardedButton>
                  </EmptyState>
                )}
              </div>
            ) : (
              <div role="rowgroup">
                {rows.map((supplier) => (
                  <SupplierRow
                    key={supplier.id}
                    supplier={supplier}
                    canWrite={canWrite}
                    onEdit={() => setDialog({ kind: "edit", supplier })}
                    onRemove={() => setRemoving(supplier)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <SupplierDialog state={dialog} onClose={() => setDialog(undefined)} />
      <RemoveSupplierDialog supplier={removing} onClose={() => setRemoving(undefined)} />
    </TooltipProvider>
  );
}
