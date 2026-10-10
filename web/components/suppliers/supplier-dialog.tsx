"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ProblemTypes } from "@tekpas/api-client";
import { SUPPLIER_TYPES, type SupplierType } from "@tekpas/shared";
import { CircleAlert, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";
import { Controller, type FieldPath, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { showErrorToast } from "@/components/common/error-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/request";
import { type SupplierResponse, useCreateSupplier, useUpdateSupplier } from "@/lib/api/suppliers";
import { fieldErrorsFrom } from "@/lib/products/product-form";
import {
  emptySupplierForm,
  supplierCreateBody,
  supplierFormFrom,
  type SupplierFormOutput,
  supplierFormSchema,
  type SupplierFormValues,
  supplierPatch,
} from "@/lib/suppliers/supplier-form";
import { CityCombobox } from "./city-combobox";

/**
 * new: from the suppliers page, or from "Tedarikçi ata" (v0.3.1 25) with the step's type chosen and the created
 * supplier handed back so the panel selects it.
 */
export type NewSupplier = { kind: "new"; type?: SupplierType; onCreated?: (supplier: SupplierResponse) => void };
export type SupplierDialogState = NewSupplier | { kind: "edit"; supplier: SupplierResponse } | undefined;

/**
 * Design v0.3 15 "Tedarikçi ekle"; editing is v0.3.2 36a (a company with its own account: name, type and
 * city locked) and 36b (used in batches: type locked). The phone always stays editable. The WhatsApp hint
 * under the phone waits for data request links (M4).
 */
export function SupplierDialog({ state, onClose }: { state: SupplierDialogState; onClose: () => void }) {
  const t = useTranslations("suppliers.form");
  const tType = useTranslations("enums.companyType");
  return (
    <Dialog open={state !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t("close")} className="w-[500px]">
        {state && (
          <>
            <div className="flex flex-col gap-1 px-6 pt-5 pr-16 pb-1">
              <DialogTitle>{state.kind === "new" ? t("addTitle") : t("editTitle")}</DialogTitle>
              <span className="text-[13px] text-muted-foreground">
                {state.kind === "new"
                  ? t("sub")
                  : t("editSub", { type: tType(state.supplier.type), count: state.supplier.batchCount })}
              </span>
            </div>
            <SupplierForm key={state.kind === "edit" ? state.supplier.id : "new"} state={state} onDone={onClose} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SupplierForm({
  state,
  onDone,
}: {
  state: NewSupplier | { kind: "edit"; supplier: SupplierResponse };
  onDone: () => void;
}) {
  const t = useTranslations("suppliers.form");
  const tType = useTranslations("enums.companyType");
  const tField = useTranslations("errors.field");
  const tConflict = useTranslations("errors.conflict");
  const ids = { name: useId(), type: useId(), city: useId(), phone: useId(), lock: useId(), typeLock: useId() };
  const supplier = state.kind === "edit" ? state.supplier : undefined;
  const locks = {
    details: supplier !== undefined && !supplier.editable,
    type: supplier !== undefined && supplier.batchCount > 0,
  };

  const form = useForm<SupplierFormValues, unknown, SupplierFormOutput>({
    // The schema converts the typed phone first (preprocess), which the resolver typings cannot follow.
    resolver: zodResolver(supplierFormSchema as never) as never,
    mode: "onChange",
    defaultValues: supplier
      ? supplierFormFrom(supplier)
      : { ...emptySupplierForm(), ...(state.kind === "new" && state.type ? { type: state.type } : {}) },
  });
  const { register, control, handleSubmit, setError, formState } = form;
  const values = useWatch({ control }) as SupplierFormValues;
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const pending = create.isPending || update.isPending;
  const missing = !values.name?.trim() || !values.type || !values.city;
  const message = (code: string | undefined) =>
    code === undefined ? undefined : tField.has(code as never) ? tField(code as never) : code;

  const onSubmit = handleSubmit(async (output) => {
    try {
      if (supplier) {
        await update.mutateAsync({ id: supplier.id, body: supplierPatch(supplier, output, locks) });
      } else {
        const created = await create.mutateAsync(supplierCreateBody(output));
        if (state.kind === "new") state.onCreated?.(created);
      }
      onDone();
    } catch (error) {
      const reason = error instanceof ApiError ? error.problem?.reason : undefined;
      if (error instanceof ApiError && error.hasType(ProblemTypes.conflict) && reason && tConflict.has(reason as never)) {
        toast.error(tConflict(reason as never));
        return;
      }
      const fieldErrors = error instanceof ApiError ? fieldErrorsFrom(error.problem?.errors) : [];
      if (fieldErrors.length === 0) {
        showErrorToast({ title: t("failed"), error, keepsForm: true, onRetry: () => void onSubmit() });
        return;
      }
      for (const e of fieldErrors) {
        setError(e.path as FieldPath<SupplierFormValues>, { type: e.code, message: e.code });
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col">
      <div className="flex flex-col gap-4 px-6 pt-4 pb-5">
        {locks.details && (
          <LockNote id={ids.lock} title={t("lockedOwnAccount")}>
            {t("lockedOwnAccountBody")}
          </LockNote>
        )}

        <Field label={t("name")} htmlFor={ids.name} error={message(formState.errors.name?.message)}>
          <span className={`relative flex items-center ${locks.details ? "cursor-not-allowed" : ""}`}>
            <Input
              id={ids.name}
              autoComplete="off"
              placeholder={t("namePlaceholder")}
              disabled={locks.details}
              aria-describedby={locks.details ? ids.lock : undefined}
              aria-invalid={formState.errors.name ? true : undefined}
              className={`${INPUT} ${LOCKED_INPUT}`}
              {...register("name")}
            />
            {locks.details && <LockIcon />}
          </span>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span id={ids.type} className="text-[13px] leading-[normal] font-medium">
            {t("type")}
          </span>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <div
                role="radiogroup"
                aria-labelledby={ids.type}
                aria-describedby={locks.details ? ids.lock : locks.type ? ids.typeLock : undefined}
                className="flex flex-wrap gap-1.5"
              >
                {SUPPLIER_TYPES.map((type) => {
                  const checked = field.value === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      disabled={locks.details || locks.type}
                      onClick={() => field.onChange(type)}
                      className={`flex h-[34px] cursor-pointer items-center rounded-md border px-3 text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft disabled:cursor-not-allowed ${
                        checked
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-input bg-card text-foreground hover:bg-accent disabled:text-muted-foreground disabled:opacity-60 disabled:hover:bg-card"
                      }`}
                    >
                      {tType(type)}
                    </button>
                  );
                })}
              </div>
            )}
          />
          {locks.type && !locks.details && (
            <p id={ids.typeLock} className="flex items-start gap-[5px] text-xs leading-[1.4] text-muted-foreground">
              <Lock className="mt-px size-3.5 flex-none" strokeWidth={1.75} aria-hidden />
              {t("lockedType", { count: supplier?.batchCount ?? 0 })}
            </p>
          )}
          <FieldError text={message(formState.errors.type?.message)} />
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
          <Field label={t("city")} htmlFor={ids.city} error={message(formState.errors.city?.message)}>
            <Controller
              control={control}
              name="city"
              render={({ field, fieldState }) => (
                <CityCombobox
                  id={ids.city}
                  value={field.value}
                  onChange={(city) => field.onChange(city)}
                  disabled={locks.details}
                  invalid={fieldState.invalid}
                  describedBy={locks.details ? ids.lock : undefined}
                />
              )}
            />
          </Field>
          <Field label={t("phone")} htmlFor={ids.phone} error={message(formState.errors.phone?.message)}>
            <span className="flex">
              <span
                className="flex h-9 items-center rounded-l-md border border-r-0 border-input bg-popover-muted px-2.5 font-mono text-[13px] text-muted-foreground"
                title={t("phoneCountry")}
              >
                +90
              </span>
              <Input
                id={ids.phone}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                placeholder={t("phonePlaceholder")}
                aria-invalid={formState.errors.phone ? true : undefined}
                className={`${INPUT} rounded-l-none font-mono shadow-none`}
                {...register("phone")}
              />
            </span>
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t px-6 py-3.5">
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {missing ? t("required") : null}
        </span>
        <DialogClose render={<Button type="button" variant="ghost" className="ml-auto" />}>{t("cancel")}</DialogClose>
        <Button type="submit" className="px-4" disabled={missing || !formState.isValid || pending}>
          {supplier ? t("submitEdit") : t("submitAdd")}
        </Button>
      </div>
    </form>
  );
}

const INPUT =
  "h-9 px-2.5 text-[13px] aria-invalid:focus-visible:border-status-rejected aria-invalid:focus-visible:ring-status-rejected-muted";
/** Locked like the GTIN (design v0.3.1 18): readable on --muted, a lock inside, not faded. */
const LOCKED_INPUT =
  "disabled:bg-muted disabled:pr-[34px] disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none";

function LockIcon() {
  return (
    <Lock
      className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
      strokeWidth={1.75}
      aria-hidden
    />
  );
}

/** v0.3.2 36a: why the details are locked, above the form. */
function LockNote({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div id={id} className="flex items-start gap-2.5 rounded-lg bg-popover-muted px-3.5 py-3">
      <Lock className="mt-0.5 size-[15px] flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <span className="flex flex-col gap-1">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="text-xs leading-[1.45] text-muted-foreground">{children}</span>
      </span>
    </div>
  );
}

function FieldError({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <p className="flex items-start gap-[5px] text-xs leading-[1.4] text-status-rejected-foreground">
      <CircleAlert className="mt-px size-3.5 flex-none" strokeWidth={2} aria-hidden />
      {text}
    </p>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
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
      <FieldError text={error} />
    </div>
  );
}
