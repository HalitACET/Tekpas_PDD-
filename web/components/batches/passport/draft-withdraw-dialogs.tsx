"use client";

import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useOpenPassportDraft, useWithdrawPassport } from "@/lib/api/passports";

/**
 * "Yeni sürüm (taslak) başlatılsın mı?" (design v0.6): says that the published version stays live and is not withdrawn,
 * and what the next publishing does. Nothing is created now; the batch is open for changes again.
 */
export function DraftDialog({ batchId, version, open, onClose }: { batchId: string; version: number; open: boolean; onClose: () => void }) {
  const t = useTranslations("publishing");
  const draft = useOpenPassportDraft(batchId);
  const run = () =>
    draft.mutate(undefined, {
      onSuccess: onClose,
      onError: (error) => showErrorToast({ title: t("draftFailed"), error, onRetry: run }),
    });
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !draft.isPending && onClose()}>
      <DialogContent closeLabel={t("close")} className="w-[480px] max-w-[calc(100vw-2rem)]">
        <div className="flex flex-col gap-3 px-6 pt-5 pr-16 pb-1">
          <DialogTitle>{t("draftTitle")}</DialogTitle>
          <DialogDescription className="text-sm leading-[1.55] text-pretty">{t("draftBody", { version, next: version + 1 })}</DialogDescription>
        </div>
        <div className="flex justify-end gap-2 px-6 pt-4 pb-5">
          <DialogClose render={<Button type="button" variant="secondary" disabled={draft.isPending} />}>{t("publishCancel")}</DialogClose>
          <Button type="button" disabled={draft.isPending} onClick={run}>
            {t("draftConfirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Pasaport geri çekilsin mi?" (design v0.6): a reason is required (500 characters, kept in the version history, never
 * shown to the consumer). The button asks for it before anything is sent.
 */
export function WithdrawDialog({
  batchId,
  passportId,
  open,
  onClose,
}: {
  batchId: string;
  passportId: string | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("publishing");
  const withdraw = useWithdrawPassport(batchId);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const id = useId();
  const invalid = tried && !reason.trim();

  const run = () => {
    if (!reason.trim()) {
      setTried(true);
      return;
    }
    if (!passportId) return;
    withdraw.mutate(
      { id: passportId, reason: reason.trim() },
      {
        onSuccess: onClose,
        onError: (error) => showErrorToast({ title: t("withdrawFailed"), error, onRetry: run }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !withdraw.isPending && onClose()}>
      <DialogContent closeLabel={t("close")} className="w-[520px] max-w-[calc(100vw-2rem)]">
        {open && (
          <>
            <div className="flex items-start gap-3 px-6 pt-5 pr-16">
              <span className="flex size-9 flex-none items-center justify-center rounded-full bg-status-rejected-muted text-status-rejected-foreground">
                <Ban className="size-[18px]" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="flex flex-col gap-1.5">
                <DialogTitle>{t("withdrawTitle")}</DialogTitle>
                <DialogDescription className="text-sm leading-[1.55] text-pretty">{t("withdrawBody")}</DialogDescription>
              </span>
            </div>
            <div className="flex flex-col gap-1.5 px-6 pt-3.5">
              <label htmlFor={id} className="text-[13px] font-medium">
                {t("withdrawReason")}
              </label>
              <textarea
                id={id}
                value={reason}
                rows={4}
                maxLength={500}
                aria-invalid={invalid || undefined}
                placeholder={t("withdrawPlaceholder")}
                onChange={(e) => setReason(e.target.value.slice(0, 500))}
                className={`resize-none rounded-md border bg-card px-3 py-2.5 text-sm leading-normal shadow-xs outline-none focus-visible:ring-[3px] ${
                  invalid ? "border-destructive ring-status-rejected-muted focus-visible:ring-status-rejected-muted" : "border-input focus-visible:border-ring focus-visible:ring-ring-soft"
                }`}
              />
              <span className="flex justify-between text-xs">
                <span className="text-status-rejected-foreground">{invalid ? t("withdrawRequired") : ""}</span>
                <span className="font-mono text-muted-foreground">{reason.length}/500</span>
              </span>
            </div>
            <div className="flex justify-end gap-2 px-6 pt-3.5 pb-5">
              <DialogClose render={<Button type="button" variant="secondary" disabled={withdraw.isPending} />}>{t("publishCancel")}</DialogClose>
              <Button type="button" variant="destructive" disabled={withdraw.isPending || !passportId} onClick={run}>
                {t("withdrawConfirm")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
