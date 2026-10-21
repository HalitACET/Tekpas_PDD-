import { CORRECTION_PRESETS, formatPhone, whatsAppNumber } from "@tekpas/shared";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Info, Lock, MessageCircle, RefreshCw, RotateCcw, Share2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, BottomBar, Button, Card, Chip, Sheet, Skeleton, Tag, T, TopBar } from "@/components/ui";
import { WEB_URL } from "@/lib/config";
import { formatWhen, locale } from "@/lib/format";
import {
  ApiError,
  type BatchResponse,
  type ChainResponse,
  type ChainStep,
  type CreatedDataRequest,
  type DocumentResponse,
  createDataRequest,
  useApproveStep,
  useRejectStep,
  useStepDocuments,
  useSupplier,
} from "@/lib/queries";
import { dataRows } from "@/lib/step-data";
import { readingChip } from "@/lib/tasks";
import { useSession } from "@/lib/use-session";
import { fonts } from "@/theme/fonts";
import { useTheme } from "@/theme/theme";

const CONFIDENT = 0.8;

/** "İplik · Ege İplik": the step and who supplies it. */
function stepTitle(t: ReturnType<typeof useTranslation>["t"], step: ChainStep): string {
  const name = t(`stepType.${step.stepType}`);
  return step.supplier ? `${name} · ${step.supplier.name}` : name;
}

/** The chip of a document of the step, as the task list words it. */
function documentChip(doc: DocumentResponse): { kind: "lowConfidence" | "approved" | "rejected" | "pending"; key: string; count?: number } {
  if (doc.reviewStatus === "VERIFIED") return { kind: "approved", key: "stepStatus.APPROVED" };
  if (doc.extractionStatus === "QUEUED" || doc.extractionStatus === "RUNNING") return { kind: "pending", key: "upload.readingWait" };
  const fields = Object.values(doc.extraction?.fields ?? {}).filter((f): f is NonNullable<typeof f> => !!f);
  return readingChip({
    extractionStatus: doc.extractionStatus,
    extractionMethod: doc.extractionMethod ?? undefined,
    proposedFields: fields.length,
    lowConfidence: fields.filter((f) => f.confidence < CONFIDENT).length,
  });
}

/**
 * Design v0.9 103a–103f, 104b–104c: what a supplier sent, field by field, with its documents. OWNER and ADMIN approve
 * it or ask for a correction with a reason (the ready reasons are the web's); EDITOR and VIEWER see it read-only. A
 * decision someone else made meanwhile (409) is told, not overwritten.
 */
