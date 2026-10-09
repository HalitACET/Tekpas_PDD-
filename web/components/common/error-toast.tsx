"use client";

import { CircleAlert, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/request";

/**
 * Design v0.3.2 33: a save or delete the server could not complete. 420 px card bottom right: what failed,
 * why (no answer / server error / unexpected), whether the form still holds the changes, the HTTP status and
 * request id when the server answered, "Tekrar dene" and close. Validation errors never come here: they
 * belong under their fields.
 */
export function showErrorToast({
  title,
  error,
  onRetry,
  keepsForm = false,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
  /** The form stays open with the user's changes ("Değişiklikleriniz formda duruyor."). */
  keepsForm?: boolean;
}) {
  toast.custom(
    (id) => (
      <ErrorToast
        title={title}
        error={error}
        keepsForm={keepsForm}
        onRetry={
          onRetry &&
          (() => {
            toast.dismiss(id);
            onRetry();
          })
        }
        onClose={() => toast.dismiss(id)}
      />
    ),
    { duration: 12_000 },
  );
}

function ErrorToast({
  title,
  error,
  keepsForm,
  onRetry,
  onClose,
}: {
  title: string;
  error: unknown;
  keepsForm: boolean;
  onRetry?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("common.errorToast");
  const tMeta = useTranslations("common.listError");
  const answer = error instanceof ApiError ? error : undefined;
  const kind = !answer ? "network" : answer.status >= 500 ? "server" : "other";

  return (
    <div
      role="alert"
      className="flex w-[420px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border bg-popover py-3.5 pr-3 pl-4 text-popover-foreground shadow-lg"
    >
      <CircleAlert className="mt-px size-[18px] shrink-0 text-status-rejected" strokeWidth={1.75} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <strong className="text-[13px] font-semibold">{title}</strong>
        <span className="text-xs leading-[1.45] text-muted-foreground">
          {t(kind)}
          {keepsForm && (
            <>
              <br />
              {t("keepsForm")}
            </>
          )}
        </span>
        {answer && (
          <span className="mt-[3px] font-mono text-[11px] text-muted-foreground">
            {answer.requestId
              ? tMeta("metaWithId", { status: answer.status, id: answer.requestId })
              : tMeta("meta", { status: answer.status })}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex h-7 cursor-pointer items-center gap-[5px] rounded-md border border-input bg-card px-2.5 text-xs font-medium whitespace-nowrap outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
          >
            <RefreshCw className="size-[13px]" strokeWidth={1.75} aria-hidden />
            {t("retry")}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring-soft"
        >
          <X className="size-[15px]" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
}
