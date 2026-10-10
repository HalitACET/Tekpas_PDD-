"use client";

import type { Fiber, StepStatus } from "@tekpas/shared";
import { Layers, Lock, MoveRight, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { GuardedButton } from "@/components/common/guarded-button";
import { EmptyState, ListError } from "@/components/common/list-states";
import { ServerWakeStrip, useListWake } from "@/components/common/server-wake";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  type BatchResponse,
  type ChainResponse,
  useBatch,
  useBatchChain,
  useCreateDefaultChain,
} from "@/lib/api/batches";
import { useProduct } from "@/lib/api/products";
import { ApiError } from "@/lib/api/request";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { DRAWN_STEP_TYPES, isDrawn } from "@/lib/batches/chain-layout";
import { useSetBreadcrumbDetail } from "@/lib/breadcrumb";
import { displayGtin, fiberText, formatDateRange, formatPercent, formatQuantity } from "@/lib/format";
import { queryKeys } from "@/lib/query-keys";
import { BatchStatusChip } from "./batch-status-chip";
import { type ChainPanel, ChainPanels, panelFor } from "./chain-panels";
import { ChainLegend, type ChainNodeStep, SupplyChainCanvas, toNodeStep } from "./supply-chain";

/** The publishing threshold of the compliance score (design v0.3 09). */
const PUBLISH_THRESHOLD = 90;

/**
 * Design v0.3 09 (with v0.3.1 26 and 29). M3 has no compliance score yet, so the card shows "—", "Önizle" and
 * "Pasaportu yayınla" stay locked and the reasons list what M3 can tell. Only the supply chain tab has
 * content; documents, alerts and versions follow with M5–M6.
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
        <Link href="/batches" className={buttonVariants({ variant: "secondary" })}>
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

function BatchDetail({ batch, chain }: { batch: BatchResponse; chain: ReturnType<typeof useBatchChain> }) {
  const t = useTranslations("batches.detail");
  const tFiber = useTranslations("enums.fiber");
  const steps = useMemo(
    () =>
      (chain.data?.steps ?? []).filter((s) => isDrawn(s.stepType)).map((s) => toNodeStep(s, (f: Fiber) => tFiber(f))),
    [chain.data, tFiber],
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-5">
        <BatchHeader batch={batch} steps={chain.data ? steps : undefined} />
        <nav aria-label={t("tabs.label")} className="flex gap-1 border-b">
          <Tab label={t("tabs.chain")} count={String(chain.data?.steps.length ?? batch.chain.totalSteps)} active />
          <Tab label={t("tabs.documents")} />
          <Tab label={t("tabs.alerts")} />
          <Tab label={t("tabs.versions")} />
        </nav>
        <ChainSection batch={batch} chain={chain} steps={steps} />
      </div>
    </TooltipProvider>
  );
}

function BatchHeader({ batch, steps }: { batch: BatchResponse; steps: ChainNodeStep[] | undefined }) {
  const t = useTranslations("batches");
  const tDetail = useTranslations("batches.detail");
  const tFiber = useTranslations("enums.fiber");
  const locale = useLocale();
  const product = useProduct(batch.product.id);
  const composition = product.data?.declaredFiberComposition;
  const label = composition?.length ? fiberText(composition, locale, (f) => tFiber(f)) : undefined;
  const produced = formatDateRange(batch.producedFrom, batch.producedTo, locale);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-[28px] leading-[34px] font-medium tracking-[-0.03em]">{batch.batchNo}</h1>
          <BatchStatusChip status={batch.status} size="lg" />
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
      <ScoreCard />
      <PublishActions steps={steps} />
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

/** "—" until passports compute the score (M6); the tick on the ring marks the 90 % threshold. */
function ScoreCard() {
  const t = useTranslations("batches.detail");
  const locale = useLocale();
  return (
    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-[10px] border bg-card px-4 py-3">
      <span className="relative flex size-14 items-center justify-center">
        <svg viewBox="0 0 56 56" className="absolute inset-0 size-14 -rotate-90" aria-hidden>
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--muted)" strokeWidth="5" />
          <line
            x1="28"
            y1="1"
            x2="28"
            y2="9"
            transform={`rotate(${(PUBLISH_THRESHOLD / 100) * 360} 28 28)`}
            stroke="var(--foreground)"
            strokeWidth="1.5"
          />
        </svg>
        <span className="font-mono text-sm font-semibold tracking-[-0.03em]" aria-hidden>
          —
        </span>
        <span className="sr-only">{t("noScore")}</span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-semibold">{t("score")}</span>
        <span className="text-xs text-muted-foreground">
          {t("threshold", { threshold: formatPercent(PUBLISH_THRESHOLD, locale) })}
        </span>
      </span>
    </div>
  );
}

