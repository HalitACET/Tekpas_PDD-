"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { type BatchResponse, type ChainStep, useBatchChain, useBatches } from "@/lib/api/batches";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { emptyUploadTarget, type UploadTarget, uploadTargetSchema } from "@/lib/documents/upload-target";
import { DocumentsSection } from "./documents-section";

const ALL_BATCHES = { q: "", status: "", productId: "", supplierId: "" } as const;

/**
 * "Belge yükle" on the documents page: a document always belongs to a supply chain step, so the dialog first asks
 * for the batch and the step (a form), then shows that step's upload area, the same one as in the step panel.
 * No design frame yet (docs/PLAN.md §6, design debt); built from the "Yeni parti" dialog's parts.
 */
export function UploadDocumentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("documents.pick");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={t("close")}>
        <div className="flex flex-col gap-1 px-6 pt-5 pr-16 pb-1">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </div>
        {open && <UploadFlow />}
      </DialogContent>
    </Dialog>
  );
}

function UploadFlow() {
  const [target, setTarget] = useState<UploadTarget>();
  return target ? (
    <UploadStep target={target} onChange={() => setTarget(undefined)} />
  ) : (
    <TargetForm onPicked={setTarget} />
  );
}

function TargetForm({ onPicked }: { onPicked: (target: UploadTarget) => void }) {
  const t = useTranslations("documents.pick");
  const ids = { batch: useId(), step: useId() };
  const form = useForm<UploadTarget>({
    resolver: zodResolver(uploadTargetSchema),
    mode: "onChange",
    defaultValues: emptyUploadTarget(),
  });
  const { register, control, handleSubmit, setValue, formState } = form;
  const batchId = useWatch({ control, name: "batchId" });
  const stepId = useWatch({ control, name: "stepId" });

  const batches = useBatches(ALL_BATCHES);
  const list = batches.data?.content ?? [];

  return (
    <form onSubmit={handleSubmit(onPicked)} noValidate className="flex flex-col">
      <div className="flex flex-col gap-4 px-6 pt-4 pb-5">
        <Field label={t("batch")} htmlFor={ids.batch}>
          <NativeSelect
            id={ids.batch}
            disabled={!batches.isSuccess || list.length === 0}
            aria-invalid={formState.errors.batchId ? true : undefined}
            {...register("batchId", {
              // Another batch has other steps.
              onChange: () => setValue("stepId", "", { shouldValidate: true }),
            })}
          >
            <option value="">{batches.isPending ? t("loading") : t("batchPlaceholder")}</option>
            {list.map((batch) => (
              <option key={batch.id} value={batch.id} disabled={batch.status === "PUBLISHED"}>
                {batchLabel(batch, t)}
              </option>
            ))}
          </NativeSelect>
          {batches.isError && <Problem>{t("batchesFailed")}</Problem>}
          {batches.isSuccess && list.length === 0 && <Note>{t("noBatches")}</Note>}
        </Field>

        <Field label={t("step")} htmlFor={ids.step}>
          {batchId ? (
            <StepSelect id={ids.step} batchId={batchId} register={register("stepId")} />
          ) : (
            <NativeSelect id={ids.step} disabled>
              <option value="">{t("batchFirst")}</option>
            </NativeSelect>
          )}
        </Field>
      </div>

      <div className="flex items-center gap-2 border-t px-6 py-3.5">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {!batchId || !stepId ? t("required") : null}
        </span>
        <DialogClose render={<Button type="button" variant="ghost" className="ml-auto" />}>{t("cancel")}</DialogClose>
        <Button type="submit" className="px-4 disabled:opacity-45" disabled={!formState.isValid}>
          {t("next")}
        </Button>
      </div>
    </form>
  );
}

