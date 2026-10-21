import { AlertTriangle, Camera, ChevronRight, Clock, Lock, RefreshCw, Upload, WifiOff, CheckCircle2 } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomBar, Button, Card, Chip, Count, Heading, Skeleton, T, Tag } from "@/components/ui";
import { formatToday, formatWhen } from "@/lib/format";
import { ApiError, useAwaitingDocuments, useExpiringCertificates, useTasks } from "@/lib/queries";
import { certificateTasks, readingChip } from "@/lib/tasks";
import { useSession } from "@/lib/use-session";
import { useUploadQueue } from "@/lib/use-upload-queue";
import { useTheme } from "@/theme/theme";

/** The open tasks of the task list, the tab badge counts the same. */
export function useTaskTotal(): number | undefined {
  const session = useSession();
  const enabled = session.status === "authenticated";
  const docs = useAwaitingDocuments(enabled);
  const tasks = useTasks(enabled);
  const certs = useExpiringCertificates(enabled);
  if (!docs.data || !tasks.data || !certs.data) return undefined;
  return docs.data.length + submitted(tasks.data.review).length + certificateTasks(certs.data).length;
}

function submitted<T extends { kind: string }>(items: T[]): T[] {
  return items.filter((i) => i.kind === "STEP_SUBMITTED");
}

/**
 * Design v0.8 92a–92g and v0.9 105a: the data suppliers sent (a tap opens its review), the documents waiting for a
 * person (a tap opens the form), the certificates running out, and "Belge çek" at the bottom (closed for a viewer).
 */