export function StepReviewScreen({
  step,
  batch,
  loading,
  failed,
  onRetry,
  onBack,
  onOpenDocument,
  onApproved,
  onRejected,
  onTasks,
  now = new Date(),
}: {
  step?: ChainStep;
  batch?: BatchResponse;
  loading: boolean;
  failed?: unknown;
  onRetry: () => void;
  onBack: () => void;
  onOpenDocument: (id: string) => void;
  onApproved: (chain: ChainResponse) => void;
  onRejected: (reason: string) => void;
  onTasks: () => void;
  now?: Date;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const session = useSession();
  const role = session.status === "authenticated" ? session.user.role : undefined;
  const canReview = role === "OWNER" || role === "ADMIN";
  const stepId = step?.id ?? "";
  const batchId = batch?.id ?? "";
  const documents = useStepDocuments(stepId);
  const approve = useApproveStep(stepId, batchId);
  const reject = useRejectStep(stepId, batchId);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState(false);

  const failedWith = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) {
      setRejecting(false);
      setConflict(true);
    }
  };
  const actionError = [approve.error, reject.error].find((e) => e && !(e instanceof ApiError && e.status === 409));

  const title = step ? stepTitle(t, step) : t("batch.title");
  const presets = step ? CORRECTION_PRESETS.filter((p) => (p.stepTypes as readonly string[]).includes(step.stepType)) : [];
  const presetText = (key: string) => `${t(`rejectSheet.${key}`)}.`;
  const pick = (key: string) => {
    const text = presetText(key);
    setReason((r) => (r.includes(text) ? r : r.trim() ? `${r.trim()} ${text}` : text));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={title}
        subtitle={batch?.batchNo}
        backIcon={ChevronLeft}
        backLabel={t("common.back")}
        onBack={onBack}
        border
      />
      <ScrollView contentContainerStyle={styles.page}>
        {step && batch ? (
          <>
            <Submitter step={step} now={now} />
            <DataCard step={step} />
            <View style={{ gap: 8 }}>
              <T size={17} weight="semi" style={{ paddingHorizontal: 4 }}>
                {t("step.documents", { count: documents.data?.length ?? step.documentCount })}
              </T>
              {documents.data?.length === 0 && (
                <T size={15} tone="muted" style={{ paddingHorizontal: 4 }}>
                  {t("step.noDocuments")}
                </T>
              )}
              {documents.data?.map((doc) => {
                const chip = documentChip(doc);
                const meta = [doc.pageCount ? t("step.pages", { count: doc.pageCount }) : undefined, doc.issuer]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Card key={doc.id} onPress={() => onOpenDocument(doc.id)} accessibilityLabel={t(`docType.${doc.docType}`)} style={styles.doc}>
                    <Tag label={t(`docType.${doc.docType}`)} />
                    <View style={{ flex: 1, gap: 5 }}>
                      {meta ? <T size={15}>{meta}</T> : null}
                      <View style={{ alignSelf: "flex-start" }}>
                        <Chip kind={chip.kind} small label={t(chip.key, { count: chip.count })} />
                      </View>
                    </View>
                    <ChevronRight size={22} color={colors.mutedForeground} />
                  </Card>
                );
              })}
            </View>
            {actionError ? (
              <Banner
                kind="rejected"
                icon={AlertTriangle}
                title={t("step.actionFailed")}
                meta={actionError instanceof ApiError ? t("errors.meta", { status: actionError.status }) : undefined}
              />
            ) : null}
          </>
        ) : loading ? (
          <View accessibilityLabel={t("common.loading")} style={{ gap: 14 }}>
            <View style={styles.row}>
              <Skeleton width={40} height={40} radius={999} />
              <Skeleton width={180} height={16} />
            </View>
            <Card style={{ padding: 16, gap: 16 }}>
              {[0, 1, 2, 3, 4].map((k) => (
                <View key={k} style={styles.between}>
                  <Skeleton width="30%" height={14} />
                  <Skeleton width="40%" height={14} />
                </View>
              ))}
            </Card>
            <Skeleton width="100%" height={72} radius={14} />
          </View>
        ) : (
          <Card style={styles.error}>
            <View accessibilityRole="alert" style={styles.row}>
              <AlertTriangle size={22} color={colors.status.rejected.fg} />
              <T size={17} weight="semi" style={{ color: colors.status.rejected.fg }}>
                {t("step.loadError")}
              </T>
            </View>
            <T size={16} style={{ lineHeight: 24 }}>
              {t("step.loadErrorBody")}
            </T>
            {failed instanceof ApiError && (
              <T size={14} family="mono" tone="muted">
                {failed.requestId
                  ? t("errors.metaWithId", { status: failed.status, id: failed.requestId })
                  : t("errors.meta", { status: failed.status })}
              </T>
            )}
            <Button label={t("common.retry")} variant="brand" icon={RefreshCw} onPress={onRetry} />
          </Card>
        )}
      </ScrollView>

      {step && batch && (
        <BottomBar>
          {!canReview ? (
            <>
              <Button label={t("step.locked")} variant="locked" icon={Lock} />
              <T size={15} style={{ textAlign: "center", lineHeight: 21 }}>
                {t("step.lockedNote")}
              </T>
            </>
          ) : step.status !== "SUBMITTED" ? (
            <T size={15} style={{ textAlign: "center", lineHeight: 21 }}>
              {t("step.reviewedNote", { status: t(`stepStatus.${step.status}`) })}
            </T>
          ) : (
            <>
              <Button
                label={approve.isPending ? t("step.approving") : t("step.approve")}
                variant="brand"
                icon={Check}
                busy={approve.isPending}
                disabled={reject.isPending}
                onPress={() => approve.mutate(undefined, { onSuccess: (chain) => onApproved(chain), onError: failedWith })}
              />
              <Button
                label={t("step.reject")}
                variant="secondary"
                icon={RotateCcw}
                height={52}
                disabled={approve.isPending}
                onPress={() => setRejecting(true)}
              />
            </>
          )}
        </BottomBar>
      )}

      <Sheet visible={rejecting} onClose={() => setRejecting(false)}>
        <T family="serif" size={28}>
          {t("rejectSheet.title")}
        </T>
        {step && batch && (
          <T size={16} style={{ lineHeight: 24 }}>
            {`${stepTitle(t, step)} · ${batch.batchNo}`}
          </T>
        )}
        {presets.length > 0 && (
          <View style={{ gap: 10 }}>
            <T size={15} weight="semi">
              {t("rejectSheet.presets")}
            </T>
            <View style={styles.chips}>
              {presets.map((p) => {
                const on = reason.includes(presetText(p.key));
                return (
                  <Pressable
                    key={p.key}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => pick(p.key)}
                    style={[
                      styles.preset,
                      { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.input },
                    ]}
                  >
                    {on && <Check size={16} color={colors.primaryForeground} strokeWidth={2.4} />}
                    <T size={15} weight="medium" style={{ color: on ? colors.primaryForeground : colors.foreground }}>
                      {t(`rejectSheet.${p.key}`)}
                    </T>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        <View style={{ gap: 8 }}>
          <T size={15} weight="semi">
            {t("rejectSheet.reason")}
            <T size={15} style={{ color: colors.destructive }}>
              {" *"}
            </T>
          </T>
          <TextInput
            accessibilityLabel={t("rejectSheet.reason")}
            multiline
            value={reason}
            onChangeText={setReason}
            placeholder={t("rejectSheet.placeholder")}
            placeholderTextColor={colors.mutedForeground}
            textAlignVertical="top"
            style={[
              styles.reason,
              {
                borderColor: reason.trim() ? colors.ring : colors.input,
                borderWidth: reason.trim() ? 2 : 1,
                backgroundColor: colors.card,
                color: colors.foreground,
                fontFamily: fonts.sans,
              },
            ]}
          />
        </View>
        <View style={styles.hint}>
          <Info size={18} color={colors.foreground} />
          <T size={15} style={{ flex: 1, lineHeight: 21 }}>
            {t("rejectSheet.hint")}
          </T>
        </View>
        <Button
          label={reject.isPending ? t("rejectSheet.sending") : t("rejectSheet.send")}
          variant={reason.trim() ? "primary" : "locked"}
          busy={reject.isPending}
          onPress={() =>
            reject.mutate(reason.trim(), {
              onSuccess: () => {
                setRejecting(false);
                onRejected(reason.trim());
              },
              onError: failedWith,
            })
          }
        />
        <Button label={t("rejectSheet.cancel")} variant="ghost" height={52} onPress={() => setRejecting(false)} />
      </Sheet>

      <Sheet visible={conflict} onClose={onTasks}>
        <View style={[styles.sheetIcon, { backgroundColor: colors.status.submitted.muted }]}>
          <Info size={26} color={colors.status.submitted.fg} />
        </View>
        <T family="serif" size={28}>
          {t("step.conflictTitle")}
        </T>
        <T size={16} style={{ lineHeight: 24 }}>
          {t("step.conflictBody")}
        </T>
        <View style={[styles.mono, { backgroundColor: colors.muted }]}>
          <T size={14} weight="semi">
            {t("step.serverAnswer")}
          </T>
          <T size={15} numberOfLines={1} style={{ fontFamily: fonts.monoMedium }}>
            {["HTTP 409", batch?.batchNo, step && t(`stepType.${step.stepType}`)].filter(Boolean).join(" · ")}
          </T>
        </View>
        <Button label={t("step.backToTasks")} onPress={onTasks} />
      </Sheet>
    </SafeAreaView>
  );
}

function Submitter({ step, now }: { step: ChainStep; now: Date }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const submission = step.submission;
  if (!submission) return null;
  const initials = submission.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toLocaleUpperCase(locale()))
    .join("");
  const at = new Date(submission.at);
  const sameDay = at.toDateString() === now.toDateString();
  const when = sameDay
    ? t("step.today", { time: formatWhen(submission.at, now, t("tasks.yesterday")) })
    : formatWhen(submission.at, now, t("tasks.yesterday"));
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: colors.silk }]}>
        <T size={15} weight="semi" style={{ color: "#3D3A35" }}>
          {initials}
        </T>
      </View>
      <T size={16} weight="medium" style={{ flex: 1 }}>
        {t("step.who", { name: submission.name, when })}
      </T>
      <Chip kind="submitted" small label={t("step.submitted")} />
    </View>
  );
}

