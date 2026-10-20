"use client";

import type { Fiber, StepStatus } from "@tekpas/shared";
import { Clock, Layers, MoveRight, Plus, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { GuardedButton } from "@/components/common/guarded-button";
import { EmptyState, ListError } from "@/components/common/list-states";
import { ServerWakeStrip, useListWake } from "@/components/common/server-wake";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  type BatchResponse,
  type ChainResponse,
  useBatch,
  useBatchChain,
  useCreateDefaultChain,
} from "@/lib/api/batches";
import { type IssueCounts, type IssueSeverity, topSeverity, useBatchIssues } from "@/lib/api/issues";
import { useBatchScore } from "@/lib/api/passports";
import { useProduct } from "@/lib/api/products";
import { ApiError } from "@/lib/api/request";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { DRAWN_STEP_TYPES, isDrawn } from "@/lib/batches/chain-layout";
import { useSetBreadcrumbDetail } from "@/lib/breadcrumb";
import { displayGtin, fiberText, formatDateRange, formatQuantity } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { type ChainPanel, ChainPanels, panelFor } from "./chain-panels";
import { AlertsTab } from "./issues/alerts-tab";
import { LifecycleChip } from "./passport/lifecycle-chip";
import { PublishActions } from "./passport/publish-actions";
import { QrCard } from "./passport/qr-card";
import { ScoreCard } from "./passport/score-card";
import { useVersionFacts } from "./passport/use-version-facts";
import { VersionsTab } from "./passport/versions-tab";
import { ChainLegend, type ChainNodeStep, SupplyChainCanvas, toNodeStep } from "./supply-chain";

/**
 * Design v0.3 09 (with v0.3.1 26 and 29) and v0.6: the batch header with the publishing actions, the supply chain and
 * the passport versions in tabs, and the compliance score and the QR code beside them. Documents and alerts follow
 * with M5 and M7.
 */
export function BatchDetailPage({ id }: { id: string }) {
  const t = useTranslations("batches.detail");
  const tCommon = useTranslations("common");
  const batch = useBatch(id);
  const chain = useBatchChain(id);
  const { wake, retry } = useListWake(batch, queryKeys.batches.detail(id));
  useSetBreadcrumbDetail(batch.data?.batchNo);

  if (batch.isError && batch.error instanceof ApiError && batch.error.status === 404) {
    return (
      <EmptyState icon={Layers} title={t("notFoundTitle")} body={t("notFoundBody")}>
        <Link href="/batches" className={cn(buttonVariants({ variant: "secondary" }))}>
          {t("back")}
        </Link>
      </EmptyState>
    );
  }
  if (wake.phase === "gaveUp" || (batch.isError && !batch.data)) {
    return (
      <div className="rounded-lg border bg-card">
        <ListError
          title={t("loadError")}
          error={wake.phase === "gaveUp" ? undefined : batch.error}
          onRetry={wake.phase === "gaveUp" ? retry : () => void batch.refetch()}
          retrying={batch.isFetching}
          keepsFilters={false}
        />
      </div>
    );
  }
  if (!batch.data) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true" aria-label={tCommon("loading")}>
        {wake.phase === "waking" && <ServerWakeStrip startedAt={wake.startedAt} />}
        <DetailSkeleton />
      </div>
    );
  }
  return <BatchDetail batch={batch.data} chain={chain} />;
}

const openTotal = (counts: IssueCounts) => counts.errors + counts.warnings + counts.infos;

