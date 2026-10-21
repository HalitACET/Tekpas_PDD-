import { Check } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomBar, Button, Heading, T } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useTheme } from "@/theme/theme";
import type { Approved } from "./DocumentFormScreen";

/** Design v0.8 99e: "Belge onaylandı · GOTS · Ege İplik", what was confirmed, and the way back or to the next one. */
export function SuccessScreen({ approved, onTasks, onAnother }: { approved: Approved; onTasks: () => void; onAnother: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rows = [
    approved.certNo && { k: t("success.certNo"), v: approved.certNo, mono: true },
    approved.batchNo && { k: t("success.batch"), v: approved.batchNo, mono: true },
    approved.validUntil && { k: t("success.validity"), v: t("success.validUntil", { date: formatDate(approved.validUntil) }), mono: false },
  ].filter(Boolean) as { k: string; v: string; mono: boolean }[];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={styles.page}>
        <View style={[styles.icon, { backgroundColor: colors.status.approved.muted }]}>
          <Check size={38} color={colors.status.approved.fg} strokeWidth={2.4} />
        </View>
        <Heading>{t("success.title")}</Heading>
        <T size={18} weight="medium">
          {[t(`docType.${approved.docType}`), approved.supplierName].filter(Boolean).join(" · ")}
        </T>
        {rows.length > 0 && (
          <View style={[styles.table, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {rows.map((r, i) => (
              <View key={r.k} style={[styles.row, i < rows.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
                <T size={16} tone="muted">
                  {r.k}
                </T>
                <T size={16} weight="medium" family={r.mono ? "mono" : "sans"} style={{ textAlign: "right", flexShrink: 1 }}>
                  {r.v}
                </T>
              </View>
            ))}
          </View>
        )}
      </View>
      <BottomBar border={false}>
        <Button label={t("success.back")} onPress={onTasks} />
        <Button label={t("success.another")} variant="secondary" height={52} onPress={onAnother} />
      </BottomBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: "center", gap: 16, paddingHorizontal: 28 },
  icon: { width: 76, height: 76, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  table: { borderRadius: 14, borderWidth: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
});