function DataCard({ step }: { step: ChainStep }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rows = dataRows(step.data, t);
  if (rows.length === 0) return null;
  return (
    <Card>
      {rows.map((row, i) => (
        <View
          key={row.key}
          style={[styles.dataRow, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
        >
          <View style={styles.between}>
            <T size={15} tone="muted">
              {row.label}
            </T>
            <T size={16} weight="medium" family={row.mono ? "mono" : "sans"} style={{ flexShrink: 1, textAlign: "right" }}>
              {row.value}
            </T>
          </View>
          {row.shares && (
            <>
              <View style={styles.bar}>
                {row.shares.map((s) => (
                  <View key={s.label} style={{ flex: s.pct, backgroundColor: colors.status[s.kind].dot }} />
                ))}
              </View>
              <View style={styles.legend}>
                {row.shares.map((s) => (
                  <View key={s.label} style={styles.legendItem}>
                    <View style={[styles.swatch, { backgroundColor: colors.status[s.kind].dot }]} />
                    <T size={14}>{s.label}</T>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      ))}
    </Card>
  );
}

/** Design v0.9 104a: approved, and how far the batch got. */
export function StepApprovedScreen({
  step,
  batchNo,
  chain,
  onTasks,
}: {
  step: ChainStep;
  batchNo: string;
  chain: ChainResponse;
  onTasks: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const steps = [...chain.steps].sort((a, b) => a.sortOrder - b.sortOrder);
  const done = steps.filter((s) => s.status === "APPROVED").length;
  const left = steps.filter((s) => s.status !== "APPROVED").map((s) => t(`stepType.${s.stepType}`));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.result}>
        <View style={[styles.resultIcon, { backgroundColor: colors.status.approved.muted }]}>
          <Check size={36} color={colors.status.approved.fg} strokeWidth={2.3} />
        </View>
        <T family="serif" size={34} style={{ letterSpacing: -0.6 }} accessibilityRole="header">
          {t("approved.title")}
        </T>
        <T size={18} weight="medium">
          {stepTitle(t, step)}
        </T>
        <Card style={{ padding: 16, gap: 10 }}>
          <View style={styles.between}>
            <T size={16} weight="medium">
              {t("approved.progress", { done, total: steps.length })}
            </T>
            <T size={14} family="mono" weight="medium">
              {batchNo}
            </T>
          </View>
          <View style={styles.segments}>
            {steps.map((s) => (
              <View
                key={s.id}
                style={[styles.segment, { backgroundColor: s.status === "APPROVED" ? colors.status.approved.dot : colors.muted }]}
              />
            ))}
          </View>
          <View style={styles.segments}>
            {steps.map((s) => (
              <T key={s.id} size={13} weight={s.id === step.id ? "semi" : "regular"} style={{ flex: 1, textAlign: "center" }}>
                {t(`stepShort.${s.stepType}`)}
              </T>
            ))}
          </View>
          <T size={15} style={{ lineHeight: 22 }}>
            {left.length === 0 ? t("approved.allDone") : t("approved.remaining", { steps: left.join(", ") })}
          </T>
        </Card>
      </View>
      <BottomBar border={false}>
        <Button label={t("approved.back")} onPress={onTasks} />
      </BottomBar>
    </SafeAreaView>
  );
}

/**
 * Design v0.9 104d–104f: the correction is saved; a new link goes to the supplier, on WhatsApp straight to their
 * number when it is known, or through the phone's share sheet. The link is created here, once, and shown short.
 */
export function CorrectionSentScreen({
  step,
  batch,
  reason,
  onTasks,
  create = createDataRequest,
}: {
  step: ChainStep;
  batch: BatchResponse;
  reason: string;
  onTasks: () => void;
  create?: typeof createDataRequest;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const session = useSession();
  const user = session.status === "authenticated" ? session.user : undefined;
  const supplier = useSupplier(step.supplier?.id);
  const [link, setLink] = useState<CreatedDataRequest>();
  const [state, setState] = useState<"creating" | "ready" | "failed">("creating");

  // The state changes only when the server answers: the first state is already "creating".
  const request = () =>
    create(step.id).then(
      (created) => {
        setLink(created);
        setState("ready");
      },
      () => setState("failed"),
    );
  const make = () => {
    setState("creating");
    void request();
  };
  useEffect(() => {
    // One link when the screen opens; "Tekrar dene" makes it again.
    void request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const url = link ? `${WEB_URL.replace(/\/+$/, "")}/r#${link.token}` : undefined;
  const shown = url ? `${url.replace(/^https?:\/\//, "").split("#")[0]}#${link!.token.slice(0, 4)}…` : undefined;
  const phone = supplier.data?.phone;
  // The person the manufacturer talks to there (M10 T3), else whoever sent the data.
  const contactName = supplier.data?.contactName ?? undefined;
  const stepName = t(`stepType.${step.stepType}`);
  const message =
    link && url
      ? t(contactName ? "sent.messageNamed" : "sent.message", {
          contact: contactName,
          company: user?.company.name ?? "",
          batchNo: batch.batchNo,
          product: batch.product.name,
          step: locale().startsWith("de") ? stepName : stepName.toLocaleLowerCase(locale()),
          reason,
          deadline: new Intl.DateTimeFormat(locale(), { day: "numeric", month: "long" }).format(new Date(link.expiresAt)),
          url,
          name: user?.fullName ?? "",
        })
      : "";
  const contact = [contactName ?? step.submission?.name, step.supplier?.name].filter(Boolean).join(" · ");
  const rows: { k: string; v: string; mono?: boolean; spin?: boolean }[] = [
    { k: t("sent.to"), v: contact || t("sent.none") },
    { k: t("sent.phone"), v: phone ? formatPhone(phone) : t("sent.none"), mono: !!phone },
    {
      k: t("sent.link"),
      v: state === "creating" ? t("sent.creating") : shown ?? t("sent.none"),
      mono: state === "ready",
      spin: state === "creating",
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={[styles.result, { flexGrow: 1 }]}>
        <View style={[styles.resultIcon, { backgroundColor: colors.status.rejected.muted }]}>
          <RotateCcw size={36} color={colors.status.rejected.fg} strokeWidth={2.3} />
        </View>
        <T family="serif" size={34} style={{ letterSpacing: -0.6 }} accessibilityRole="header">
          {t("sent.title")}
        </T>
        <T size={18} weight="medium" style={{ lineHeight: 25 }}>
          {t("sent.sub")}
        </T>
        <Card>
          {rows.map((r, i) => (
            <View key={r.k} style={[styles.sentRow, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <T size={16} tone="muted">
                {r.k}
              </T>
              <View style={[styles.row, { flexShrink: 1, gap: 8 }]}>
                {r.spin && <ActivityIndicator size="small" color={colors.foreground} />}
                <T size={16} weight="medium" family={r.mono ? "mono" : "sans"} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {r.v}
                </T>
              </View>
            </View>
          ))}
        </Card>
        {state === "failed" ? (
          <Banner kind="rejected" icon={AlertTriangle} title={t("sent.failedTitle")} body={t("sent.failedBody")} />
        ) : (
          <View style={[styles.quote, { backgroundColor: colors.muted }]}>
            <T size={14} weight="semi">
              {t("sent.reason")}
            </T>
            <T size={15} style={{ lineHeight: 22 }}>{`“${reason}”`}</T>
          </View>
        )}
      </ScrollView>
      <BottomBar border={false}>
        {state === "failed" ? (
          <Button label={t("sent.retry")} variant="brand" icon={RefreshCw} onPress={make} />
        ) : (
          <>
            <Button
              label={t("sent.whatsapp")}
              icon={MessageCircle}
              disabled={state !== "ready"}
              onPress={() =>
                void Linking.openURL(`https://wa.me/${whatsAppNumber(phone) ?? ""}?text=${encodeURIComponent(message)}`)
              }
            />
            <Button
              label={t("sent.share")}
              variant="secondary"
              icon={Share2}
              height={52}
              disabled={state !== "ready"}
              onPress={() => void Share.share({ message })}
            />
          </>
        )}
        <Button label={t("sent.later")} variant="ghost" height={52} onPress={onTasks} />
      </BottomBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  dataRow: { gap: 6, paddingVertical: 8, paddingHorizontal: 14 },
  bar: { flexDirection: "row", height: 10, borderRadius: 999, overflow: "hidden", gap: 2 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  doc: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 7, paddingLeft: 14, paddingRight: 8 },
  error: { padding: 20, gap: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: { height: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  reason: { minHeight: 112, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, fontSize: 16, lineHeight: 23 },
  hint: { flexDirection: "row", gap: 8 },
  sheetIcon: { width: 52, height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  mono: { gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  result: { flex: 1, justifyContent: "center", gap: 16, paddingHorizontal: 24, paddingVertical: 24 },
  resultIcon: { width: 76, height: 76, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  segments: { flexDirection: "row", gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: 999 },
  sentRow: { minHeight: 50, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
  quote: { gap: 6, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14 },
});
