"use client";

import { AlertTriangle, Check, Copy, Link2, Lock, MessageCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { showErrorToast } from "@/components/common/error-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/request";
import {
  TEAM_ROLES,
  type TeamRole,
  type UserInvitation,
  type UserResponse,
  useInviteUser,
  useUpdateUser,
} from "@/lib/api/users";
import { cn } from "@/lib/utils";
import { initialsOf } from "./initials";

/** "30 Eki 2026", as the dialogs and the link page write a link's last day. */
export function useDay() {
  const locale = useLocale();
  const format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Istanbul" });
  return (iso: string) => format.format(new Date(iso));
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 px-6 pt-5 pr-16 pb-1">
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{sub}</DialogDescription>
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 flex justify-end gap-2 border-t px-6 pt-4 pb-5">{children}</div>;
}

/** The four roles with what each may do (design v1.2 162, 165). */
function RoleOptions({ value, current, onChange }: { value: TeamRole; current?: TeamRole; onChange: (role: TeamRole) => void }) {
  const t = useTranslations("team");
  return (
    <div role="radiogroup" aria-label={t("roleLabel")} className="flex flex-col overflow-hidden rounded-lg border">
      {TEAM_ROLES.map((role, i) => {
        const on = role === value;
        return (
          <button
            key={role}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(role)}
            className={cn(
              "flex cursor-pointer items-start gap-3 px-3 py-2.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring-soft focus-visible:ring-inset",
              i < TEAM_ROLES.length - 1 && "border-b",
              on ? "bg-accent" : "hover:bg-accent/60",
            )}
          >
            <span
              className={cn("mt-0.5 size-4 flex-none rounded-full", on ? "border-[5px] border-primary" : "border border-input bg-card")}
              aria-hidden
            />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                {t(`role.${role}.name`)}
                {current === role && (
                  <span className="rounded border px-1.5 text-[11px] font-medium text-muted-foreground">{t("current")}</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{t(`role.${role}.desc`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** "Kişi davet et" (162): name, e-mail, role; on success the link dialog takes over. */
export function InviteDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (invitation: UserInvitation) => void }) {
  const t = useTranslations("team");
  const invite = useInviteUser();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("EDITOR");
  const taken = invite.error instanceof ApiError && invite.error.status === 409;
  const valid = fullName.trim().length > 1 && /.+@.+\..+/.test(email.trim());

  const close = () => {
    setFullName("");
    setEmail("");
    setRole("EDITOR");
    invite.reset();
    onClose();
  };
  const submit = () =>
    invite.mutate(
      { fullName: fullName.trim(), email: email.trim(), role },
      {
        onSuccess: (invitation) => {
          close();
          onInvited(invitation);
        },
        onError: (error) => {
          if (!(error instanceof ApiError && error.status === 409)) showErrorToast({ title: t("saveFailed"), error, onRetry: submit, keepsForm: true });
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent closeLabel={t("close")} className="w-[520px]">
        <Header title={t("invite")} sub={t("inviteSub")} />
        <form
          className="flex flex-col gap-4 px-6 pt-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) submit();
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            {t("fullName")}
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("fullNamePlaceholder")} autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            {t("email")}
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (taken) invite.reset();
              }}
              placeholder={t("emailPlaceholder")}
              aria-invalid={taken || undefined}
              autoComplete="off"
            />
            <span className={cn("text-xs font-normal", taken ? "text-status-rejected-foreground" : "text-muted-foreground")}>
              {taken ? t("emailTaken") : t("emailHint")}
            </span>
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">{t("roleLabel")}</span>
            <RoleOptions value={role} onChange={setRole} />
          </div>
          <button type="submit" hidden />
        </form>
        <Footer>
          <Button type="button" variant="ghost" onClick={close}>
            {t("cancel")}
          </Button>
          <Button type="button" disabled={!valid || invite.isPending} className="disabled:opacity-50" onClick={submit}>
            {t("createLink")}
          </Button>
        </Footer>
      </DialogContent>
    </Dialog>
  );
}

/** "Davet bağlantısı hazır" (163) and "Yeni davet bağlantısı" (164): the link, shown once, with copy and WhatsApp. */
export function LinkDialog({
  invitation,
  renewed,
  companyName,
  onClose,
}: {
  invitation: UserInvitation | undefined;
  renewed: boolean;
  companyName: string;
  onClose: () => void;
}) {
  const t = useTranslations("team");
  const day = useDay();
  const [copied, setCopied] = useState(false);
  const link = invitation ? `${window.location.origin}/davet#${invitation.token}` : "";
  const shortLink = invitation ? `${window.location.host}/davet#${invitation.token.slice(0, 4)}…${invitation.token.slice(-4)}` : "";
  const until = invitation ? day(invitation.expiresAt) : "";
  const message = t("whatsappMessage", { company: companyName, link, date: until });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const close = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={!!invitation} onOpenChange={(next) => !next && close()}>
      <DialogContent closeLabel={t("close")} className="w-[520px]">
        <Header title={renewed ? t("renewTitle") : t("linkTitle")} sub={renewed ? t("renewSub") : t("linkSub")} />
        {invitation && (
          <div className="flex flex-col gap-4 px-6 pt-3 pb-2">
            <div className="flex items-center gap-3 rounded-lg bg-popover-muted px-3 py-2.5">
              <span className="flex size-8 flex-none items-center justify-center rounded-full bg-silk text-xs font-semibold text-[#3D3A35]">
                {initialsOf(invitation.user.fullName)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{invitation.user.fullName}</span>
                <span className="truncate text-xs text-muted-foreground">{invitation.user.email}</span>
              </span>
              <span className="text-[13px]">{t(`role.${invitation.user.role as TeamRole}.name`)}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium">{t("linkLabel")}</span>
                <span className="text-xs text-muted-foreground">{t("linkValid", { date: until })}</span>
              </div>
              <div className="flex gap-2">
                <span className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border bg-card px-3 font-mono text-[13px]">
                  <Link2 className="size-[15px] flex-none text-muted-foreground" strokeWidth={1.75} aria-hidden />
                  <span className="truncate" title={link}>
                    {shortLink}
                  </span>
                </span>
                <Button type="button" variant="secondary" className="flex-none shadow-none" onClick={() => void copy()}>
                  {copied ? <Check strokeWidth={2} aria-hidden /> : <Copy strokeWidth={1.75} aria-hidden />}
                  {copied ? t("copied") : t("copy")}
                </Button>
              </div>
              <span className="flex gap-2 text-xs leading-normal text-muted-foreground">
                <Lock className="mt-0.5 size-[13px] flex-none" strokeWidth={1.75} aria-hidden />
                {t("linkNote")}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">{t("whatsappLabel")}</span>
              <div className="flex flex-col gap-1 rounded-lg bg-popover-muted px-3 py-2.5 text-[13px] leading-normal">
                <span className="break-all">{message}</span>
                <span className="self-end text-[11px] text-muted-foreground">{t("preview")}</span>
              </div>
            </div>
          </div>
        )}
        <Footer>
          <Button type="button" variant="ghost" onClick={close}>
            {t("close")}
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground outline-none hover:bg-primary-hover focus-visible:ring-[3px] focus-visible:ring-ring-soft"
          >
            <MessageCircle className="size-[15px]" strokeWidth={1.75} aria-hidden />
            {t("whatsapp")}
          </a>
        </Footer>
      </DialogContent>
    </Dialog>
  );
}

/** "Rolü değiştir" (165, 165b LAST_OWNER). */
export function RoleDialog({ user, onClose }: { user: UserResponse | undefined; onClose: () => void }) {
  const t = useTranslations("team");
  const update = useUpdateUser();
  const current = user?.role as TeamRole | undefined;
  const [picked, setPicked] = useState<TeamRole>();
  const role = picked ?? current ?? "EDITOR";
  const lastOwner = update.error instanceof ApiError && update.error.problem?.reason === "LAST_OWNER";
  const close = () => {
    setPicked(undefined);
    update.reset();
    onClose();
  };
  const save = () =>
    user &&
    update.mutate(
      { id: user.id, role },
      {
        onSuccess: close,
        onError: (error) => {
          if (!(error instanceof ApiError && error.problem?.reason === "LAST_OWNER")) showErrorToast({ title: t("saveFailed"), error, onRetry: save });
        },
      },
    );

  return (
    <Dialog open={!!user} onOpenChange={(next) => !next && close()}>
      <DialogContent closeLabel={t("close")} className="w-[520px]">
        <Header title={t("roleTitle")} sub={user ? `${user.fullName} · ${user.email}` : ""} />
        <div className="flex flex-col gap-3 px-6 pt-3 pb-2">
          <RoleOptions value={role} current={current} onChange={setPicked} />
          <span className="text-xs text-muted-foreground">{t("roleNote")}</span>
          {lastOwner && (
            <div role="alert" className="flex gap-2.5 rounded-lg bg-status-rejected-muted px-3 py-2.5 text-[13px] text-status-rejected-foreground">
              <AlertTriangle className="mt-px size-4 flex-none" strokeWidth={1.9} aria-hidden />
              <span className="flex flex-col gap-0.5">
                <span>
                  <strong className="font-semibold">{t("lastOwnerTitle")}</strong> {t("lastOwnerBody")}
                </span>
                <span className="font-mono text-[11px] opacity-80">LAST_OWNER</span>
              </span>
            </div>
          )}
        </div>
        <Footer>
          <Button type="button" variant="ghost" onClick={close}>
            {t("cancel")}
          </Button>
          <Button type="button" disabled={role === current || update.isPending} className="disabled:opacity-50" onClick={save}>
            {t("saveRole")}
          </Button>
        </Footer>
      </DialogContent>
    </Dialog>
  );
}

/** "… pasifleştirilsin mi?" (166). */
export function DeactivateDialog({ user, onClose }: { user: UserResponse | undefined; onClose: () => void }) {
  const t = useTranslations("team");
  const update = useUpdateUser();
  const run = () =>
    user &&
    update.mutate(
      { id: user.id, active: false },
      { onSuccess: onClose, onError: (error) => showErrorToast({ title: t("saveFailed"), error, onRetry: run }) },
    );
  return (
    <Dialog open={!!user} onOpenChange={(next) => !next && onClose()}>
      <DialogContent closeLabel={t("close")} className="w-[480px]">
        <Header
          title={user ? t("deactivateTitle", { name: user.fullName }) : ""}
          sub={user ? `${t(`role.${user.role as TeamRole}.name`)} · ${user.email}` : ""}
        />
        <div className="flex flex-col gap-2 px-6 pt-3 pb-2 text-[13px] leading-normal">
          <span>{user ? t("deactivateBody", { name: user.fullName }) : ""}</span>
          <span className="text-muted-foreground">{t("deactivateKeep")}</span>
        </div>
        <Footer>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="button" variant="destructive" disabled={update.isPending} onClick={run}>
            {t("deactivate")}
          </Button>
        </Footer>
      </DialogContent>
    </Dialog>
  );
}
