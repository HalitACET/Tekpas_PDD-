import { AlertTriangle, Camera, ChevronLeft, ChevronRight, Globe, RefreshCw } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomBar, Button, Card, Chip, Skeleton, T, TopBar } from "@/components/ui";
import { ApiError, type BatchResponse, type ChainStep, useBatch, useBatchScore, useChain } from "@/lib/queries";
import { useSession } from "@/lib/use-session";
import type { StatusKind } from "@/theme/colors";
import { useTheme } from "@/theme/theme";

const BATCH_KIND: Record<BatchResponse["status"], StatusKind> = {
  DRAFT: "pending",
  COLLECTING: "submitted",
  READY: "approved",
  PUBLISHED: "pending",
};
const STEP_KIND: Record<ChainStep["status"], StatusKind> = {
  PENDING: "pending",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
};

/**
 * Design v0.9 102a–102d: a batch at a glance (from a scanned code or a notification): its score against the publishing
 * threshold, its open alerts and its steps; a submitted step leads to its review. Read-only; the chain is edited on
 * the web.
 */
export function BatchScreen({
  id,
  onBack,
  onReview,
  onShoot,
  onOpenPassport,
}: {
  id: string;
  onBack: () => void;
  onReview: (step: ChainStep, batch: BatchResponse) => void;
  onShoot: (batch: BatchResponse) => void;
  onOpenPassport: (batch: BatchResponse) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const session = useSession();
  const viewer = session.status === "authenticated" && session.user.role === "VIEWER";
  const batch = useBatch(id);
  const score = useBatchScore(id);
  const chain = useChain(id);
  const all = [batch, score, chain];
  const failed = all.find((q) => q.isError);
  const ready = batch.data && score.data && chain.data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t("batch.title")} backIcon={ChevronLeft} backLabel={t("common.back")} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.page}>
        {ready ? (
          <Summary
            batch={batch.data}
            score={score.data.score}
            threshold={score.data.threshold}
            steps={[...chain.data.steps].sort((a, b) => a.sortOrder - b.sortOrder)}
            onReview={(step) => onReview(step, batch.data)}
          />
        ) : failed ? (
          <Card style={styles.error}>
            <View accessibilityRole="alert" style={styles.row}>
              <AlertTriangle size={22} color={colors.status.rejected.fg} />
              <T size={17} weight="semi" style={{ color: colors.status.rejected.fg }}>
                {t("batch.loadError")}
              </T>
            </View>
            <T size={16} style={{ lineHeight: 24 }}>
              {t("batch.loadErrorBody")}
            </T>
            {failed.error instanceof ApiError && (
              <T size={14} family="mono" tone="muted">
                {t("errors.meta", { status: failed.error.status })}
              </T>
            )}
            <Button
              label={t("common.retry")}
              variant="brand"
              icon={RefreshCw}
              onPress={() => all.forEach((q) => void q.refetch())}
            />
          </Card>
        ) : (
          <View accessibilityLabel={t("common.loading")} style={{ gap: 12 }}>
            <Skeleton width={150} height={16} />
            <Skeleton width={230} height={28} radius={6} />
            <Skeleton width={120} height={26} radius={999} />
            <View style={styles.grid}>
              <View style={{ flex: 1 }}>
                <Skeleton width="100%" height={96} radius={14} />
              </View>
              <View style={{ flex: 1 }}>
                <Skeleton width="100%" height={96} radius={14} />
              </View>
            </View>
            {[0, 1, 2, 3, 4].map((k) => (
              <Card key={k} style={styles.skeletonStep}>
                <Skeleton width={32} height={32} radius={999} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Skeleton width="40%" height={14} />
                  <Skeleton width="65%" height={12} />
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>
      {batch.data && (
        <BottomBar>
          {batch.data.status === "PUBLISHED" ? (
            <Button
              label={t("batch.openPassport")}
              variant="secondary"
              icon={Globe}
              height={52}
              onPress={() => onOpenPassport(batch.data)}
            />
          ) : (
            !viewer && (
              <Button
                label={t("batch.shoot")}
                variant="secondary"
                icon={Camera}
                height={52}
                onPress={() => onShoot(batch.data)}
              />
            )
          )}
          <T size={15} style={{ textAlign: "center", lineHeight: 21 }}>
            {batch.data.status === "PUBLISHED" ? t("batch.publishedNote") : t("batch.webNote")}
          </T>
        </BottomBar>
      )}
    </SafeAreaView>
  );
}

function Summary({
  batch,
  score,
  threshold,
  steps,
  onReview,
}: {
  batch: BatchResponse;
  score: number;
  threshold: number;
  steps: ChainStep[];
  onReview: (step: ChainStep) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const issues = batch.openIssues;
  const open = issues.errors + issues.warnings + issues.infos;
  return (
    <>
      <View style={{ gap: 6 }}>
        <T size={15} family="mono" weight="semi">
          {batch.batchNo}
        </T>
        <T family="serif" size={26} style={{ letterSpacing: -0.5 }} accessibilityRole="header">
          {batch.product.name}
        </T>
        <View style={{ alignSelf: "flex-start", marginTop: 4 }}>
          <Chip kind={BATCH_KIND[batch.status]} label={t(`batchStatusChip.${batch.status}`)} />
        </View>
      </View>
      <View style={styles.grid}>
        <Card style={styles.tile}>
          <T size={14} weight="medium">
            {t("batch.score")}
          </T>
          <View style={styles.baseline}>
            <T size={24} family="mono" weight="medium" style={{ letterSpacing: -0.7 }}>
              {String(score)}
            </T>
            <T size={15}>{t("batch.threshold", { n: threshold })}</T>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: score }}
            style={[styles.track, { backgroundColor: colors.muted }]}
          >
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.min(100, Math.max(0, score))}%`,
                  backgroundColor: score >= threshold ? colors.status.approved.dot : colors.status.lowConfidence.dot,
                },
              ]}
            />
            <View style={[styles.marker, { left: `${threshold}%`, backgroundColor: colors.foreground }]} />
          </View>
        </Card>
        <Card style={styles.tile}>
          <T size={14} weight="medium">
            {t("batch.alerts")}
          </T>
          <T size={24} family="mono" weight="medium" style={{ letterSpacing: -0.7 }}>
            {String(open)}
          </T>
          <View style={{ alignSelf: "flex-start" }}>
            {issues.errors > 0 ? (
              <Chip kind="rejected" small label={t("batch.blockers", { count: issues.errors })} />
            ) : (
              <Chip kind="approved" small label={t("batch.noBlockers")} />
            )}
          </View>
        </Card>
      </View>
      <View style={{ gap: 8 }}>
        <View style={styles.chainHead}>
          <T size={17} weight="semi">
            {t("batch.chain")}
          </T>
          <T size={14} family="mono" weight="medium">
            {t("batch.progress", { done: batch.chain.approvedSteps, total: batch.chain.totalSteps })}
          </T>
        </View>
        {steps.map((step, i) => {
          const submitted = step.status === "SUBMITTED";
          return (
            <View
              key={step.id}
              style={[
                styles.step,
                {
                  backgroundColor: colors.card,
                  borderColor: submitted ? colors.status.submitted.dot : colors.border,
                  borderWidth: submitted ? 2 : 1,
                },
              ]}
            >
              <View style={styles.row}>
                <View style={[styles.number, { backgroundColor: colors.muted }]}>
                  <T size={13} family="mono" weight="semi">
                    {String(i + 1)}
                  </T>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <T size={17} weight="medium">
                    {t(`stepType.${step.stepType}`)}
                  </T>
                  <T size={14} tone="muted" numberOfLines={1}>
                    {`${step.supplier?.name ?? t("batch.noSupplier")} · ${
                      step.documentCount > 0 ? t("batch.docs", { count: step.documentCount }) : t("batch.noDocs")
                    }`}
                  </T>
                </View>
                <Chip kind={STEP_KIND[step.status]} small label={t(`stepStatus.${step.status}`)} />
              </View>
              {submitted && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${t("batch.review")} · ${t(`stepType.${step.stepType}`)}`}
                  onPress={() => onReview(step)}
                  style={[styles.review, { backgroundColor: colors.primary }]}
                >
                  <T size={16} weight="semi" style={{ color: colors.primaryForeground }}>
                    {t("batch.review")}
                  </T>
                  <ChevronRight size={18} color={colors.primaryForeground} strokeWidth={2.2} />
                </Pressable>
              )}
            </View>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  grid: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, gap: 6, paddingVertical: 10, paddingHorizontal: 12 },
  baseline: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  track: { height: 6, borderRadius: 999, marginTop: 4 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 999 },
  marker: { position: "absolute", top: -4, width: 2, height: 14 },
  chainHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4 },
  step: { gap: 10, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  number: { width: 30, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  review: { height: 44, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  error: { padding: 20, gap: 14 },
  skeletonStep: { height: 72, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16 },
});