function BatchDetail({ batch, chain }: { batch: BatchResponse; chain: ReturnType<typeof useBatchChain> }) {
  const t = useTranslations("batches.detail");
  const tFiber = useTranslations("enums.fiber");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const score = useBatchScore(batch.id);
  const param = searchParams.get("tab");
  const tab = param === "versions" || param === "alerts" ? param : "chain";
  const hasPassport = !!batch.passport && !batch.passport.withdrawn;
  const { live } = useVersionFacts(batch.id, hasPassport);
  const issues = useBatchIssues(batch.id, "OPEN");
  const steps = useMemo(() => {
    // The codes of the step's open alerts, blocking first (design v0.7 86a); info level does not mark the chain.
    const codes = new Map<string, { code: string; severity: IssueSeverity }[]>();
    for (const issue of issues.data?.issues ?? []) {
      if (!issue.stepId || issue.severity === "INFO") continue;
      codes.set(issue.stepId, [...(codes.get(issue.stepId) ?? []), { code: issue.code, severity: issue.severity }]);
    }
    return (chain.data?.steps ?? [])
      .filter((s) => isDrawn(s.stepType))
      .map((s) => ({ ...toNodeStep(s, (f: Fiber) => tFiber(f)), issueCodes: codes.get(s.id) }));
  }, [chain.data, issues.data, tFiber]);
  const selectTab = (next: "chain" | "versions" | "alerts") => {
    const params = new URLSearchParams(searchParams.toString());
    // The chain's own deep links (?step=, ?open=) belong to the chain tab only.
    if (next !== "chain") {
      params.set("tab", next);
      params.delete("step");
      params.delete("open");
    } else {
      params.delete("tab");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <BatchHeader batch={batch} onShowAlerts={() => selectTab("alerts")} />
          <PublishActions batch={batch} score={score} />
        </div>
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <nav aria-label={t("tabs.label")} className="flex gap-1 border-b">
              <Tab label={t("tabs.chain")} count={String(chain.data?.steps.length ?? batch.chain.totalSteps)} active={tab === "chain"} onSelect={() => selectTab("chain")} />
              <Tab label={t("tabs.documents")} />
              <Tab
                label={t("tabs.alerts")}
                count={String(openTotal(batch.openIssues))}
                severity={topSeverity(batch.openIssues)}
                active={tab === "alerts"}
                onSelect={() => selectTab("alerts")}
              />
              <Tab label={t("tabs.versions")} count={String(batch.passport?.version ?? 0)} active={tab === "versions"} onSelect={() => selectTab("versions")} />
            </nav>
            {tab === "versions" ? (
              <VersionsTab batch={batch} />
            ) : tab === "alerts" ? (
              <AlertsTab batch={batch} />
            ) : (
              <ChainSection batch={batch} chain={chain} steps={steps} />
            )}
          </div>
          <aside className="flex flex-col gap-4">
            <ScoreCard batch={batch} score={score} onRetry={() => void score.refetch()} />
            {live && <QrCard passport={live} />}
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}

function BatchHeader({ batch, onShowAlerts }: { batch: BatchResponse; onShowAlerts: () => void }) {
  const t = useTranslations("batches");
  const tDetail = useTranslations("batches.detail");
  const tFiber = useTranslations("enums.fiber");
  const locale = useLocale();
  const product = useProduct(batch.product.id);
  const composition = product.data?.declaredFiberComposition;
  const label = composition?.length ? fiberText(composition, locale, (f) => tFiber(f)) : undefined;
  const produced = formatDateRange(batch.producedFrom, batch.producedTo, locale);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="contents">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-[28px] leading-[34px] font-medium tracking-[-0.03em]">{batch.batchNo}</h1>
          <LifecycleChip batch={batch} size="lg" />
          <AlertsSummary counts={batch.openIssues} onClick={onShowAlerts} />
        </div>
        <p className="text-base font-medium tracking-[-0.01em]">
          {batch.product.name}{" "}
          <span className="font-normal text-muted-foreground">
            · {t("quantity", { quantity: formatQuantity(batch.quantity, locale) })}
          </span>
        </p>
        <dl className="mt-1 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
          <Meta term={tDetail("gtin")}>
            <span className="font-mono text-foreground">{displayGtin(batch.product.gtin)}</span>
          </Meta>
          {batch.productionOrderNo && (
            <Meta term={tDetail("productionOrderNo")}>
              <span className="font-mono text-foreground">{batch.productionOrderNo}</span>
            </Meta>
          )}
          {produced && (
            <Meta term={tDetail("produced")}>
              <span className="text-foreground tabular-nums">{produced}</span>
            </Meta>
          )}
          {label && (
            <Meta term={tDetail("label")}>
              <span className="text-foreground">{label}</span>
            </Meta>
          )}
        </dl>
      </div>
    </div>
  );
}

function Meta({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The header button of design v0.7 B1: the open alerts at their highest severity, leading to the Uyarılar tab. Info
 * level alone shows nothing; neither does a batch without open alerts.
 */
function AlertsSummary({ counts, onClick }: { counts: IssueCounts; onClick: () => void }) {
  const t = useTranslations("issues");
  if (counts.errors === 0 && counts.warnings === 0) return null;
  const blocking = counts.errors > 0;
  const Icon = blocking ? TriangleAlert : Clock;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft ${
        blocking ? "bg-status-rejected-muted text-status-rejected-foreground" : "bg-status-expiring-muted text-status-expiring-foreground"
      }`}
    >
      <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
      {blocking ? t("summaryBlocking", { count: counts.errors }) : t("summaryWarnings", { count: counts.warnings })}
    </button>
  );
}

const BADGE_TONE: Record<IssueSeverity, string> = {
  ERROR: "bg-status-rejected-muted text-status-rejected-foreground",
  WARNING: "bg-status-expiring-muted text-status-expiring-foreground",
  INFO: "bg-status-pending-muted text-status-pending-foreground",
};

/** A tab of 09. Without a count it is not available yet (documents M5); the others work. */
function Tab({
  label,
  count,
  severity,
  active = false,
  onSelect,
}: {
  label: string;
  count?: string;
  severity?: IssueSeverity;
  active?: boolean;
  onSelect?: () => void;
}) {
  const t = useTranslations("batches.detail.tabs");
  const available = !!onSelect;
  return (
    <button
      type="button"
      disabled={!available}
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      title={available ? undefined : t("unavailable")}
      className={`flex h-10 items-center gap-2 px-3 text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft disabled:cursor-not-allowed ${
        active ? "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--foreground)]" : "font-medium text-muted-foreground"
      } ${available ? "cursor-pointer hover:text-foreground" : ""}`}
    >
      {label}
      <span
        className={`rounded-[4px] px-1.5 py-px font-mono text-[11px] font-medium ${severity ? BADGE_TONE[severity] : "bg-muted text-muted-foreground"}`}
      >
        {count ?? "—"}
      </span>
    </button>
  );
}

function ChainSection({
  batch,
  chain,
  steps,
}: {
  batch: BatchResponse;
  chain: ReturnType<typeof useBatchChain>;
  steps: ChainNodeStep[];
}) {
  const t = useTranslations("batches.chain");
  const tCommon = useTranslations("common");
  if (chain.isError && !chain.data) {
    return (
      <div className="rounded-lg border bg-card">
        <ListError
          title={t("loadError")}
          error={chain.error}
          onRetry={() => void chain.refetch()}
          retrying={chain.isFetching}
          keepsFilters={false}
        />
      </div>
    );
  }
  if (!chain.data) {
    return <Skeleton className="h-[364px] rounded-xl" aria-label={tCommon("loading")} />;
  }
  if (chain.data.steps.length === 0) return <EmptyChain batchId={batch.id} />;

  const statuses: StepStatus[] = steps.map((s) => s.status);
  return (
    <ChainView batch={batch} chain={chain.data} steps={steps} statuses={statuses} />
  );
}

function ChainView({
  batch,
  chain,
  steps,
  statuses,
}: {
  batch: BatchResponse;
  chain: ChainResponse;
  steps: ChainNodeStep[];
  statuses: StepStatus[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // From the tasks page: ?step=<id> opens the step's panel, &open=request its "Veri talep et", &open=assign
  // "Tedarikçi ata".
  const [panel, setPanel] = useState<ChainPanel>(() => {
    const stepId = searchParams.get("step");
    const step = stepId ? steps.find((s) => s.id === stepId) : undefined;
    if (!step) return undefined;
    const action = searchParams.get("open");
    return action === "assign" ? { kind: "assign", stepId: step.id } : { ...panelFor(step), request: action === "request" };
  });
  const open = useCallback((step: ChainNodeStep) => setPanel(panelFor(step)), []);
  const close = () => {
    setPanel(undefined);
    if (searchParams.has("step")) router.replace(pathname, { scroll: false });
  };
  return (
    <div className="flex flex-col gap-3">
      <ChainLegend statuses={statuses} />
      <SupplyChainCanvas steps={steps} selectedId={panel?.stepId} onOpen={open} />
      {steps.some((s) => s.filled) && <Declarations batch={batch} chain={chain} />}
      <ChainPanels
        batch={{ id: batch.id, batchNo: batch.batchNo, productName: batch.product.name, published: batch.status === "PUBLISHED" }}
        panel={panel}
        steps={chain.steps}
        onClose={close}
      />
    </div>
  );
}

/** v0.3.1 26: a batch without steps (created before M3) gets the default five-step chain. */
function EmptyChain({ batchId }: { batchId: string }) {
  const t = useTranslations("batches.chain");
  const tStep = useTranslations("enums.stepType");
  const session = useSession();
  const canWrite = session.status === "authenticated" && canWriteCatalog(session.user.role);
  const create = useCreateDefaultChain(batchId);
  const run = () =>
    create.mutate(undefined, {
      onError: (error) => showErrorToast({ title: t("createFailed"), error, onRetry: run }),
    });

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-input px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-[14px] bg-muted text-muted-foreground">
        <Layers className="size-6" strokeWidth={1.5} aria-hidden />
      </span>
      <h2 className="font-serif text-[26px] leading-[normal] font-normal tracking-[-0.015em]">{t("emptyTitle")}</h2>
      <p className="max-w-[480px] text-sm leading-[1.55] text-pretty text-muted-foreground">{t("emptyBody")}</p>
      <ol className="mt-2.5 mb-1.5 flex flex-wrap items-center justify-center gap-2">
        {DRAWN_STEP_TYPES.map((type, i) => (
          <li key={type} className="flex items-center gap-2">
            <span className="flex h-8 items-center gap-2 rounded-md border border-dashed border-input px-3 text-[13px] font-medium">
              <span className="font-mono text-[11px] font-medium text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              {tStep(type)}
            </span>
            {i < DRAWN_STEP_TYPES.length - 1 && (
              <MoveRight className="size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            )}
          </li>
        ))}
      </ol>
      <GuardedButton allowed={canWrite} onClick={run} disabled={create.isPending} tooltipAlign="center">
        <Plus className="size-3.5" strokeWidth={2} aria-hidden />
        {t("createDefault")}
      </GuardedButton>
    </div>
  );
}

/** Bottom card of 09: the label's composition next to the yarn suppliers' declarations (no comparison in M3). */
function Declarations({ batch, chain }: { batch: BatchResponse; chain: ChainResponse }) {
  const t = useTranslations("batches.chain");
  const tFiber = useTranslations("enums.fiber");
  const locale = useLocale();
  const product = useProduct(batch.product.id);
  const fiberName = (f: Fiber) => tFiber(f);
  const composition = product.data?.declaredFiberComposition;
  const label = composition?.length ? fiberText(composition, locale, fiberName) : undefined;
  const yarns = chain.steps
    .filter((s) => s.stepType === "YARN" && s.supplier && s.data.fiberComposition?.length)
    .map((s) => `${s.supplier!.name} ${fiberText(s.data.fiberComposition!, locale, fiberName)}`);

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-[10px] border bg-card px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <Declaration title={t("labelDeclaration")} value={label} emphasis />
      <Declaration title={t("yarnDeclarations")} value={yarns.length ? yarns.join(" · ") : undefined} />
    </div>
  );
}

function Declaration({ title, value, emphasis = false }: { title: string; value?: string; emphasis?: boolean }) {
  const t = useTranslations("batches.chain");
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">{title}</span>
      {value ? (
        <span className={`text-sm ${emphasis ? "font-medium" : ""}`}>{value}</span>
      ) : (
        <span className="text-sm text-muted-foreground">{t("noDeclaration")}</span>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <>
      <div className="flex items-start gap-6">
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-5 w-96" />
          <Skeleton className="h-3.5 w-[520px] max-w-full" />
        </div>
        <Skeleton className="h-[82px] w-[190px] rounded-[10px]" />
        <Skeleton className="h-9 w-[300px]" />
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-[364px] rounded-xl" />
    </>
  );
}
