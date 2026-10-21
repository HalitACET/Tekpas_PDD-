import { Bell, BellOff, ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Linking, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Logo } from "@/components/Logo";
import { Permission } from "@/components/Permission";
import { Banner, BottomBar, Button, T, TopBar } from "@/components/ui";
import { type PushState, enablePush, markExplained } from "@/lib/notifications";
import { useTheme } from "@/theme/theme";

/**
 * Design v0.9 106a: once, after the first sign-in on a phone, why we would like to send notifications, with a sample.
 * Only "Bildirimlere izin ver" brings up the system's question.
 */
export function NotificationAskScreen({
  onDone,
  onDenied,
  enable = enablePush,
}: {
  onDone: () => void;
  onDenied: () => void;
  enable?: () => Promise<PushState>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const allow = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const state = await enable();
      if (state === "denied") onDenied();
      else onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <Permission icon={Bell} tone="submitted" title={t("notifications.askTitle")} body={t("notifications.askBody")}>
        <View style={{ gap: 8, marginTop: 6 }}>
          <T size={14} weight="semi" tone="muted">
            {t("notifications.example")}
          </T>
          <View style={[styles.sample, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <View style={[styles.appIcon, { backgroundColor: colors.brand }]}>
              <Logo size={26} background={colors.brand} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.between}>
                <T size={16} weight="semi">
                  {t("notifications.exampleTitle")}
                </T>
                <T size={14} tone="muted">
                  {t("notifications.now")}
                </T>
              </View>
              <T size={15} style={{ lineHeight: 21 }}>
                {t("notifications.exampleBody")}
              </T>
            </View>
          </View>
        </View>
        {failed && <Banner kind="rejected" title={t("notifications.failed")} />}
      </Permission>
      <BottomBar border={false}>
        <Button label={t("notifications.allow")} busy={busy} onPress={() => void allow()} />
        <Button
          label={t("notifications.notNow")}
          variant="ghost"
          height={52}
          onPress={() => void markExplained().finally(onDone)}
        />
        <T size={15} style={{ textAlign: "center" }}>
          {t("notifications.laterNote")}
        </T>
      </BottomBar>
    </SafeAreaView>
  );
}

/** Design v0.9 106b: the phone refused; only the settings can turn notifications back on. */
export function NotificationDeniedScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar title={t("notifications.title")} backIcon={ChevronLeft} backLabel={t("common.back")} onBack={onBack} />
      <Permission
        icon={BellOff}
        denied
        title={t("notifications.deniedTitle")}
        body={t("notifications.deniedBody")}
        steps={[t("notifications.deniedStep1"), t("notifications.deniedStep2"), t("notifications.deniedStep3")]}
      />
      <BottomBar border={false}>
        <Button label={t("notifications.openSettings")} onPress={() => void Linking.openSettings()} />
      </BottomBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  sample: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 20, borderWidth: 1 },
  appIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  between: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
});