function StepSelect({
  id,
  batchId,
  register,
}: {
  id: string;
  batchId: string;
  register: ReturnType<ReturnType<typeof useForm<UploadTarget>>["register"]>;
}) {
  const t = useTranslations("documents.pick");
  const stepLabel = useStepLabel();
  const chain = useBatchChain(batchId);
  const steps = [...(chain.data?.steps ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <>
      <NativeSelect id={id} disabled={!chain.isSuccess || steps.length === 0} {...register}>
        <option value="">{chain.isPending ? t("loading") : t("stepPlaceholder")}</option>
        {steps.map((step) => (
          <option key={step.id} value={step.id}>
            {stepLabel(step)}
          </option>
        ))}
      </NativeSelect>
      {chain.isError && <Problem>{t("chainFailed")}</Problem>}
      {chain.isSuccess && steps.length === 0 && <Note>{t("noChain")}</Note>}
    </>
  );
}

/** The chosen step's documents and drop zone, under a line naming the batch and the step. */
function UploadStep({ target, onChange }: { target: UploadTarget; onChange: () => void }) {
  const t = useTranslations("documents.pick");
  const tStep = useTranslations("enums.stepType");
  const stepLabel = useStepLabel();
  const who = useStepWho();
  const session = useSession();
  const role = session.status === "authenticated" ? session.user.role : undefined;
  const batch = useBatches(ALL_BATCHES).data?.content.find((b) => b.id === target.batchId);
  const step = useBatchChain(target.batchId).data?.steps.find((s) => s.id === target.stepId);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-4 px-6 pt-4 pb-5">
        <div className="flex items-center gap-3 rounded-lg bg-muted px-3.5 py-2.5 text-[13px]">
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{batch ? batchLabel(batch, t) : "—"}</span>
            <span className="truncate text-xs text-muted-foreground">{step ? stepLabel(step) : "—"}</span>
          </span>
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onChange}>
            {t("change")}
          </Button>
        </div>
        {step && (
          <DocumentsSection
            stepId={step.id}
            stepName={tStep(step.stepType)}
            supplierName={who(step)}
            published={batch?.status === "PUBLISHED"}
            canWrite={!!role && canWriteCatalog(role)}
            reviewer={role === "OWNER" || role === "ADMIN"}
          />
        )}
      </div>
      <div className="flex items-center border-t px-6 py-3.5">
        <DialogClose render={<Button type="button" className="ml-auto px-4" />}>{t("done")}</DialogClose>
      </div>
    </div>
  );
}

function batchLabel(batch: BatchResponse, t: (key: "batchOption" | "batchPublished", values: Record<string, string>) => string) {
  const values = { batchNo: batch.batchNo, product: batch.product.name };
  return batch.status === "PUBLISHED" ? t("batchPublished", values) : t("batchOption", values);
}

/** Who stands behind a step: its supplier, the fibre for FIBER (as in the step panel), or "tedarikçi atanmadı". */
function useStepWho() {
  const t = useTranslations("documents.pick");
  const tFiber = useTranslations("enums.fiber");
  const tChain = useTranslations("batches.chain");
  return (step: ChainStep) =>
    step.supplier?.name ??
    (step.stepType === "FIBER"
      ? step.data.fiberType
        ? tFiber(step.data.fiberType)
        : tChain("originMissing")
      : t("noSupplier"));
}

/** "Kumaş · Akın Tekstil", "Lif · Organik pamuk", "Boya · tedarikçi atanmadı". */
function useStepLabel() {
  const t = useTranslations("documents.pick");
  const tStep = useTranslations("enums.stepType");
  const who = useStepWho();
  return (step: ChainStep) => t("stepOption", { step: tStep(step.stepType), who: who(step) });
}

function Field({ label, htmlFor, children }: { label: ReactNode; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] leading-[normal] font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function Problem({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-[5px] text-xs leading-[1.4] text-status-rejected-foreground">
      <CircleAlert className="mt-px size-3.5 flex-none" strokeWidth={2} aria-hidden />
      {children}
    </p>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-[1.4] text-muted-foreground">{children}</p>;
}
