"use client";

import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { ListError } from "@/components/common/list-states";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type CertificateTask, certificateTasks, useExpiringCertificates } from "@/lib/api/issues";
import { type TaskItem, useTasks } from "@/lib/api/tasks";
import { canWriteCatalog } from "@/lib/auth/permissions";
import { useSession } from "@/lib/auth/use-session";
import { GuardedButton } from "@/components/common/guarded-button";
import { whatsAppUrl } from "@/components/batches/request-dialog";
import { PageView } from "@/components/shell/page-view";

type Kind = TaskItem["kind"];
type Tone = "submitted" | "rejected" | "pending";

const TONE: Record<Kind, Tone> = {
  STEP_SUBMITTED: "submitted",
  CORRECTION_NO_LINK: "rejected",
  LINK_EXPIRED: "rejected",
  LINK_EXPIRING: "pending",
  STEP_UNASSIGNED: "pending",
  ORIGIN_MISSING: "pending",
  NO_CHAIN: "pending",
};

const PILL: Record<Tone, { badge: string; dot: string }> = {
  submitted: { badge: "bg-status-submitted-muted text-status-submitted-foreground", dot: "bg-status-submitted" },
  rejected: { badge: "bg-status-rejected-muted text-status-rejected-foreground", dot: "bg-status-rejected" },
  pending: { badge: "bg-status-pending-muted text-status-pending-foreground", dot: "bg-status-pending" },
};

/** Where a task's button leads: the batch, with the step's panel (and its action) open. */
function hrefFor(task: TaskItem): string {
  const base = `/batches/${task.batchId}`;
  switch (task.kind) {
    case "NO_CHAIN":
      return base;
    case "STEP_UNASSIGNED":
      return `${base}?step=${task.stepId}&open=assign`;
    case "CORRECTION_NO_LINK":
    case "LINK_EXPIRED":
      return `${base}?step=${task.stepId}&open=request`;
    default:
      return `${base}?step=${task.stepId}`;
  }
}

/**
 * Design v0.4 48a/b. Three groups from GET /tasks (titles fitted to what they hold, PLAN M4): data awaiting
 * approval, requests to follow up and incomplete steps. Certificates running out join with M7.
 */
