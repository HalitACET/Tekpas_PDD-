import Constants from "expo-constants";
import { LogOut } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Heading, Segmented, Sheet, T } from "@/components/ui";
import { API_URL } from "@/lib/config";
import type { LanguagePreference, ThemePreference } from "@/lib/preferences";
import { logout } from "@/lib/session";
import { useSession } from "@/lib/use-session";
import { useTheme } from "@/theme/theme";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toLocaleUpperCase("tr"))
    .join("");
}

/** Design v0.8 100a–100b: who is signed in, language and theme, the version, and signing out with a confirmation. */
export function ProfileScreen({ onSignedOut, onDiscardPages }: { onSignedOut?: () => void; onDiscardPages?: () => void }) {
  const { t, i18n } = useTranslation();
  const { colors, preferences, setPreferences } = useTheme();
  const session = useSession();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  if (session.status !== "authenticated") return null;
  const user = session.user;
  // The language the texts are in now: the chosen one, or the phone's.
  const language = preferences.language !== "system" ? preferences.language
    : i18n.language === "en" || i18n.language === "de" ? i18n.language : "tr";

  const signOut = async () => {
    setLeaving(true);
    onDiscardPages?.();
    await logout();
    setLeaving(false);
    setConfirming(false);
    onSignedOut?.();
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 }}>
        <Heading>{t("profile.title")}</Heading>
      </View>
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={[styles.avatar, { backgroundColor: colors.silk }]}>
            <T size={18} weight="semi" style={{ color: "#3D3A35" }}>
              {initials(user.fullName)}
            </T>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <T size={18} weight="semi">
              {user.fullName}
            </T>
            <T size={15} numberOfLines={1}>
              {user.email}
            </T>
            <T size={15} tone="muted">
              {user.company.name}
            </T>
          </View>
          <View style={[styles.role, { backgroundColor: colors.brandMuted }]}>
            <T size={14} weight="semi" tone="brand">
              {t(`roles.${user.role}`)}
            </T>
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <T size={16} weight="semi">
            {t("profile.language")}
          </T>
          <Segmented<Exclude<LanguagePreference, "system">>
            label={t("profile.language")}
            value={language}
            onChange={(value) => setPreferences({ ...preferences, language: value })}
            options={[
              { value: "tr", label: t("languages.tr") },
              { value: "en", label: t("languages.en") },
              { value: "de", label: t("languages.de") },
            ]}
          />
        </View>
        <View style={{ gap: 10 }}>
          <T size={16} weight="semi">
            {t("profile.theme")}
          </T>
          <Segmented<ThemePreference>
            label={t("profile.theme")}
            value={preferences.theme}
            onChange={(value) => setPreferences({ ...preferences, theme: value })}
            options={[
              { value: "system", label: t("profile.themeSystem") },
              { value: "light", label: t("profile.themeLight") },
              { value: "dark", label: t("profile.themeDark") },
            ]}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("profile.logout")}
          onPress={() => setConfirming(true)}
          style={[styles.logout, { borderColor: colors.input, backgroundColor: colors.card }]}
        >
          <LogOut size={20} color={colors.destructive} />
          <T size={17} weight="semi" style={{ color: colors.destructive }}>
            {t("profile.logout")}
          </T>
        </Pressable>

        <View style={{ marginTop: "auto", gap: 4 }}>
          <T size={13} family="mono" tone="muted">
            {t("profile.version", { version: Constants.expoConfig?.version ?? "1.0.0" })}
          </T>
          <T size={13} family="mono" tone="muted">
            {API_URL.replace(/^https?:\/\//, "")}
          </T>
        </View>
      </ScrollView>

      <Sheet visible={confirming} onClose={() => setConfirming(false)}>
        <T family="serif" size={28}>
          {t("profile.logoutTitle")}
        </T>
        <T size={16}>{t("profile.logoutBody")}</T>
        <Button label={t("profile.logout")} variant="destructive" busy={leaving} onPress={() => void signOut()} />
        <Button label={t("common.giveUp")} variant="secondary" height={52} onPress={() => setConfirming(false)} />
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, gap: 22, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: 14, borderWidth: 1 },
  avatar: { width: 52, height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  role: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  logout: { height: 52, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
});
