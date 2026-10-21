import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Logo } from "@/components/Logo";
import { Button, T } from "@/components/ui";
import { useTheme } from "@/theme/theme";

/** Design v0.8 91: the mark while the session comes back; with a retry when the server could not be reached. */
export function SplashScreen({ unreachable = false, onRetry }: { unreachable?: boolean; onRetry?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.page, { backgroundColor: colors.story }]}>
      <View style={styles.center}>
        <Logo size={72} background={colors.story} />
        <T size={30} weight="semi" style={{ letterSpacing: -0.9 }}>
          {t("common.brand")}
        </T>
      </View>
      <View style={styles.bottom}>
        {unreachable ? (
          <>
            <T size={15} style={{ textAlign: "center" }}>
              {t("session.unreachable")}
            </T>
            <Button label={t("common.retry")} variant="secondary" onPress={onRetry} />
          </>
        ) : (
          <View style={styles.row} accessibilityRole="progressbar" accessibilityLabel={t("session.opening")}>
            <ActivityIndicator color={colors.mutedForeground} />
            <T size={15} tone="muted">
              {t("session.opening")}
            </T>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  bottom: { paddingHorizontal: 24, paddingBottom: 48, gap: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
});
