"use client";

import type { StepType, SupplierType } from "@tekpas/shared";
import { Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { GuardedButton } from "@/components/common/guarded-button";
import { StepStatusBadge } from "@/components/common/step-status-badge";
import { type SupplierDialogState, SupplierDialog } from "@/components/suppliers/supplier-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { type ChainStep, useAssignSupplier } from "@/lib/api/batches";
import { type PanelBatch, StepLine, StepPanel } from "./step-panel";
import { type SupplierResponse, useSuppliers } from "@/lib/api/suppliers";
import { canManageSuppliers, canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { formatUpdated } from "@/lib/format";
import type { ChainNodeStep } from "./supply-chain";

/**
 * Which panel is open over the chain: a step's details (10, v0.4 47) or "Tedarikçi ata" for an empty step (25).
 * `request` opens "Veri talep et" (46) right away, from the tasks page.
 */
export type ChainPanel = { kind: "step" | "assign"; stepId: string; request?: boolean } | undefined;

/** The supplier type that fits a step (backend StepType.supplierType); FIBER has none. */
const SUPPLIER_TYPE: Partial<Record<StepType, SupplierType>> = {
  YARN: "YARN",
  FABRIC: "FABRIC",
  DYEING: "DYEHOUSE",
  SEWING: "SEWING",
  ACCESSORY: "ACCESSORY",
  PACKAGING: "ACCESSORY",
};

/** An empty step that takes a supplier opens "Tedarikçi ata"; the rest (and an empty FIBER) the step panel. */
export function panelFor(step: ChainNodeStep): NonNullable<ChainPanel> {
  return { kind: !step.filled && SUPPLIER_TYPE[step.stepType] ? "assign" : "step", stepId: step.id };
}

export function ChainPanels({
  batch,
  panel,
  steps,
  onClose,
}: {
  batch: PanelBatch;
  panel: ChainPanel;
  steps: readonly ChainStep[];
  onClose: () => void;
}) {
  const t = useTranslations("batches.chain.panel");
  const session = useSession();
  const role = session.status === "authenticated" ? session.user.role : undefined;
  const step = panel && steps.find((s) => s.id === panel.stepId);
  return (
    <Sheet open={step !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent closeLabel={t("close")} className="max-w-[480px]">
        {step && panel?.kind === "step" && (
          <StepPanel
            key={step.id}
            batch={batch}
            step={step}
            reviewer={role === "OWNER" || role === "ADMIN"}
            canWrite={role !== undefined && canWriteCatalog(role)}
            requestOnOpen={panel.request}
          />
        )}
        {step && panel?.kind === "assign" && <AssignSupplierPanel batchId={batch.id} step={step} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

/** Design v0.3.1 25: the network's suppliers of the step's type; "davet edildi" waits for data requests (M4). */
function AssignSupplierPanel({ batchId, step, onDone }: { batchId: string; step: ChainStep; onDone: () => void }) {
  const t = useTranslations("batches.chain.assign");
  const tType = useTranslations("enums.companyType");
  const tBatches = useTranslations("batches");
  const locale = useLocale();
  const session = useSession();
  const canWrite = session.status === "authenticated" && canWriteCatalog(session.user.role);
  // Assigning is an EDITOR's job; adding a new firm to the network is OWNER's and ADMIN's (M12).
  const canAddSupplier = session.status === "authenticated" && canManageSuppliers(session.user.role);
  const supplierType = SUPPLIER_TYPE[step.stepType]!;
  const typeName = tType(supplierType);
  const typeInText = locale === "de" ? typeName : typeName.toLocaleLowerCase(locale);
  const suppliers = useSuppliers({ q: "", type: supplierType });
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string>();
  const [dialog, setDialog] = useState<SupplierDialogState>();
  const assign = useAssignSupplier(batchId);

  const needle = q.trim().toLocaleLowerCase(locale);
  const rows = (suppliers.data?.content ?? []).filter(
    (s) => !needle || `${s.name} ${s.city ?? ""}`.toLocaleLowerCase(locale).includes(needle),
  );
  const chosen = suppliers.data?.content.find((s) => s.id === picked);
  const now = new Date();

  const submit = () => {
    if (!chosen) return;
    assign.mutate(
      { stepId: step.id, supplierId: chosen.id },
      { onSuccess: onDone, onError: (error) => showErrorToast({ title: t("failed"), error, onRetry: submit }) },
    );
  };

  return (
    <>
      <SheetHeader className="gap-1.5 pt-[18px]">
        <StepLine type={step.stepType} />
        <SheetTitle>{t("title")}</SheetTitle>
        <span className="text-[13px] text-muted-foreground">{t("sub", { type: typeInText })}</span>
      </SheetHeader>
      <div className="flex flex-col gap-2.5 px-6 pt-4 pb-1">
        <label className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-2.5 text-muted-foreground shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring-soft">
          <Search className="size-[15px] shrink-0" strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search")}
            aria-label={t("search")}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <span className="text-xs text-muted-foreground">{t("count", { count: rows.length, type: typeName })}</span>
      </div>
      <SheetBody className="gap-2 pt-2">
        {suppliers.isPending ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : suppliers.isError ? (
          <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center text-[13px] text-muted-foreground">
            {t("listError")}
            <Button variant="secondary" size="sm" onClick={() => void suppliers.refetch()}>
              {t("retry")}
            </Button>
          </div>
        ) : (
          <div role="radiogroup" aria-label={t("title")} className="flex flex-col gap-2">
            {rows.map((s) => (
              <SupplierOption
                key={s.id}
                supplier={s}
                checked={s.id === picked}
                onPick={() => setPicked(s.id)}
                when={s.latestStepAt ? formatUpdated(s.latestStepAt, now, locale, tBatches("yesterday")) : "—"}
              />
            ))}
            {rows.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">{t("none")}</p>}
          </div>
        )}
        <GuardedButton
          allowed={canAddSupplier}
          variant="ghost"
          tooltipSide="top"
          tooltipAlign="center"
          onClick={() => setDialog({ kind: "new", type: supplierType, onCreated: (s) => setPicked(s.id) })}
          className="min-h-12 shrink-0 rounded-lg border border-dashed border-input hover:border-ring hover:bg-transparent"
        >
          <Plus className="size-[15px]" strokeWidth={1.75} aria-hidden />
          {t("addNew")}
        </GuardedButton>
      </SheetBody>
      <SheetFooter>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {chosen ? t("picked", { name: chosen.name }) : t("pick")}
        </span>
        <Button variant="ghost" className="ml-auto" onClick={onDone}>
          {t("cancel")}
        </Button>
        <GuardedButton
          allowed={canWrite}
          tooltipSide="top"
          className="px-[18px]"
          disabled={!chosen || assign.isPending}
          onClick={submit}
        >
          {t("submit")}
        </GuardedButton>
      </SheetFooter>
      <SupplierDialog state={dialog} onClose={() => setDialog(undefined)} />
    </>
  );
}

function SupplierOption({
  supplier,
  checked,
  onPick,
  when,
}: {
  supplier: SupplierResponse;
  checked: boolean;
  onPick: () => void;
  when: string;
}) {
  const t = useTranslations("batches.chain.assign");
  return (
    <label
      className={`grid min-h-16 cursor-pointer grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card px-3 py-2.5 hover:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring-soft ${
        checked ? "border-ring shadow-[0_0_0_3px_var(--ring-soft)]" : "border-border"
      }`}
    >
      <input type="radio" name="supplier" checked={checked} onChange={onPick} className="sr-only" />
      <span
        className={`flex size-[18px] items-center justify-center rounded-full border ${checked ? "border-primary" : "border-input"}`}
        aria-hidden
      >
        <span className={`size-2 rounded-full bg-primary ${checked ? "opacity-100" : "opacity-0"}`} />
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="truncate text-sm font-medium">{supplier.name}</span>
        <span className="text-xs text-muted-foreground">
          {t("row", { city: supplier.city ?? "—", count: supplier.batchCount })}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        {supplier.latestStepStatus && <StepStatusBadge status={supplier.latestStepStatus} size="sm" />}
        <span className="text-[11px] text-muted-foreground">{t("latest", { when })}</span>
      </span>
    </label>
  );
}