export function TasksPage() {
  const t = useTranslations("tasks");
  const tPage = useTranslations("pages.tasks");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const session = useSession();
  const supplier = session.status === "authenticated" && session.user.role === "SUPPLIER";
  const tasks = useTasks({ enabled: !supplier });
  const certificates = useExpiringCertificates({ enabled: !supplier });
  const certs = certificateTasks(certificates.data);
  // One "now" per visit, for the date in the header and the days left.
  const [now] = useState(() => new Date());
  const today = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(now);

  // Supplier users fill their steps through links (M4) and have no company tasks yet (mobile, M8).
  if (supplier) return <PageView page="tasks" />;

  const groups = tasks.data
    ? ([
        ["review", tasks.data.review],
        ["followUp", tasks.data.followUp],
        ["incomplete", tasks.data.incomplete],
      ] as const)
    : [];

  return (
    <div className="flex max-w-[1100px] flex-col gap-7">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl leading-7 font-semibold tracking-[-0.015em]">{tPage("title")}</h1>
          <p className="text-[13px] text-muted-foreground">{t("sub")}</p>
        </div>
        {tasks.data && tasks.data.total + certs.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{t("summary", { count: tasks.data.total + certs.length, date: today })}</span>
        )}
      </div>

      {tasks.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label={tCommon("loading")}>
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : tasks.isError && !tasks.data ? (
        <div className="rounded-lg border bg-card">
          <ListError title={t("loadError")} error={tasks.error} onRetry={() => void tasks.refetch()} retrying={tasks.isFetching} keepsFilters={false} />
        </div>
      ) : tasks.data!.total === 0 && certs.length === 0 ? (
        <EmptyTasks />
      ) : (
        <>
        {certs.length > 0 && <CertificatesGroup items={certs} />}
        {groups
          .filter(([, items]) => items.length > 0)
          .map(([key, items]) => (
            <section key={key} aria-labelledby={`tasks-${key}`} className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <h2 id={`tasks-${key}`} className="text-[15px] font-semibold tracking-[-0.01em]">
                  {t(`groups.${key}.title`)}
                </h2>
                <span className="rounded-[4px] bg-muted px-1.5 py-px font-mono text-[11px] font-medium text-muted-foreground">{items.length}</span>
                <span className="text-xs text-muted-foreground">{t(`groups.${key}.desc`)}</span>
              </div>
              <ul className="overflow-hidden rounded-lg border bg-card">
                {items.map((task) => (
                  <TaskRow key={`${task.kind}-${task.stepId ?? task.batchId}`} task={task} now={now} />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function TaskRow({ task, now }: { task: TaskItem; now: Date }) {
  const t = useTranslations("tasks");
  const tStep = useTranslations("enums.stepType");
  const tBatches = useTranslations("batches");
  const locale = useLocale();
  const session = useSession();
  const tone = PILL[TONE[task.kind]];
  const step = task.stepType ? tStep(task.stepType) : "";
  const stepInText = locale === "de" ? step : step.toLocaleLowerCase(locale);
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

  const title =
    task.kind === "STEP_UNASSIGNED"
      ? t("kinds.STEP_UNASSIGNED.title", { step })
      : task.kind === "ORIGIN_MISSING" || task.kind === "NO_CHAIN"
        ? t(`kinds.${task.kind}.title`)
        : t("stepData", { supplier: task.supplierName ?? "", step });
  const sub =
    task.kind === "STEP_SUBMITTED"
      ? t("kinds.STEP_SUBMITTED.sub", { name: task.submitterName ?? task.supplierName ?? "", count: task.filledFields ?? 0 })
      : task.kind === "CORRECTION_NO_LINK"
        ? t("kinds.CORRECTION_NO_LINK.sub")
        : task.kind === "LINK_EXPIRED" || task.kind === "LINK_EXPIRING"
          ? t("opened", { count: task.openCount ?? 0 })
          : task.productName;

  let when = "—";
  let urgent = false;
  if (task.at) when = formatWhen(task.at, now, locale, tBatches("yesterday"));
  if (task.deadline) {
    urgent = true;
    when =
      task.kind === "LINK_EXPIRING"
        ? t("daysLeft", { date: date(task.deadline), days: Math.max(1, Math.ceil((Date.parse(task.deadline) - now.getTime()) / 86_400_000)) })
        : date(task.deadline);
  }

  const cta = t(`kinds.${task.kind}.cta`);
  const button = "h-8 px-3 text-xs";
  const reminder = () => {
    const company = session.status === "authenticated" ? session.user.company.name : "";
    const name = session.status === "authenticated" ? session.user.fullName : "";
    const text = t("reminder", { company, batchNo: task.batchNo, step: stepInText, deadline: task.deadline ? date(task.deadline) : "", name });
    window.open(whatsAppUrl(text, task.supplierPhone), "_blank", "noopener");
  };

  return (
    <li className="grid min-h-14 grid-cols-[150px_minmax(0,1fr)_160px_130px_140px] items-center gap-3 border-b px-4 py-2 text-[13px] last:border-b-0 hover:bg-accent max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-y-1">
      <span className="max-lg:col-span-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full py-[3px] pr-[9px] pl-2 text-xs font-medium whitespace-nowrap ${tone.badge}`}>
          <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
          {t(`kinds.${task.kind}.label`)}
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      <span className="font-mono text-xs max-lg:hidden">{task.batchNo}</span>
      <span className={`text-xs tabular-nums max-lg:hidden ${urgent ? "text-status-expiring-foreground" : "text-muted-foreground"}`}>{when}</span>
      <span className="flex justify-end">
        {task.kind === "LINK_EXPIRING" ? (
          <Button variant="secondary" className={button} onClick={reminder}>
            {cta}
          </Button>
        ) : (
          <Link href={hrefFor(task)} className={cn(buttonVariants({ variant: "secondary", className: button }))}>
            {cta}
          </Link>
        )}
      </span>
    </li>
  );
}

/** "17 Eyl, 15:40", "Dün, 16:20" or the time today (design v0.4 48a). */
function formatWhen(iso: string, now: Date, locale: string, yesterday: string): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86_400_000);
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(d);
  if (days === 0) return time;
  if (days === 1) return `${yesterday}, ${time}`;
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(d).replace(/\.$/, "");
  return `${date}, ${time}`;
}

/** 48b. */
function EmptyTasks() {
  const t = useTranslations("tasks");
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-input px-6 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-[14px] bg-status-approved-muted text-status-approved-foreground">
        <Check className="size-6" strokeWidth={1.75} aria-hidden />
      </span>
      <h2 className="font-serif text-[26px] leading-[normal] font-normal tracking-[-0.015em]">{t("emptyTitle")}</h2>
      <p className="max-w-[460px] text-sm leading-[1.55] text-pretty text-muted-foreground">{t("emptyBody")}</p>
      <Link href="/batches" className={cn(buttonVariants({ variant: "secondary", className: "mt-1.5" }))}>
        {t("goBatches")}
      </Link>
    </div>
  );
}

/** Design v0.7 89a: certificates that ended or end within 30 days, one row per certificate with the batches using it. */
function CertificatesGroup({ items }: { items: CertificateTask[] }) {
  const t = useTranslations("tasks");
  return (
    <section aria-labelledby="tasks-certificates" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 id="tasks-certificates" className="text-[15px] font-semibold tracking-[-0.01em]">
          {t("groups.certificates.title")}
        </h2>
        <span className="rounded-[4px] bg-muted px-1.5 py-px font-mono text-[11px] font-medium text-muted-foreground">{items.length}</span>
        <span className="text-xs text-muted-foreground">{t("groups.certificates.desc")}</span>
      </div>
      <ul className="overflow-hidden rounded-lg border bg-card">
        {items.map((item) => (
          <CertificateRow key={item.key} item={item} />
        ))}
      </ul>
    </section>
  );
}

function CertificateRow({ item }: { item: CertificateTask }) {
  const t = useTranslations("tasks");
  const tStep = useTranslations("enums.stepType");
  const tDoc = useTranslations("enums.docType");
  const locale = useLocale();
  const session = useSession();
  const canWrite = session.status === "authenticated" && canWriteCatalog(session.user.role);
  const expired = item.daysLeft < 0;
  const tone = expired ? PILL.rejected : { badge: "bg-status-expiring-muted text-status-expiring-foreground", dot: "bg-status-expiring" };
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${item.validUntil}T00:00:00Z`));
  const base = `/batches/${item.batchId}?step=${item.stepId}`;
  const button = "h-8 px-3 text-xs";

  return (
    <li className="grid min-h-14 grid-cols-[150px_minmax(0,1fr)_190px_170px_auto] items-center gap-3 border-b px-4 py-2 text-[13px] last:border-b-0 hover:bg-accent max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:gap-y-1">
      <span className="max-lg:col-span-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full py-[3px] pr-[9px] pl-2 text-xs font-medium whitespace-nowrap ${tone.badge}`}>
          <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden />
          {expired ? t("certificate.expiredLabel") : t("certificate.expiringLabel")}
        </span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">
          {item.supplierName ?? tStep(item.stepType)} · {tDoc(item.docType)}
        </span>
        <span className="truncate text-xs text-muted-foreground">{t("certificate.where", { step: tStep(item.stepType) })}</span>
      </span>
      <span className="flex min-w-0 flex-wrap gap-x-2 font-mono text-xs max-lg:hidden" aria-label={t("certificate.batches")}>
        {item.batches.map((b) => (
          <Link key={b.id} href={`/batches/${b.id}?step=${b.stepId}`} className="underline-offset-2 hover:underline">
            {b.batchNo}
          </Link>
        ))}
      </span>
      <span className={`text-xs tabular-nums max-lg:hidden ${expired ? "text-status-rejected-foreground" : "text-status-expiring-foreground"}`}>
        {expired ? t("certificate.expired", { date }) : t("certificate.daysLeft", { days: item.daysLeft })}
      </span>
      <span className="flex justify-end gap-2">
        <Link href={base} className={cn(buttonVariants({ variant: "secondary", className: button }))}>
          {t("certificate.go")}
        </Link>
        {canWrite ? (
          <Link href={`${base}&open=request`} className={cn(buttonVariants({ className: button }))}>
            {t("certificate.renew")}
          </Link>
        ) : (
          <GuardedButton allowed={false} className={button} tooltipSide="top">
            {t("certificate.renew")}
          </GuardedButton>
        )}
      </span>
    </li>
  );
}
