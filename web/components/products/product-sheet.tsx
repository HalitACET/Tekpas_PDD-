"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ProblemTypes } from "@tekpas/api-client";
import { FIBERS, PRODUCT_CATEGORIES } from "@tekpas/shared";
import { Check, ChevronDown, CircleAlert, Lock, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useId, useState } from "react";
import { type FieldPath, useFieldArray, useForm, useWatch } from "react-hook-form";
import { showErrorToast } from "@/components/common/error-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  type ProductResponse,
  useCreateProduct,
  useOwnProductWithGtin,
  useProduct,
  useUpdateProduct,
} from "@/lib/api/products";
import { ApiError } from "@/lib/api/request";
import { formatPercent } from "@/lib/format";
import {
  emptyProductForm,
  fiberFormTotal,
  fieldErrorsFrom,
  gtinHint,
  type ProductFormOutput,
  productFormFrom,
  productFormSchema,
  type ProductFormValues,
  productPatch,
  saveBlocker,
} from "@/lib/products/product-form";

export type ProductSheetTarget = { kind: "new" } | { kind: "edit"; id: string };

/** Design v0.3 03 (edit) and 04 (new): the product sheet. */
export function ProductSheet({
  target,
  onClose,
}: {
  target: ProductSheetTarget | undefined;
  onClose: () => void;
}) {
  const t = useTranslations("products.form");
  const editId = target?.kind === "edit" ? target.id : undefined;
  const product = useProduct(editId);

  const ready = target?.kind === "new" || product.data !== undefined;
  return (
    <Sheet open={target !== undefined} onOpenChange={(open) => !open && onClose()}>
      <SheetContent closeLabel={t("close")}>
        <SheetHeader>
          <SheetTitle>{target?.kind === "edit" ? t("editTitle") : t("newTitle")}</SheetTitle>
          <SheetDescription>{t("sub")}</SheetDescription>
        </SheetHeader>
        {ready && target ? (
          <ProductForm
            // A fresh form per product (and per "new").
            key={editId ?? "new"}
            product={target.kind === "edit" ? product.data : undefined}
            onDone={onClose}
          />
        ) : (
          <SheetBody aria-busy />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProductForm({ product, onDone }: { product: ProductResponse | undefined; onDone: () => void }) {
  const t = useTranslations("products.form");
  const tField = useTranslations("errors.field");
  const tConflict = useTranslations("errors.conflict");
  const tCategory = useTranslations("enums.productCategory");
  const tFiber = useTranslations("enums.fiber");
  const locale = useLocale();
  const ids = { name: useId(), gtin: useId(), gtinHint: useId(), sku: useId(), category: useId(), description: useId(), descriptionHint: useId() };

  const [initial] = useState<ProductFormValues>(() => (product ? productFormFrom(product) : emptyProductForm()));
  // The GTIN is printed in QR codes once batches exist; the API refuses a change (409 gtin-locked).
  const [gtinLocked, setGtinLocked] = useState(() => (product?.batchCount ?? 0) > 0);
  // GTIN the API reported as taken (possibly by another company: no name is known then).
  const [takenGtin, setTakenGtin] = useState<string>();

  const form = useForm<ProductFormValues, unknown, ProductFormOutput>({
    resolver: zodResolver(productFormSchema) as never,
    mode: "onChange",
    defaultValues: initial,
  });
  const { register, control, handleSubmit, setError, formState } = form;
  // Design v0.3.2 38: after a save attempt, the footer counts the invalid fields and the first one gets focus.
  const [attempted, setAttempted] = useState(false);
  const showInvalid = (event: { target?: EventTarget | null } | undefined) => {
    setAttempted(true);
    const formElement = event?.target instanceof HTMLFormElement ? event.target : undefined;
    // After React has rendered the errors (aria-invalid), in the page's order.
    requestAnimationFrame(() =>
      formElement?.querySelector<HTMLElement>('[aria-invalid="true"], [data-error-anchor] input')?.focus(),
    );
  };
  const fibers = useFieldArray({ control, name: "declaredFiberComposition" });
  const values = useWatch({ control }) as ProductFormValues;

  const hint = gtinHint(values.gtin ?? "");
  const gtin14 = hint.kind === "valid" ? hint.gtin14 : undefined;
  const sameGtinAsBefore = gtin14 !== undefined && product !== undefined && gtin14 === product.gtin;
  const owner = useOwnProductWithGtin(gtin14 && !sameGtinAsBefore && !gtinLocked ? gtin14 : undefined);
  const duplicate = owner.data && owner.data.id !== product?.id ? owner.data : undefined;
  const taken = duplicate !== undefined || (takenGtin !== undefined && takenGtin === gtin14);
  const gtinOk = gtinLocked || (hint.kind === "valid" && !taken);

  const total = fiberFormTotal(values.declaredFiberComposition ?? []);
  const blocker = saveBlocker(values, gtinOk);

  const create = useCreateProduct();
  const update = useUpdateProduct();
  const saving = create.isPending || update.isPending;

  const onSubmit = handleSubmit(async (output, event) => {
    if (!gtinOk) {
      showInvalid(event);
      return;
    }
    try {
      if (product) {
        await update.mutateAsync({ id: product.id, body: productPatch(initial, output, { gtinLocked }) });
      } else {
        await create.mutateAsync({ ...output, declaredFiberComposition: output.declaredFiberComposition });
      }
      onDone();
    } catch (error) {
      if (!(error instanceof ApiError)) {
        showErrorToast({ title: t("saveFailed"), error, keepsForm: true, onRetry: () => void onSubmit() });
        return;
      }
      if (error.hasType(ProblemTypes.gtinLocked)) {
        setGtinLocked(true);
        return;
      }
      const fieldErrors = fieldErrorsFrom(error.problem?.errors);
      if (fieldErrors.length === 0) {
        showErrorToast({ title: t("saveFailed"), error, keepsForm: true, onRetry: () => void onSubmit() });
        return;
      }
      for (const e of fieldErrors) {
        if (e.path === "gtin" && e.code === "Unique") {
          setTakenGtin(output.gtin);
        } else {
          setError(e.path as FieldPath<ProductFormValues>, { type: e.code, message: e.code });
        }
      }
    }
  }, (_errors, event) => showInvalid(event));
  const errorCount = countFieldErrors(formState.errors) + (taken ? 1 : 0);

  const gtinState = gtinLocked
    ? { tone: "muted" as const, icon: Lock, text: tConflict("GTIN_LOCKED") }
    : taken
      ? { tone: "err" as const, icon: CircleAlert, text: t("gtinHint.taken"), sub: duplicate?.name }
      : hint.kind === "idle"
        ? { tone: "muted" as const, text: t("gtinHint.idle") }
        : hint.kind === "valid"
          ? { tone: "ok" as const, icon: Check, text: t("gtinHint.valid", { length: hint.length }) }
          : {
              tone: "err" as const,
              icon: CircleAlert,
              text:
                hint.kind === "length"
                  ? t("gtinHint.length", { count: hint.count })
                  : t(hint.kind === "digitsOnly" ? "gtinHint.digitsOnly" : "gtinHint.checkDigit"),
            };

  const totalOk = total === 100;
  // Zod and the API both report field error codes (GtinCheckDigit, Integer, …): translate them here.
  const message = (code: string | undefined) =>
    code === undefined ? undefined : tField.has(code as never) ? tField(code as never) : code;
  const duplicateFiber = formState.errors.declaredFiberComposition?.root ?? formState.errors.declaredFiberComposition;

  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetBody>
        <Field
          label={t("name")}
          htmlFor={ids.name}
          // Field-specific wording for the one required text (design v0.3.2 38).
          error={formState.errors.name?.message === "NotBlank" ? t("nameRequired") : message(formState.errors.name?.message)}
        >
          <Input
            id={ids.name}
            placeholder={t("namePlaceholder")}
            aria-invalid={formState.errors.name ? true : undefined}
            className={INPUT}
            {...register("name")}
          />
        </Field>

        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.gtin} className={LABEL}>
              {t("gtin")}
            </label>
            {/* Locked (design v0.3.1 18): readable on --muted with a lock inside, not faded like other disabled inputs. */}
            <div className={`relative ${gtinLocked ? "cursor-not-allowed" : ""}`}>
              <Input
                id={ids.gtin}
                inputMode="numeric"
                autoComplete="off"
                placeholder={t("gtinPlaceholder")}
                disabled={gtinLocked}
                aria-invalid={gtinState.tone === "err" ? true : undefined}
                aria-describedby={ids.gtinHint}
                className={`${INPUT} font-mono disabled:bg-muted disabled:pr-[34px] disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none`}
                {...register("gtin", { setValueAs: (v: string) => v.replace(/\s/g, "") })}
              />
              {gtinLocked && (
                <Lock
                  className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                  strokeWidth={1.75}
                  aria-hidden
                />
              )}
            </div>
            <p
              id={ids.gtinHint}
              aria-live="polite"
              className={`flex items-start gap-[5px] text-xs leading-[1.4] ${
                gtinState.tone === "err"
                  ? "text-status-rejected-foreground"
                  : gtinState.tone === "ok"
                    ? "text-status-approved-foreground"
                    : "text-muted-foreground"
              }`}
            >
              {gtinState.icon && <gtinState.icon className="mt-px size-3.5 flex-none" strokeWidth={2} aria-hidden />}
              <span className="flex flex-col">
                <span>{gtinState.text}</span>
                {"sub" in gtinState && gtinState.sub && <span className="text-muted-foreground">{gtinState.sub}</span>}
              </span>
            </p>
          </div>
          <Field label={t("sku")} htmlFor={ids.sku} error={message(formState.errors.sku?.message)}>
            <Input
              id={ids.sku}
              placeholder={t("skuPlaceholder")}
              aria-invalid={formState.errors.sku ? true : undefined}
              className={`${INPUT} font-mono`}
              {...register("sku")}
            />
          </Field>
        </div>

        <Field label={t("category")} htmlFor={ids.category} error={message(formState.errors.category?.message)}>
          <NativeSelect id={ids.category} {...register("category")}>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {tCategory(c)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <fieldset
          className="flex flex-col gap-2"
          // The total or a repeated fiber is an error of the whole group: a failed save focuses its first input.
          data-error-anchor={formState.errors.declaredFiberComposition ? "" : undefined}
        >
          <div className="flex items-baseline justify-between">
            <legend className="text-[13px] font-medium">{t("fibers")}</legend>
            <span className="text-xs text-muted-foreground">{t("fibersHint")}</span>
          </div>
          <div className="overflow-hidden rounded-lg border">
            {fibers.fields.map((field, i) => {
              const percentError = message(formState.errors.declaredFiberComposition?.[i]?.percent?.message);
              return (
                <div key={field.id} className="border-b p-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_110px_36px] items-center gap-2">
                    <NativeSelect aria-label={t("fiber", { n: i + 1 })} compact {...register(`declaredFiberComposition.${i}.fiber`)}>
                      {FIBERS.map((f) => (
                        <option key={f} value={f}>
                          {tFiber(f)}
                        </option>
                      ))}
                    </NativeSelect>
                    <span className="relative flex items-center">
                      <span className="pointer-events-none absolute left-2.5 font-mono text-[13px] text-muted-foreground" aria-hidden>
                        %
                      </span>
                      <Input
                        aria-label={t("percent", { n: i + 1 })}
                        inputMode="numeric"
                        autoComplete="off"
                        aria-invalid={percentError ? true : undefined}
                        className={`h-[34px] pr-2.5 pl-[26px] text-right font-mono text-[13px] shadow-none ${INVALID_FOCUS}`}
                        {...register(`declaredFiberComposition.${i}.percent`)}
                      />
                    </span>
                    <button
                      type="button"
                      onClick={() => fibers.remove(i)}
                      disabled={fibers.fields.length === 1}
                      aria-label={t("removeFiber")}
                      className="flex size-[34px] cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-status-rejected-foreground focus-visible:ring-[3px] focus-visible:ring-ring-soft disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                    >
                      <Trash2 className="size-[15px]" strokeWidth={1.75} aria-hidden />
                    </button>
                  </div>
                  {percentError && <FieldError className="mt-1.5 justify-end pr-11">{percentError}</FieldError>}
                </div>
              );
            })}
            <div className="flex items-center gap-3 bg-muted py-2 pr-2 pl-1">
              <button
                type="button"
                onClick={() => fibers.append({ fiber: "ELASTANE", percent: "" })}
                className="flex h-[30px] cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
              >
                <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
                {t("addFiber")}
              </button>
              <span
                aria-live="polite"
                className={`ml-auto inline-flex items-center gap-1.5 rounded-full py-1 pr-2.5 pl-2 text-xs font-medium ${
                  totalOk
                    ? "bg-status-approved-muted text-status-approved-foreground"
                    : "bg-status-low-confidence-muted text-status-low-confidence-foreground"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${totalOk ? "bg-status-approved" : "bg-status-low-confidence"}`}
                  aria-hidden
                />
                <span className="font-mono">{t("total", { total: formatPercent(total, locale) })}</span>
                {total < 100 && t("missing", { missing: 100 - total })}
                {total > 100 && t("over")}
              </span>
            </div>
          </div>
          {duplicateFiber?.message === "FiberDuplicate" && <FieldError>{tField("FiberDuplicate")}</FieldError>}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.description} className={LABEL}>
            {t("description")}
          </label>
          <span id={ids.descriptionHint} className="-mt-1 text-xs text-muted-foreground">
            {t("descriptionHint")}
          </span>
          <Textarea
            id={ids.description}
            rows={3}
            placeholder={t("descriptionPlaceholder")}
            aria-describedby={ids.descriptionHint}
            aria-invalid={formState.errors.description ? true : undefined}
            {...register("description")}
          />
          {formState.errors.description?.message && (
            <FieldError>{message(formState.errors.description.message)}</FieldError>
          )}
        </div>
      </SheetBody>

      <SheetFooter>
        {attempted && errorCount > 0 ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-status-rejected-foreground" role="alert">
            <CircleAlert className="size-3.5 flex-none" strokeWidth={2} aria-hidden />
            {t("errorCount", { count: errorCount })}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {blocker ? t(`saveHint.${blocker}`) : null}
          </span>
        )}
        <Button type="button" variant="ghost" className="ml-auto" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" className="px-4" disabled={saving}>
          {t("save")}
        </Button>
      </SheetFooter>
    </form>
  );
}

const LABEL = "text-[13px] leading-[normal] font-medium";
/** Design 03/04: an invalid field keeps its red border and ring while focused. */
const INVALID_FOCUS = "aria-invalid:focus-visible:border-status-rejected aria-invalid:focus-visible:ring-status-rejected-muted";
const INPUT = `h-9 px-2.5 text-[13px] ${INVALID_FOCUS}`;

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
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={LABEL}>
        {label}
      </label>
      {children}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

function FieldError({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-start gap-[5px] text-xs leading-[1.4] text-status-rejected-foreground ${className}`}>
      <CircleAlert className="mt-px size-3.5 flex-none" strokeWidth={2} aria-hidden />
      {children}
    </p>
  );
}

/** The design's selects are native: chevron on the right, same border and surface as inputs. */
function NativeSelect({
  compact,
  className = "",
  children,
  ...props
}: React.ComponentProps<"select"> & { compact?: boolean }) {
  return (
    <span className="relative flex items-center">
      <select
        className={`flex-1 cursor-pointer appearance-none rounded-md border border-input bg-card pr-[30px] pl-2.5 text-[13px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring-soft ${
          compact ? "h-[34px]" : "h-9 shadow-xs"
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className={`pointer-events-none absolute size-4 text-muted-foreground ${compact ? "right-2" : "right-2.5"}`}
        strokeWidth={1.75}
        aria-hidden
      />
    </span>
  );
}

/** Invalid inputs among react-hook-form's (nested) errors: every leaf with a message counts once. */
function countFieldErrors(errors: object | undefined): number {
  if (!errors) return 0;
  return Object.entries(errors).reduce((count, [key, value]) => {
    if (key === "ref" || value == null || typeof value !== "object") return count;
    if ("message" in value && typeof value.message === "string") return count + 1;
    return count + countFieldErrors(value);
  }, 0);
}
