import { AlertTriangle, ChevronLeft, ChevronRight, Lock, Search, X } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, Card, Chip, Skeleton, T, TopBar } from "@/components/ui";
import type { CaptureBatch, CaptureStep } from "@/lib/capture";
import { type BatchResponse, useBatches, useChain } from "@/lib/queries";
import type { StatusKind } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { useTheme } from "@/theme/theme";

const STATUS_KIND: Record<BatchResponse["status"], StatusKind> = {
  DRAFT: "pending",
  COLLECTING: "submitted",
  READY: "approved",
  PUBLISHED: "pending",
};
/** Batches still collecting data come first, then the ready ones (design v0.8 93a); a published one is locked. */
const ORDER: Record<BatchResponse["status"], number> = { COLLECTING: 0, READY: 1, DRAFT: 2, PUBLISHED: 3 };

/** Design v0.8 93a–93b: the recent batches, searched by batch number and product. */
export function BatchPickScreen({ onClose, onPick }: { onClose: () => void; onPick: (batch: CaptureBatch) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const batches = useBatches(q.trim());
  const rows = [...(batches.data?.content ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={t("pick.batchTitle")}
        backIcon={X}
        backLabel={t("common.close")}
        onBack={onClose}
        right={<T family="mono" weight="medium" size={14} tone="muted">1/2</T>}
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
        <View
          style={[
            styles.search,
            { borderColor: focused ? colors.ring : colors.input, borderWidth: focused ? 2 : 1, backgroundColor: colors.card },
          ]}
        >
          <Search size={20} color={colors.mutedForeground} />
          <TextInput
            accessibilityLabel={t("pick.search")}
            placeholder={t("pick.search")}
            placeholderTextColor={colors.mutedForeground}
            value={q}
            onChangeText={setQ}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoCapitalize="characters"
            style={[styles.searchInput, { color: colors.foreground }]}
          />
        </View>
      </View>
      {batches.isPending ? (
        <View style={styles.list}>
          {[0, 1, 2].map((k) => (
            <Card key={k} style={styles.skeleton}>
              <Skeleton width="50%" height={15} />
              <Skeleton width="70%" height={17} />
              <Skeleton width="100%" height={6} radius={999} />
            </Card>
          ))}
        </View>
      ) : batches.isError ? (
        <View style={styles.list}>
          <Banner kind="rejected" icon={AlertTriangle} title={t("pick.loadError")} body={t("errors.network")} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <T size={15} weight="semi" tone="muted" style={{ paddingHorizontal: 4 }}>
              {q.trim() ? t("pick.results", { count: rows.length }) : t("pick.recent")}
            </T>
          }
          ListEmptyComponent={<T size={16} tone="muted">{t("pick.none")}</T>}
          renderItem={({ item: b }) => {
            const locked = b.status === "PUBLISHED";
            const total = b.chain.totalSteps;
            const done = b.chain.approvedSteps;
            const kind = STATUS_KIND[b.status];
            return (
              <Card
                disabled={locked}
                onPress={() => onPick({ id: b.id, batchNo: b.batchNo, productName: b.product.name })}
                accessibilityLabel={`${b.batchNo} ${b.product.name}`}
                style={[styles.batch, locked && { backgroundColor: colors.muted, opacity: 0.85 }]}
              >
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={styles.rowTop}>
                    <T family="mono" weight="semi" size={15}>
                      {b.batchNo}
                    </T>
                    <View style={{ marginLeft: "auto" }}>
                      <Chip small kind={kind} label={t(`batchStatus.${b.status}`)} />
                    </View>
                  </View>
                  <T size={17} weight="medium">
                    {b.product.name}
                  </T>
                  <View style={styles.rowTop}>
                    <View style={[styles.track, { backgroundColor: colors.muted }]}>
                      <View
                        style={{
                          height: "100%",
                          width: `${total ? Math.round((done / total) * 100) : 0}%`,
                          backgroundColor: colors.status[kind].dot,
                          borderRadius: 999,
                        }}
                      />
                    </View>
                    <T family="mono" weight="medium" size={14} tone="muted">
                      {t("pick.progress", { done, total })}
                    </T>
                  </View>
                  {locked && <T size={14}>{t("pick.publishedNote")}</T>}
                </View>
                {locked ? <Lock size={22} color={colors.mutedForeground} /> : <ChevronRight size={22} color={colors.mutedForeground} />}
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

/** Design v0.8 94: the batch's steps with their supplier and how many documents they hold; none is orange. */
export function StepPickScreen({
  batch,
  onBack,
  onPick,
}: {
  batch: CaptureBatch;
  onBack: () => void;
  onPick: (step: CaptureStep) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const chain = useChain(batch.id);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={t("pick.stepTitle")}
        backIcon={ChevronLeft}
        backLabel={t("common.back")}
        onBack={onBack}
        right={<T family="mono" weight="medium" size={14} tone="muted">2/2</T>}
      />
      <View style={[styles.batchBox, { backgroundColor: colors.muted }]}>
        <T family="mono" weight="semi" size={15}>
          {batch.batchNo}
        </T>
        <T size={16}>{batch.productName}</T>
      </View>
      {chain.isPending ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((k) => (
            <Card key={k} style={styles.skeletonStep}>
              <Skeleton width="60%" height={17} />
              <Skeleton width="40%" height={15} />
            </Card>
          ))}
        </View>
      ) : chain.isError ? (
        <View style={styles.list}>
          <Banner kind="rejected" icon={AlertTriangle} title={t("pick.stepsError")} body={t("errors.network")} />
        </View>
      ) : (
        <FlatList
          data={chain.data!.steps}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <T size={15} weight="semi" tone="muted" style={{ paddingHorizontal: 4 }}>
              {t("pick.stepQuestion")}
            </T>
          }
          renderItem={({ item: s, index }) => {
            const none = s.documentCount === 0;
            return (
              <Card
                onPress={() => onPick({ id: s.id, stepType: s.stepType, supplierName: s.supplier?.name })}
                accessibilityLabel={`${t(`stepType.${s.stepType}`)} ${s.supplier?.name ?? ""}`}
                style={styles.step}
              >
                <View style={[styles.num, { backgroundColor: colors.muted }]}>
                  <T family="mono" weight="semi" size={14}>
                    {String(index + 1)}
                  </T>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <T size={17} weight="medium">
                    {t(`stepType.${s.stepType}`)}
                  </T>
                  <T size={15} tone="muted">
                    {s.supplier?.name ?? t("pick.noSupplier")}
                  </T>
                </View>
                <View style={[styles.docs, { backgroundColor: none ? colors.status.expiring.muted : colors.muted }]}>
                  <T size={14} weight="medium" style={{ color: none ? colors.status.expiring.fg : colors.foreground }}>
                    {none ? t("pick.noDocs") : t("pick.docs", { count: s.documentCount })}
                  </T>
                </View>
                <ChevronRight size={22} color={colors.mutedForeground} />
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  search: { height: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, borderRadius: 12 },
  searchInput: { flex: 1, fontSize: 17, fontFamily: fonts.sans, height: "100%" },
  list: { gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  skeleton: { height: 92, padding: 16, gap: 10 },
  skeletonStep: { height: 76, padding: 16, gap: 8 },
  batch: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingLeft: 16, paddingRight: 8 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  track: { flex: 1, height: 6, borderRadius: 999, overflow: "hidden" },
  batchBox: { marginHorizontal: 16, marginTop: 4, marginBottom: 16, padding: 14, paddingHorizontal: 16, borderRadius: 14, gap: 4 },
  step: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 12, paddingLeft: 16, paddingRight: 8 },
  num: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  docs: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
