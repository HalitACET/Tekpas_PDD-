"use client";

import { BATCH_STATUSES, type BatchStatus } from "@tekpas/shared";
import { ChevronDown, Layers, Plus, Search, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { GuardedButton } from "@/components/common/guarded-button";
import { EmptyState, FilteredEmpty, ListError, TableSkeleton } from "@/components/common/list-states";
import { ServerWakeStrip, useListWake } from "@/components/common/server-wake";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type BatchStatusCounts, useBatches, useBatchStatusCounts } from "@/lib/api/batches";
import { useProducts } from "@/lib/api/products";
import { useSupplier } from "@/lib/api/suppliers";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { queryKeys } from "@/lib/query-keys";
import { useSession } from "@/lib/auth/use-session";
import { BatchesTableHeader, BatchRow } from "./batches-table";
import { CreateBatchDialog } from "./create-batch-dialog";

interface GuideStep {
  title: string;
  body: string;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Design v0.3 07 (list) with 08 (create), stage tabs of v0.3.1 22. Without any batch the approved empty
 * state of design G (v0.2) shows, with its "how to start" guide. "Partileri gör" on a product links here
 * with ?productId=.
 */
export function BatchesPage() {
  const t = useTranslations("batches");
  const tPage = useTranslations("pages.batches");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("enums.batchStatus");
  const session = useSession();
  const canWrite = session.status === "authenticated" && canWriteCatalog(session.user.role);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<BatchStatus | "">("");
  // The product and supplier filters live in the URL ("Partileri gör" on a product or a supplier links here).
  const productId = searchParams.get("productId") ?? "";
  const supplierId = searchParams.get("supplierId") ?? "";
  const setParam = (key: "productId" | "supplierId", value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };
  const setProductId = (id: string) => setParam("productId", id);
  const search = useDebounced(q, 250);

  const batches = useBatches({ q: search, status, productId, supplierId });
  // A sleeping server (design v0.3.2 32): poll, then fetch the list again once it answers.
  const { wake, retry: retryWake } = useListWake(batches, queryKeys.batches.list({ q: search, status, productId, supplierId }));
  const supplier = useSupplier(supplierId || undefined);
  const counts = useBatchStatusCounts();
  const products = useProducts({ q: "", category: "" });
  const productOptions = products.data?.content ?? [];

  const [creating, setCreating] = useState(false);
  const [now] = useState(() => new Date());
  const comingSoon = () => toast(tCommon("comingSoon.title"), { description: tCommon("comingSoon.description") });
  const filtered = q.trim() !== "" || status !== "" || productId !== "" || supplierId !== "";
  const rows = batches.data?.content ?? [];
  const guide = tPage.raw("guide.steps") as GuideStep[];

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
            <GuardedButton allowed={canWrite} onClick={() => setCreating(true)}>
              <Plus strokeWidth={1.75} aria-hidden />
              {t("actions.new")}
            </GuardedButton>
          </div>
        </div>

        <StageTabs
          label={t("statusFilter")}
          value={status}
          onChange={setStatus}
          // While the server starts the counts are a skeleton, never a stale number (v0.3.2 32).
          counts={wake.phase === "waking" ? undefined : counts.data}
        />

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
          {supplierId && (
            // Design v0.3.2 35: right after the search, on --muted.
            <span className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-muted pr-1 pl-2.5 text-[13px]">
              <span className="text-muted-foreground">
                {t("supplierFilter")}
              </span>
              <span className="max-w-[220px] truncate font-medium">{supplier.data?.name ?? "…"}</span>
              <button
                type="button"
                onClick={() => setParam("supplierId", "")}
                aria-label={t("clearSupplier")}
                className="flex size-6 cursor-pointer items-center justify-center rounded-[4px] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
              >
                <X className="size-3.5" strokeWidth={1.75} aria-hidden />
              </button>
            </span>
          )}
          <FilterSelect label={t("productFilter")} value={productId} onChange={setProductId}>
            <option value="">{t("all")}</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
          <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {batches.isPending
              ? tCommon("loading")
              : batches.data
                ? t("count", { count: batches.data.totalElements })
                : null}
          </span>
        </div>

        {wake.phase === "waking" && <ServerWakeStrip startedAt={wake.startedAt} />}

        {/* Below md the design has no list yet (16, mobile): the desktop table scrolls sideways. */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <div role="table" aria-label={tPage("title")} aria-busy={batches.isFetching} className="min-w-[1000px]">
            <BatchesTableHeader />
            {wake.phase === "gaveUp" ? (
              <ListError
                title={t("listError")}
                error={undefined}
                onRetry={retryWake}
              />
            ) : batches.isPending ? (
              <TableSkeleton label={tCommon("loading")} />
            ) : batches.isError && !batches.data ? (
              <ListError
                title={t("listError")}
                error={batches.error}
                onRetry={() => void batches.refetch()}
                retrying={batches.isFetching}
              />
            ) : rows.length === 0 ? (
              <div className="sticky left-0 w-[min(100vw-2rem,100%)]">
                {filtered ? (
                  <FilteredEmpty
                    title={t("empty.filteredTitle")}
                    body={t("empty.filteredBody")}
                    filters={[
                      q.trim() && t("empty.search", { q: q.trim() }),
                      status && t("empty.status", { status: tStatus(status) }),
                      productId && t("empty.product", { name: productOptions.find((p) => p.id === productId)?.name ?? "…" }),
                      supplierId && t("empty.supplier", { name: supplier.data?.name ?? "…" }),
                    ].filter((part): part is string => !!part)}
                    clearLabel={t("empty.clearFilters")}
                    onClear={() => {
                      setQ("");
                      setStatus("");
                      router.replace(pathname);
                    }}
                  />
                ) : (
                  <EmptyState
                    icon={Layers}
                    title={tPage("emptyTitle")}
                    body={tPage("emptyBody")}
                    footer={<Guide label={tPage("guide.label")} steps={guide} />}
                  >
                    <GuardedButton allowed={canWrite} tooltipAlign="center" onClick={() => setCreating(true)}>
                      {tPage("cta")}
                    </GuardedButton>
                    <GuardedButton allowed={canWrite} tooltipAlign="center" variant="secondary" onClick={comingSoon}>
                      {tPage("cta2")}
                    </GuardedButton>
                  </EmptyState>
                )}
              </div>
            ) : (
              <div role="rowgroup">
                {rows.map((batch) => (
                  <BatchRow key={batch.id} batch={batch} now={now} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <CreateBatchDialog open={creating} onClose={() => setCreating(false)} products={productOptions} />
    </TooltipProvider>
  );
}

/**
 * Stage tabs with counts (design v0.3.1 22): they filter the list by batch status. The counts are the
 * company's batches per status, independent of the search and product filter, as in the design.
 */
function StageTabs({
  label,
  value,
  onChange,
  counts,
}: {
  label: string;
  value: BatchStatus | "";
  onChange: (value: BatchStatus | "") => void;
  counts: BatchStatusCounts | undefined;
}) {
  const t = useTranslations("batches");
  const tStatus = useTranslations("enums.batchStatus");
  const tabs: { value: BatchStatus | ""; label: string; count: number | undefined }[] = [
    { value: "", label: t("all"), count: counts?.all },
    ...BATCH_STATUSES.map((s) => ({ value: s, label: tStatus(s), count: counts?.[s] })),
  ];
  return (
    <div role="group" aria-label={label} className="flex max-w-full gap-0.5 self-start overflow-x-auto rounded-lg bg-muted p-[3px]">
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value || "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(tab.value)}
            className={`flex h-[30px] shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft ${
              active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="font-mono text-[11px] font-medium text-muted-foreground">{tab.count}</span>
            ) : (
              <Skeleton className="h-2.5 w-3 rounded-[3px]" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="relative flex items-center">
      <span className="pointer-events-none absolute left-2.5 text-[13px] text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-8 w-[270px] max-w-full cursor-pointer appearance-none truncate rounded-md border border-input bg-card pr-[30px] pl-[52px] text-[13px] font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
    </label>
  );
}

/** The "how to start" steps of the design G empty state (v0.2). */
function Guide({ label, steps }: { label: string; steps: GuideStep[] }) {
  return (
    <ol
      aria-label={label}
      className="mt-7 flex flex-wrap justify-center gap-7 border-t pt-5 text-left text-[13px]"
    >
      {steps.map((step, i) => (
        <li key={step.title} className="flex items-center gap-2.5">
          <span
            className="flex size-[22px] items-center justify-center rounded-full border border-input font-mono text-[11px] font-medium text-muted-foreground"
            aria-hidden
          >
            {i + 1}
          </span>
          <span className="flex flex-col leading-[normal]">
            <span className="font-medium">{step.title}</span>
            <span className="text-xs leading-[normal] text-muted-foreground">{step.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
