"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlert, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useId } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { DateRangeFields } from "@/components/common/date-range-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateBatch, useNextBatchNo } from "@/lib/api/batches";
import type { ProductListItem } from "@/lib/api/products";
import { ApiError } from "@/lib/api/request";
import {
  batchCreateBody,
  type BatchFormOutput,
  batchFormSchema,
  type BatchFormValues,
  batchNoInput,
  emptyBatchForm,
} from "@/lib/batches/batch-form";
import { fieldErrorsFrom } from "@/lib/products/product-form";
import { ProductCombobox } from "./product-combobox";

/** Design v0.3 08 "Yeni parti". The "steps are copied from the last batch" line waits for M3. */
export function CreateBatchDialog({
  open,
  onClose,
  products,
}: {
  open: boolean;
  onClose: () => void;
  products: ProductListItem[];
}) {
  const t = useTranslations("batches.create");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={t("close")}>
        <div className="px-6 pt-5 pr-16 pb-1">
          <DialogTitle>{t("title")}</DialogTitle>
        </div>
        {open && <CreateBatchForm products={products} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateBatchForm({ products, onDone }: { products: ProductListItem[]; onDone: () => void }) {
  const t = useTranslations("batches.create");
  const tField = useTranslations("errors.field");
  const ids = { product: useId(), batchNo: useId(), order: useId(), quantity: useId() };

  const form = useForm<BatchFormValues, unknown, BatchFormOutput>({
    // The schema converts the typed quantity first (preprocess), which the resolver typings cannot follow.
    resolver: zodResolver(batchFormSchema as never) as never,
    mode: "onChange",
    defaultValues: emptyBatchForm(),
  });
  const { register, control, handleSubmit, setError, setValue, formState, getFieldState } = form;
  const values = useWatch({ control }) as BatchFormValues;

  // Prefill the suggested number once it arrives, unless the user already typed one.
  const suggestion = useNextBatchNo(true);
  useEffect(() => {
    if (suggestion.data && !getFieldState("batchNo").isDirty && !form.getValues("batchNo")) {
      setValue("batchNo", suggestion.data, { shouldValidate: true });
    }
  }, [suggestion.data, getFieldState, setValue, form]);

  const create = useCreateBatch();
  const missing = !values.productId || !values.quantity?.trim();
  const message = (code: string | undefined) =>
    code === undefined ? undefined : tField.has(code as never) ? tField(code as never) : code;

  const onSubmit = handleSubmit(async (output) => {
    try {
      await create.mutateAsync(batchCreateBody(output));
      onDone();
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      const fieldErrors = fieldErrorsFrom(error.problem?.errors);
      if (fieldErrors.length === 0) {
        toast.error(t("failed"));
        return;
      }
      for (const e of fieldErrors) {
        setError(e.path as FieldPath<BatchFormValues>, { type: e.code, message: e.code });
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <div className="flex flex-col gap-4 px-6 pt-4 pb-5">
        <Field label={t("product")} htmlFor={ids.product} error={message(formState.errors.productId?.message)}>
          <Controller
            control={control}
            name="productId"
            render={({ field, fieldState }) => (
              <ProductCombobox
                id={ids.product}
                products={products}
                value={field.value}
                onChange={(id) => field.onChange(id)}
                invalid={fieldState.invalid && fieldState.isTouched}
              />
            )}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label={
              <span className="flex items-center gap-1.5">
                {t("batchNo")}
                <span className="rounded-[4px] bg-brand-muted px-1.5 py-px text-[10px] font-medium text-brand-text">
                  {t("suggested")}
                </span>
              </span>
            }
            htmlFor={ids.batchNo}
            error={message(formState.errors.batchNo?.message)}
          >
            <span className="relative flex items-center">
              <Controller
                control={control}
                name="batchNo"
                render={({ field }) => (
                  <Input
                    id={ids.batchNo}
                    autoComplete="off"
                    aria-invalid={formState.errors.batchNo ? true : undefined}
                    className={`${INPUT} pr-[38px] font-mono`}
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    // AI(10): A–Z, 0–9 and "-" only, upper-cased with English rules.
                    onChange={(e) => field.onChange(batchNoInput(e.target.value))}
                  />
                )}
              />
              <button
                type="button"
                onClick={() => suggestion.data && setValue("batchNo", suggestion.data, { shouldValidate: true })}
                disabled={!suggestion.data}
                aria-label={t("resetSuggestion")}
                title={t("resetSuggestion")}
                className="absolute right-1 flex size-7 cursor-pointer items-center justify-center rounded-[4px] text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" strokeWidth={1.75} aria-hidden />
              </button>
            </span>
          </Field>
          <Field
            label={t("productionOrderNo")}
            htmlFor={ids.order}
            error={message(formState.errors.productionOrderNo?.message)}
          >
            <Input
              id={ids.order}
              autoComplete="off"
              placeholder={t("productionOrderNoPlaceholder")}
              aria-invalid={formState.errors.productionOrderNo ? true : undefined}
              className={`${INPUT} font-mono`}
              {...register("productionOrderNo")}
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label={t("quantity")} htmlFor={ids.quantity} error={message(formState.errors.quantity?.message)}>
            <span className="relative flex items-center">
              <Input
                id={ids.quantity}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                aria-invalid={formState.errors.quantity ? true : undefined}
                className={`${INPUT} pr-11 tabular-nums`}
                {...register("quantity")}
              />
              <span className="pointer-events-none absolute right-2.5 text-xs text-muted-foreground" aria-hidden>
                {t("quantityUnit")}
              </span>
            </span>
          </Field>
          <DateRangeFields
            from={values.producedFrom ?? ""}
            to={values.producedTo ?? ""}
            onChange={(range) => {
              setValue("producedFrom", range.from, { shouldValidate: true, shouldDirty: true });
              setValue("producedTo", range.to, { shouldValidate: true, shouldDirty: true });
            }}
            labels={{ from: t("producedFrom"), to: t("producedTo") }}
            errors={{
              from: message(formState.errors.producedFrom?.message),
              to: message(formState.errors.producedTo?.message),
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 border-t px-6 py-3.5">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {missing ? t("required") : null}
        </span>
        <DialogClose render={<Button type="button" variant="ghost" className="ml-auto" />}>{t("cancel")}</DialogClose>
        <Button
          type="submit"
          className="px-4 disabled:opacity-45"
          disabled={missing || !values.batchNo || !formState.isValid || create.isPending}
        >
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}

const INPUT = "h-9 px-2.5 text-[13px] aria-invalid:focus-visible:border-status-rejected aria-invalid:focus-visible:ring-status-rejected-muted";

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] leading-[normal] font-medium">
        {label}
      </label>
      {children}
      {error && (
        <p className="flex items-start gap-[5px] text-xs leading-[1.4] text-status-rejected-foreground">
          <CircleAlert className="mt-px size-3.5 flex-none" strokeWidth={2} aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
