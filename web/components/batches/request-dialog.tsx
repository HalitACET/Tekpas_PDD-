"use client";

import { formatPhone, whatsAppNumber } from "@tekpas/shared";
import { AlertCircle, Check, Copy, Link2, MessageCircle, RefreshCw, Unlink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  type ChainStep,
  type CreatedDataRequest,
  useChangeDeadline,
  useCreateDataRequest,
  useRevokeDataRequest,
} from "@/lib/api/batches";
import { useSupplier } from "@/lib/api/suppliers";
import { useSession } from "@/lib/auth/use-session";

const DAYS = [3, 7, 14] as const;

/** The link the web builds from the token (K21): the token after `#` never reaches a server. */
export function linkFor(token: string): string {
  return `${window.location.origin}/r#${token}`;
}

/** "wa.me/<number>?text=…": straight to the supplier when its phone is known (PLAN M4). */
export function whatsAppUrl(text: string, phone?: string | null): string {
  return `https://wa.me/${whatsAppNumber(phone) ?? ""}?text=${encodeURIComponent(text)}`;
}

type Link = Pick<CreatedDataRequest, "id" | "createdAt" | "expiresAt" | "validDays"> & {
  /** Known only right after creating it (only its hash is stored). */
  token?: string;
  openCount: number;
};

/**
 * Design v0.4 46a/b/c "Veri talep et". Opening it creates the link, unless the step already has an open one:
 * that one is shown without its address (the server keeps only a hash) and "Yeni bağlantı oluştur" replaces
 * it. The deadline is 3, 7 or 14 days from the link's creation.
 */
export function RequestDialog({
  open,
  onClose,
  batchId,
  batchNo,
  productName,
  step,
}: {
  open: boolean;
  onClose: () => void;
  batchId: string;
  batchNo: string;
  productName: string;
  step: ChainStep;
}) {
  const t = useTranslations("batches.chain.request");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={t("close")} className="w-[580px]">
        {open && <RequestBody onClose={onClose} batchId={batchId} batchNo={batchNo} productName={productName} step={step} />}
      </DialogContent>
    </Dialog>
  );
}