type Reason = { text: string; tone: "pending" | "low-confidence" };

/** What M3 can say about why the passport cannot be published yet (no score, no alerts yet). */
function useReasons(steps: ChainNodeStep[] | undefined): Reason[] {
  const t = useTranslations("batches.detail.reasons");
  const tStep = useTranslations("enums.stepType");
  if (steps === undefined) return [];
  if (steps.length === 0) return [{ text: t("noChain"), tone: "pending" }];
  const reasons: Reason[] = [];
  // FIBER records an origin, not a supplier.
  const empty = steps.filter((s) => !s.filled && s.stepType !== "FIBER");
  if (empty.length === 1) reasons.push({ text: t("unassignedOne", { step: tStep(empty[0].stepType) }), tone: "pending" });
  else if (empty.length > 1) reasons.push({ text: t("unassignedMany", { count: empty.length }), tone: "pending" });
  if (steps.some((s) => !s.filled && s.stepType === "FIBER")) reasons.push({ text: t("originMissing"), tone: "pending" });
  const awaiting = steps.filter((s) => s.filled && s.status !== "APPROVED").length;
  if (awaiting > 0) reasons.push({ text: t("awaiting", { count: awaiting }), tone: "low-confidence" });
  return reasons;
}

const REASON_DOT: Record<Reason["tone"], string> = {
  pending: "bg-status-pending",
  "low-confidence": "bg-status-low-confidence",
};

function PublishActions({ steps }: { steps: ChainNodeStep[] | undefined }) {
  const t = useTranslations("batches.detail");
  const reasons = useReasons(steps);
  return (
    <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[300px]">
      <div className="flex gap-2">
        <Button variant="secondary" disabled className="px-3 shadow-none">
          {t("preview")}
        </Button>
        <Button variant="brand" disabled className="flex-1 disabled:opacity-50" aria-describedby="publish-reasons">
          <Lock className="size-3.5" strokeWidth={2} aria-hidden />
          {t("publish")}
        </Button>
      </div>
      {reasons.length > 0 && (
        <ul id="publish-reasons" aria-label={t("publishLocked")} className="flex flex-col gap-[3px] text-xs leading-[1.4] text-muted-foreground">
          {reasons.map((r) => (
            <li key={r.text} className="flex gap-1.5">
              <span className={`mt-[7px] size-1 shrink-0 rounded-full ${REASON_DOT[r.tone]}`} aria-hidden />
              {r.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A tab of 09. Without a count it is not available yet (documents M5, alerts and versions M6). */
function Tab({ label, count, active = false }: { label: string; count?: string; active?: boolean }) {
  const t = useTranslations("batches.detail.tabs");
  return (
    <button
      type="button"
      disabled={!active}
      aria-current={active ? "page" : undefined}
      title={active ? undefined : t("unavailable")}
      className={`flex h-10 items-center gap-2 px-3 text-[13px] disabled:cursor-not-allowed ${
        active ? "font-semibold text-foreground shadow-[inset_0_-2px_0_var(--foreground)]" : "font-medium text-muted-foreground"
      }`}
    >
      {label}
      <span className="rounded-[4px] bg-muted px-1.5 py-px font-mono text-[11px] font-medium text-muted-foreground">
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
  const [panel, setPanel] = useState<ChainPanel>();
  const open = useCallback((step: ChainNodeStep) => setPanel(panelFor(step)), []);
  return (
    <div className="flex flex-col gap-3">
      <ChainLegend statuses={statuses} />
      <SupplyChainCanvas steps={steps} selectedId={panel?.stepId} onOpen={open} />
      {steps.some((s) => s.filled) && <Declarations batch={batch} chain={chain} />}
      <ChainPanels batchId={batch.id} panel={panel} steps={chain.steps} onClose={() => setPanel(undefined)} />
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