export function TasksScreen({
  onOpenDocument,
  onOpenStep,
  onShoot,
  onOpenQueue = () => undefined,
  now = new Date(),
}: {
  onOpenDocument: (id: string) => void;
  onOpenStep: (stepId: string, batchId: string) => void;
  onShoot: () => void;
  onOpenQueue?: () => void;
  now?: Date;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const session = useSession();
  const user = session.status === "authenticated" ? session.user : undefined;
  const reviewer = user?.role === "OWNER" || user?.role === "ADMIN";
  const viewer = user?.role === "VIEWER";
  const docs = useAwaitingDocuments(!!user);
  const tasks = useTasks(!!user);
  const certs = useExpiringCertificates(!!user);
  const [refreshing, setRefreshing] = useState(false);

  const all = [docs, tasks, certs];
  const loading = all.some((q) => q.isPending);
  const failed = all.find((q) => q.isError);
  const haveData = !!docs.data && !!tasks.data && !!certs.data;
  const data = submitted(tasks.data?.review ?? []);
  const certRows = certificateTasks(certs.data);
  const total = (docs.data?.length ?? 0) + data.length + certRows.length;
  const today = formatToday(now);
  const updated = Math.max(...all.map((q) => q.dataUpdatedAt || 0));

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all(all.map((q) => q.refetch()));
    setRefreshing(false);
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.header}>
        <View style={{ gap: 4, flex: 1 }}>
          <Heading>{t("tasks.title")}</Heading>
          <T size={15} tone="muted">
            {loading || (failed && !haveData)
              ? today
              : total === 0
                ? t("tasks.subEmpty", { date: today })
                : t("tasks.subCount", { date: today, count: total })}
          </T>
        </View>
        {user && (
          <T size={14} tone="muted" numberOfLines={1} style={{ maxWidth: 140, paddingBottom: 2 }}>
            {user.company.name}
          </T>
        )}
      </View>

      <QueueStrip onOpen={onOpenQueue} />

      {failed && haveData && (
        <View accessibilityRole="alert" style={[styles.offline, { backgroundColor: colors.primary }]}>
          <WifiOff size={18} color={colors.primaryForeground} />
          <T size={15} style={{ color: colors.primaryForeground, flex: 1 }}>
            {t("tasks.offline", { time: formatWhen(new Date(updated).toISOString(), now, t("tasks.yesterday")) })}
          </T>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.foreground} title={t("tasks.refreshing")} />}
      >
        {loading ? (
          <View accessibilityLabel={t("common.loading")} style={{ gap: 12 }}>
            <Skeleton width={200} height={18} radius={6} />
            {[0, 1, 2, 3].map((k) => (
              <Card key={k} style={styles.skeletonCard}>
                <Skeleton width="45%" height={14} />
                <Skeleton width="80%" height={18} />
                <Skeleton width="35%" height={22} radius={999} />
              </Card>
            ))}
          </View>
        ) : failed && !haveData ? (
          <ErrorCard error={failed.error} onRetry={() => void refresh()} />
        ) : total === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.status.approved.muted }]}>
              <CheckCircle2 size={30} color={colors.status.approved.fg} />
            </View>
            <T family="serif" size={28}>
              {t("tasks.emptyTitle")}
            </T>
            <T size={16} tone="muted" style={{ textAlign: "center" }}>
              {t("tasks.emptyBody")}
            </T>
          </View>
        ) : (
          <>
            {data.length > 0 && (
              <Group title={t("tasks.data")} count={data.length} brand>
                {data.map((d) => (
                  <Card
                    key={`${d.kind}-${d.stepId}`}
                    onPress={d.stepId ? () => onOpenStep(d.stepId!, d.batchId) : undefined}
                    accessibilityLabel={`${d.batchNo} ${d.stepType ? t(`stepType.${d.stepType}`) : d.productName}`}
                    style={styles.dataRow}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={styles.rowTop}>
                        <T family="mono" weight="medium" size={14} tone="muted">
                          {d.batchNo}
                        </T>
                        {d.at && (
                          <T size={14} tone="muted" style={{ marginLeft: "auto" }}>
                            {formatWhen(d.at, now, t("tasks.yesterday"))}
                          </T>
                        )}
                      </View>
                      <T size={17} weight="medium">
                        {d.supplierName && d.stepType
                          ? t("tasks.stepLine", { step: t(`stepType.${d.stepType}`), supplier: d.supplierName })
                          : d.productName}
                      </T>
                    </View>
                    <ChevronRight size={22} color={colors.mutedForeground} style={{ width: 32 }} />
                  </Card>
                ))}
              </Group>
            )}
            {docs.data!.length > 0 && (
              <Group title={reviewer ? t("tasks.docsMine") : t("tasks.docsOthers")} count={docs.data!.length}>
                {docs.data!.map((d) => {
                  const chip = readingChip(d);
                  return (
                    <Card
                      key={d.id}
                      onPress={() => onOpenDocument(d.id)}
                      accessibilityLabel={`${t(`docType.${d.docType}`)} ${d.batchNo}`}
                      style={styles.docRow}
                    >
                      <View style={{ flex: 1, gap: 6 }}>
                        <View style={styles.rowTop}>
                          <Tag label={t(`docType.${d.docType}`)} />
                          <T family="mono" weight="medium" size={14} tone="muted">
                            {d.batchNo}
                          </T>
                          <T size={14} tone="muted" style={{ marginLeft: "auto" }}>
                            {formatWhen(d.createdAt, now, t("tasks.yesterday"))}
                          </T>
                        </View>
                        <T size={17} weight="medium">
                          {d.supplierName ? t("tasks.stepLine", { step: t(`stepType.${d.stepType}`), supplier: d.supplierName }) : t(`stepType.${d.stepType}`)}
                        </T>
                        <Chip kind={chip.kind} label={t(chip.key, { count: chip.count })} />
                      </View>
                      <ChevronRight size={22} color={colors.mutedForeground} style={{ width: 32 }} />
                    </Card>
                  );
                })}
              </Group>
            )}
            {certRows.length > 0 && (
              <Group title={t("tasks.certs")} count={certRows.length}>
                {certRows.map((c) => (
                  <Card key={c.key} style={styles.certRow}>
                    <View style={styles.rowTop}>
                      <Tag label={t(`docType.${c.docType}`)} />
                      <T size={17} weight="medium" style={{ flex: 1 }} numberOfLines={1}>
                        {c.supplierName ?? ""}
                      </T>
                    </View>
                    <Chip
                      kind={c.daysLeft < 0 ? "rejected" : "expiring"}
                      label={c.daysLeft < 0 ? t("tasks.certExpired") : c.daysLeft === 0 ? t("tasks.certToday") : t("tasks.certDays", { count: c.daysLeft })}
                    />
                  </Card>
                ))}
              </Group>
            )}
          </>
        )}
      </ScrollView>

      <BottomBar>
        {viewer ? (
          <>
            <Button label={t("tasks.shoot")} variant="locked" icon={Lock} />
            <T size={15} style={{ textAlign: "center" }}>
              {t("tasks.viewerNote")}
            </T>
          </>
        ) : (
          <Button label={t("tasks.shoot")} variant="brand" icon={Camera} onPress={onShoot} />
        )}
      </BottomBar>
    </SafeAreaView>
  );
}