function RequestBody({
  onClose,
  batchId,
  batchNo,
  productName,
  step,
}: {
  onClose: () => void;
  batchId: string;
  batchNo: string;
  productName: string;
  step: ChainStep;
}) {
  const t = useTranslations("batches.chain.request");
  const tStep = useTranslations("enums.stepType");
  const locale = useLocale();
  const session = useSession();
  const supplier = useSupplier(step.supplier?.id);
  const create = useCreateDataRequest(batchId);
  const revoke = useRevokeDataRequest(batchId);
  const deadline = useChangeDeadline(batchId);

  const existing = step.request && (step.request.status === "SENT" || step.request.status === "OPENED") ? step.request : undefined;
  const [link, setLink] = useState<Link | undefined>(existing);
  const [revoked, setRevoked] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const createLink = (validDays = 7) =>
    create.mutate(
      { stepId: step.id, validDays },
      {
        onSuccess: (created) => {
          setLink({ ...created, openCount: 0 });
          setRevoked(false);
          setCopied(false);
        },
        onError: (error) => showErrorToast({ title: t("createFailed"), error, onRetry: () => createLink(validDays) }),
      },
    );

  // Opening the dialog sends the request (46a shows the link at once), unless an open one exists.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || existing) return;
    started.current = true;
    createLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the dialog opens
  }, []);

  const company = session.status === "authenticated" ? session.user.company.name : "";
  const userName = session.status === "authenticated" ? session.user.fullName : "";
  const stepName = tStep(step.stepType);
  const supplierName = step.supplier?.name ?? "";
  const city = step.supplier?.city;
  const phone = supplier.data?.phone;
  // Design v1.0 132a/b: the person to talk to on top and the company under them, greeted by first name; without
  // one, the company on top and "ilgili kişi girilmemiş" under it.
  const contact = supplier.data?.contactName ?? undefined;
  const firstName = contact?.split(/\s+/)[0];
  const initials = (contact ?? supplierName)
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toLocaleUpperCase(locale))
    .join("");

  const dateTime = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const longDate = (iso: string) => {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
    return `${date} ${new Intl.DateTimeFormat(locale, { weekday: "long" }).format(d)}`;
  };
  const shortDate = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" }).format(new Date(iso));

  const url = link?.token ? linkFor(link.token) : undefined;
  const shown = url?.replace(/^https?:\/\//, "");
  const message =
    link &&
    `${t(firstName ? "textNamed" : "text", { contact: firstName ?? "", company, batchNo, product: productName, step: locale === "de" ? stepName : stepName.toLocaleLowerCase(locale), deadline: shortDate(link.expiresAt) })}`;
  const active = !!link && !revoked;

  const changeDays = (days: number) => {
    if (!link || revoked || days === link.validDays) return;
    deadline.mutate(
      { requestId: link.id, validDays: days },
      {
        onSuccess: (summary) => setLink({ ...link, expiresAt: summary.expiresAt, validDays: summary.validDays }),
        onError: (error) => showErrorToast({ title: t("deadlineFailed"), error }),
      },
    );
  };
  const doRevoke = () => {
    if (!link) return;
    revoke.mutate(link.id, {
      onSuccess: () => {
        setRevoked(true);
        setConfirm(false);
      },
      onError: (error) => showErrorToast({ title: t("revokeFailed"), error }),
    });
  };
  const copy = () => {
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => setCopied(true));
  };

  return (
    <>
      <div className="flex flex-col gap-1 px-6 pt-5 pr-16 pb-1">
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("sub", { supplier: supplierName, step: stepName, batchNo })}</DialogDescription>
      </div>
      <div className="flex flex-col gap-[18px] px-6 pt-4 pb-5">
        <div className="flex items-center gap-3 rounded-lg bg-popover-muted px-3 py-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-silk text-xs font-semibold text-[#3D3A35]" aria-hidden>
            {initials}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[13px] font-medium">{contact ?? supplierName}</span>
            <span className="truncate text-xs text-muted-foreground">
              {contact
                ? city
                  ? `${supplierName} · ${city}`
                  : supplierName
                : supplier.data
                  ? city
                    ? `${city} · ${t("noContact")}`
                    : t("noContact")
                  : city}
            </span>
          </span>
          <span className="font-mono text-xs">{phone ? formatPhone(phone) : t("noPhone")}</span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-medium" id="request-deadline">
            {t("deadline")}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <div role="radiogroup" aria-labelledby="request-deadline" className="flex gap-0.5 rounded-lg bg-muted p-[3px]">
              {DAYS.map((d) => {
                const on = (link?.validDays ?? 7) === d;
                return (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={!active || deadline.isPending}
                    onClick={() => changeDays(d)}
                    className={`h-[30px] rounded-md px-3.5 text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft disabled:cursor-not-allowed ${
                      on ? "bg-card text-foreground shadow-xs" : "text-muted-foreground"
                    }`}
                  >
                    {t("days", { count: d })}
                  </button>
                );
              })}
            </div>
            {link && <span className="text-[13px] tabular-nums">{longDate(link.expiresAt)}</span>}
          </div>
          <span className="text-xs text-muted-foreground">{t("deadlineHint")}</span>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-medium">{t("link")}</span>
            <span className="text-xs text-muted-foreground">
              {revoked
                ? t("revokedMeta")
                : link
                  ? `${t("created", { date: dateTime.format(new Date(link.createdAt)) })} · ${t("opened", { count: link.openCount })}`
                  : t("creating")}
            </span>
          </div>
          {link && !link.token ? (
            <p className="rounded-md border border-dashed border-input px-3 py-2.5 text-xs leading-normal text-muted-foreground">{t("hidden")}</p>
          ) : (
            <div className="flex gap-2">
              <span
                className={`flex h-9 min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md border border-input px-2.5 font-mono text-[13px] whitespace-nowrap ${
                  revoked ? "bg-muted text-muted-foreground line-through" : "bg-card"
                }`}
              >
                <Link2 className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
                <span className="truncate">{shown ?? "…"}</span>
              </span>
              {revoked ? (
                <span className="flex h-9 items-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-status-rejected-muted py-[3px] pr-[9px] pl-2 text-xs font-medium whitespace-nowrap text-status-rejected-foreground">
                    <span className="size-1.5 rounded-full bg-status-rejected" aria-hidden />
                    {t("revokedBadge")}
                  </span>
                </span>
              ) : (
                <Button variant="secondary" className="px-3" onClick={copy} disabled={!url}>
                  {copied ? <Check className="size-3.5" strokeWidth={2} aria-hidden /> : <Copy className="size-3.5" strokeWidth={1.75} aria-hidden />}
                  {copied ? t("copied") : t("copy")}
                </Button>
              )}
            </div>
          )}
        </div>

        {url && message && (
          <div className={`flex flex-col gap-2 ${revoked ? "opacity-50" : ""}`}>
            <span className="text-[13px] font-medium">{t("message")}</span>
            <div className="flex max-w-[440px] flex-col gap-1 self-start rounded-xl rounded-bl-[4px] bg-popover-muted px-3 pt-2.5 pb-1.5 text-[13px] leading-[1.55]">
              <span>
                {message}{" "}
                <span className={`break-all text-brand-text ${revoked ? "line-through" : ""}`}>{url}</span>{" "}
                {t("signoff", { name: userName })}
              </span>
              <span className="self-end text-[11px] text-muted-foreground">{t("preview")}</span>
            </div>
          </div>
        )}

        {confirm && (
          <div role="alertdialog" aria-labelledby="revoke-title" className="flex flex-col gap-2.5 rounded-lg border border-status-rejected bg-status-rejected-muted px-3.5 py-3">
            <span className="flex gap-2 text-[13px] leading-[1.45] text-status-rejected-foreground">
              <AlertCircle className="mt-px size-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span>
                <span id="revoke-title" className="font-semibold">
                  {t("revokeTitle")}
                </span>{" "}
                {t("revokeBody", { supplier: supplierName })}
              </span>
            </span>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirm(false)}>
                {t("cancel")}
              </Button>
              <Button variant="destructive" size="sm" onClick={doRevoke} disabled={revoke.isPending}>
                {t("revoke")}
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t px-6 py-3.5">
        {active && !confirm && (
          <Button variant="ghost" className="px-2.5 text-status-rejected-foreground hover:bg-status-rejected-muted" onClick={() => setConfirm(true)}>
            <Unlink className="size-3.5" strokeWidth={1.75} aria-hidden />
            {t("revoke")}
          </Button>
        )}
        {(revoked || (link && !link.token)) && (
          <Button variant="secondary" className="px-3" onClick={() => createLink(link?.validDays ?? 7)} disabled={create.isPending}>
            <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />
            {t("renew")}
          </Button>
        )}
        <Button variant="ghost" className="ml-auto" onClick={onClose}>
          {t("close")}
        </Button>
        <Button
          disabled={!active || !url}
          onClick={() => url && message && window.open(whatsAppUrl(`${message} ${url} ${t("signoff", { name: userName })}`, phone), "_blank", "noopener")}
        >
          <MessageCircle className="size-3.5" strokeWidth={1.75} aria-hidden />
          {t("whatsapp")}
        </Button>
      </div>
    </>
  );
}
