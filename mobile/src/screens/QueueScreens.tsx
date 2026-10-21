import { Check, ChevronLeft, Clock, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomBar, Button, Card, Chip, Sheet, Tag, T, TopBar } from "@/components/ui";
import { formatSize, formatWhen } from "@/lib/format";
import { type QueueItem, type QueueSnapshot } from "@/lib/upload-queue";
import { refusal } from "@/screens/capture/UploadScreen";
import type { StatusKind } from "@/theme/colors";
import { useTheme } from "@/theme/theme";

const bytesOf = (item: QueueItem) => item.pages.reduce((sum, p) => sum + p.bytes, 0);

/**
 * Design v0.9 107g–107i: the documents waiting on the phone, one by one: going up (with its share), waiting for a
 * connection or a pause, uploaded and being read, or refused (with the reason). A waiting or refused one can be tried
 * now or deleted (with a confirmation).
 */
export function QueueScreen({
  queue,
  onBack,
  onRetry,
  onRemove,
  now = new Date(),
}: {
  queue: QueueSnapshot;
  onBack: () => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  now?: Date;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [deleting, setDeleting] = useState<QueueItem>();
  const items = [...queue.items].reverse();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={t("queue.title")}
        backIcon={ChevronLeft}
        backLabel={t("common.back")}
        onBack={onBack}
        border
        right={
          items.length > 0 ? (
            <T size={15} weight="medium">
              {t("queue.count", { count: items.length })}
            </T>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyIcon, { backgroundColor: colors.status.approved.muted }]}>
            <Check size={30} color={colors.status.approved.fg} />
          </View>
          <T family="serif" size={28} style={{ textAlign: "center" }}>
            {t("queue.emptyTitle")}
          </T>
          <T size={16} style={{ textAlign: "center", lineHeight: 24 }}>
            {t("queue.emptyBody")}
          </T>
        </View>
      ) : (
        <>
          <View accessibilityRole="text" style={[styles.status, { backgroundColor: colors.muted }]}>
            {queue.online ? <Wifi size={18} color={colors.foreground} /> : <WifiOff size={18} color={colors.foreground} />}
            <T size={15}>{queue.online ? t("queue.online") : t("queue.offline")}</T>
          </View>
          <ScrollView contentContainerStyle={styles.list}>
            {items.map((item) => (
              <Row
                key={item.id}
                item={item}
                online={queue.online}
                now={now}
                onRetry={() => onRetry(item.id)}
                onRemove={() => setDeleting(item)}
              />
            ))}
          </ScrollView>
        </>
      )}

      <Sheet visible={!!deleting} onClose={() => setDeleting(undefined)}>
        <T family="serif" size={28}>
          {t("queue.deleteTitle")}
        </T>
        {deleting && (
          <T size={16} style={{ lineHeight: 24 }}>
            {t("queue.deleteBody", {
              type: t(`docType.${deleting.docType ?? "UNKNOWN"}`),
              count: deleting.pages.length,
            })}
          </T>
        )}
        <Button
          label={t("queue.deleteConfirm")}
          variant="destructive"
          onPress={() => {
            if (deleting) onRemove(deleting.id);
            setDeleting(undefined);
          }}
        />
        <Button label={t("queue.cancel")} variant="secondary" height={52} onPress={() => setDeleting(undefined)} />
      </Sheet>
    </SafeAreaView>
  );
}

