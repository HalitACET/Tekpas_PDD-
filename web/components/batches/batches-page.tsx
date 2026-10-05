"use client";

import { BATCH_STATUSES, type BatchStatus } from "@tekpas/shared";
import { ChevronDown, Layers, Plus, Search, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { GuardedButton } from "@/components/common/guarded-button";
import { EmptyState, ListError, TableSkeleton } from "@/components/common/list-states";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useBatches } from "@/lib/api/batches";
import { useProducts } from "@/lib/api/products";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { BATCH_COLUMNS, BatchesTableHeader, BatchRow } from "./batches-table";
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
 * Design v0.3 07 (list) with 08 (create). Without any batch the approved empty state of design G (v0.2)
 * shows, with its "how to start" guide. "Partileri gör" on a product links here with ?productId=.
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
  const productId = searchParams.get("productId") ?? "";
  const setProductId = (id: string) => router.replace(id ? `${pathname}?productId=${id}` : pathname);
  const search = useDebounced(q, 250);

  const batches = useBatches({ q: search, status, productId });
  const products = useProducts({ q: "", category: "" });
  const productOptions = products.data?.content ?? [];

  const [creating, setCreating] = useState(false);
  const [now] = useState(() => new Date());
  const comingSoon = () => toast(tCommon("comingSoon.title"), { description: tCommon("comingSoon.description") });
  const filtered = q.trim() !== "" || status !== "" || productId !== "";
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

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 w-[280px] max-w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-muted-foreground focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/18">
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
          <FilterSelect label={t("statusFilter")} labelWidth="pl-[62px]" value={status} onChange={(v) => setStatus(v as BatchStatus | "")}>
            <option value="">{t("all")}</option>
            {BATCH_STATUSES.map((s) => (
              <option key={s} value={s}>
                {tStatus(s)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label={t("productFilter")} labelWidth="pl-[52px] max-w-[300px]" value={productId} onChange={setProductId}>
            <option value="">{t("all")}</option>
            {productOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
          {batches.data && (
            <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
              {t("count", { count: batches.data.totalElements })}
            </span>
          )}
        </div>

        {/* Below md the design has no list yet (16, mobile): the desktop table scrolls sideways. */}
        <div className="overflow-x-auto rounded-lg border bg-card">
          <div role="table" aria-label={tPage("title")} aria-busy={batches.isFetching} className="min-w-[1000px]">
            <BatchesTableHeader />
            {batches.isPending ? (
              <TableSkeleton columns={BATCH_COLUMNS} label={tCommon("loading")} />
            ) : batches.isError && !batches.data ? (
              <ListError onRetry={() => void batches.refetch()} retrying={batches.isFetching} />
            ) : rows.length === 0 ? (
              <div className="sticky left-0 w-[min(100vw-2rem,100%)]">
                {filtered ? (
                  <EmptyState icon={Layers} title={t("empty.filteredTitle")} body={t("empty.filteredBody")}>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setQ("");
                        setStatus("");
                        setProductId("");
                      }}
                    >
                      {t("empty.clearFilters")}
                    </Button>
                  </EmptyState>
                ) : (
                  <EmptyState
                    icon={Layers}
                    title={tPage("emptyTitle")}
                    body={tPage("emptyBody")}
                    footer={<Guide label={tPage("guide.label")} steps={guide} />}
                  >
                    <GuardedButton allowed={canWrite} onClick={() => setCreating(true)}>
                      {tPage("cta")}
                    </GuardedButton>
                    <GuardedButton allowed={canWrite} variant="secondary" onClick={comingSoon}>
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

function FilterSelect({
  label,
  labelWidth,
  value,
  onChange,
  children,
}: {
  label: string;
  labelWidth: string;
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
        className={`h-8 cursor-pointer appearance-none truncate rounded-md border border-input bg-card pr-[30px] text-[13px] font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/18 ${labelWidth}`}
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