/**
 * Design v0.9 107d–107f: what the upload queue is doing, one line: an upload going up (with its share), refused ones,
 * or the ones waiting (for a connection when there is none). A tap opens the queue.
 */
function QueueStrip({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const queue = useUploadQueue();
  const uploading = queue.items.find((i) => i.status === "uploading");
  const refused = queue.items.filter((i) => i.status === "failed").length;
  const waiting = queue.items.filter((i) => i.status === "waiting").length;
  const pct = uploading ? Math.round(uploading.progress * 100) : 0;
  const strip = uploading
    ? { bg: colors.muted, fg: colors.foreground, Icon: Upload, text: t("queue.stripUploading", { count: 1, pct }) }
    : refused > 0
      ? { bg: colors.status.rejected.muted, fg: colors.status.rejected.fg, Icon: AlertTriangle, text: t("queue.stripFailed", { count: refused }) }
      : waiting > 0
        ? {
            bg: colors.primary,
            fg: colors.primaryForeground,
            Icon: queue.online ? Clock : WifiOff,
            text: queue.online ? t("queue.stripWaiting", { count: waiting }) : t("queue.stripWaitingOffline", { count: waiting }),
          }
        : undefined;
  if (!strip) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${strip.text}. ${t("queue.open")}`}
      onPress={onOpen}
      style={[styles.queue, { backgroundColor: strip.bg }]}
    >
      <View style={styles.rowTop}>
        <strip.Icon size={20} color={strip.fg} />
        <T size={15} weight="semi" style={{ flex: 1, color: strip.fg, lineHeight: 20 }}>
          {strip.text}
        </T>
        <ChevronRight size={20} color={strip.fg} style={{ width: 32 }} />
      </View>
      {uploading && (
        <View style={[styles.queueTrack, { backgroundColor: colors.card }]}>
          <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.foreground, borderRadius: 999 }} />
        </View>
      )}
    </Pressable>
  );
}

function Group({ title, count, brand = false, children }: { title: string; count: number; brand?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }} accessibilityRole="list" accessibilityLabel={title}>
      <View style={styles.groupHead}>
        <T size={17} weight="semi" accessibilityRole="header">
          {title}
        </T>
        <Count value={count} brand={brand} />
      </View>
      {children}
    </View>
  );
}

function ErrorCard({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const api = error instanceof ApiError ? error : undefined;
  return (
    <Card style={styles.errorCard}>
      <View accessibilityRole="alert" style={styles.rowTop}>
        <AlertTriangle size={22} color={colors.status.rejected.fg} />
        <T size={17} weight="semi" style={{ color: colors.status.rejected.fg }}>
          {t("tasks.errorTitle")}
        </T>
      </View>
      <T size={16}>{api ? t("tasks.errorBody") : t("errors.network")}</T>
      {api && (
        <T size={14} family="mono" tone="muted">
          {api.requestId ? t("errors.metaWithId", { status: api.status, id: api.requestId }) : t("errors.meta", { status: api.status })}
        </T>
      )}
      <Button label={t("common.retry")} variant="secondary" icon={RefreshCw} height={52} onPress={onRetry} />
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-end", gap: 12, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  offline: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 20 },
  list: { flexGrow: 1, gap: 24, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  skeletonCard: { height: 104, padding: 16, gap: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 48 },
  emptyIcon: { width: 64, height: 64, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  groupHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  docRow: { minHeight: 96, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingLeft: 16, paddingRight: 8 },
  dataRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: 8 },
  certRow: { minHeight: 88, justifyContent: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 16 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  errorCard: { padding: 20, gap: 14 },
  queue: { minHeight: 56, marginHorizontal: 16, marginBottom: 10, justifyContent: "center", gap: 8, paddingVertical: 10, paddingLeft: 14, paddingRight: 8, borderRadius: 12 },
  queueTrack: { height: 6, marginRight: 6, borderRadius: 999, overflow: "hidden" },
});