function Row({
  item,
  online,
  now,
  onRetry,
  onRemove,
}: {
  item: QueueItem;
  online: boolean;
  now: Date;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const pct = Math.round(item.progress * 100);
  const chip: { kind: StatusKind; label: string } =
    item.status === "uploading"
      ? { kind: "submitted", label: t("queue.uploading", { pct }) }
      : item.status === "uploaded"
        ? { kind: "approved", label: t("queue.uploaded") }
        : item.status === "failed"
          ? { kind: "rejected", label: t("queue.failed") }
          : { kind: "pending", label: online ? t("queue.waiting") : t("queue.waitingOffline") };
  const actions = item.status === "waiting" || item.status === "failed";
  return (
    <Card style={styles.item}>
      <View style={styles.itemTop}>
        <View style={[styles.thumb, { borderColor: colors.border }]}>
          {item.status !== "uploaded" && item.pages[0] && (
            <Image source={{ uri: item.pages[0].uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
          )}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.headLine}>
            <Tag label={t(`docType.${item.docType ?? "UNKNOWN"}`)} />
            <T size={14} family="mono" weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
              {item.batchNo}
            </T>
            <T size={14} tone="muted" style={{ marginLeft: "auto" }}>
              {formatWhen(item.createdAt, now, t("tasks.yesterday"))}
            </T>
          </View>
          <T size={15}>
            {t("queue.line", {
              step: t(`stepType.${item.stepType}`),
              pages: t("queue.pages", { count: item.pages.length }),
              size: formatSize(bytesOf(item)),
            })}
          </T>
          <View style={{ alignSelf: "flex-start" }}>
            <Chip kind={chip.kind} small label={chip.label} />
          </View>
        </View>
      </View>
      {item.status === "uploading" && (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: pct }}
          style={[styles.track, { backgroundColor: colors.muted }]}
        >
          <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.foreground, borderRadius: 999 }} />
        </View>
      )}
      {item.status === "failed" && item.refusal && (
        <T size={15} weight="medium" style={{ color: colors.status.rejected.fg, lineHeight: 21 }}>
          {refusal(t, item.refusal)}
        </T>
      )}
      {actions && (
        <View style={styles.actions}>
          {item.status === "waiting" && (
            <Pressable
              accessibilityRole="button"
              onPress={onRetry}
              style={[styles.action, { borderColor: colors.input, backgroundColor: colors.card }]}
            >
              <RefreshCw size={18} color={colors.foreground} />
              <T size={15} weight="semi">
                {t("queue.retryNow")}
              </T>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={onRemove}
            style={[styles.action, { borderColor: colors.input, backgroundColor: colors.card }]}
          >
            <Trash2 size={18} color={colors.destructive} />
            <T size={15} weight="semi" style={{ color: colors.destructive }}>
              {t("queue.remove")}
            </T>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

/** Design v0.9 107b: the document waits on the phone; how many wait with it. */
export function QueuedScreen({
  item,
  waiting,
  onTasks,
  onAnother,
}: {
  item: QueueItem;
  waiting: number;
  onTasks: () => void;
  onAnother: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rows = [
    { k: t("queued.doc"), v: t("queued.docValue", { type: t(`docType.${item.docType ?? "UNKNOWN"}`), count: item.pages.length }) },
    { k: t("queued.batch"), v: item.batchNo, mono: true },
    { k: t("queued.step"), v: [t(`stepType.${item.stepType}`), item.supplierName].filter(Boolean).join(" · ") },
    { k: t("queued.inQueue"), v: t("queue.count", { count: waiting }) },
  ];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.result}>
        <View style={[styles.resultIcon, { backgroundColor: colors.status.submitted.muted }]}>
          <Clock size={36} color={colors.status.submitted.fg} strokeWidth={2.3} />
        </View>
        <T family="serif" size={34} style={{ letterSpacing: -0.6 }} accessibilityRole="header">
          {t("queued.title")}
        </T>
        <T size={18} weight="medium" style={{ lineHeight: 25 }}>
          {t("queued.sub")}
        </T>
        <Card>
          {rows.map((r, i) => (
            <View key={r.k} style={[styles.row, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
              <T size={16} tone="muted">
                {r.k}
              </T>
              <T size={16} weight="medium" family={r.mono ? "mono" : "sans"} numberOfLines={1} style={{ flexShrink: 1, textAlign: "right" }}>
                {r.v}
              </T>
            </View>
          ))}
        </Card>
      </View>
      <BottomBar border={false}>
        <Button label={t("queued.back")} onPress={onTasks} />
        <Button label={t("queued.another")} variant="secondary" height={52} onPress={onAnother} />
      </BottomBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyIcon: { width: 64, height: 64, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  status: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 20 },
  list: { gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  item: { gap: 10, padding: 12 },
  itemTop: { flexDirection: "row", gap: 12 },
  thumb: { width: 44, height: 58, borderRadius: 6, borderWidth: 1, backgroundColor: "#E9E4DA", overflow: "hidden" },
  headLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  track: { height: 6, borderRadius: 999, overflow: "hidden" },
  actions: { flexDirection: "row", gap: 8 },
  action: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  result: { flex: 1, justifyContent: "center", gap: 16, paddingHorizontal: 24 },
  resultIcon: { width: 76, height: 76, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  row: { minHeight: 50, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16 },
});
