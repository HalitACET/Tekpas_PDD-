import { AlertCircle, Eye, EyeOff, WifiOff } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, Button, Heading, T } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { login, type LoginResult } from "@/lib/session";
import { fonts } from "@/theme/fonts";
import { useTheme } from "@/theme/theme";

/** After this long without an answer the server is probably waking up (design v0.8 90e). */
export const WAKE_AFTER_MS = 4000;
const WAKE_EXPECTED_S = 60;

type Outcome = Exclude<LoginResult, "ok"> | "offline";

/**
 * Design v0.8 90a–90e: e-mail and password, the main action at the bottom; wrong credentials keep the password; no
 * connection turns the button into "Tekrar dene"; a sleeping server shows how long it has been waking.
 */
export function LoginScreen({ onSignedIn }: { onSignedIn?: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();
  const [waited, setWaited] = useState<number>();
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  const submit = async () => {
    if (!email.trim() || !password) {
      setOutcome("invalid");
      return;
    }
    setBusy(true);
    setOutcome(undefined);
    const started = Date.now();
    timer.current = setInterval(() => {
      const ms = Date.now() - started;
      if (ms >= WAKE_AFTER_MS) setWaited(Math.round(ms / 1000));
    }, 1000);
    const result = await login(email.trim().toLowerCase(), password);
    clearInterval(timer.current);
    setWaited(undefined);
    setBusy(false);
    if (result === "ok") {
      onSignedIn?.();
      return;
    }
    // An answer that never came quickly is a missing connection; a slow one was a server that did not wake in time.
    setOutcome(result === "unreachable" && Date.now() - started < WAKE_AFTER_MS ? "offline" : result);
  };

  const wrong = outcome === "invalid";
  const fieldStyle = [
    styles.field,
    {
      borderColor: wrong ? colors.destructive : colors.input,
      borderWidth: wrong ? 2 : 1,
      backgroundColor: busy ? colors.muted : colors.card,
      color: busy ? colors.mutedForeground : colors.foreground,
    },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Logo size={34} />
            <T size={22} weight="semi" style={{ letterSpacing: -0.6 }}>
              {t("common.brand")}
            </T>
          </View>
          <View style={{ gap: 8 }}>
            <Heading>{t("login.title")}</Heading>
            <T size={16} tone="muted">
              {t("login.sub")}
            </T>
          </View>

          {wrong && <Banner kind="rejected" icon={AlertCircle} title={t("login.wrongTitle")} body={t("login.wrongBody")} />}
          {outcome === "offline" && <Banner kind="neutral" icon={WifiOff} title={t("login.offlineTitle")} body={t("login.offlineBody")} />}
          {(outcome === "unavailable" || outcome === "unreachable") && (
            <Banner kind="neutral" icon={AlertCircle} title={t("login.unavailableTitle")} body={t("login.unavailableBody")} />
          )}
          {waited !== undefined && (
            <View accessibilityRole="progressbar" style={[styles.waking, { backgroundColor: colors.status.submitted.muted }]}>
              <View style={styles.wakingHead}>
                <T size={16} weight="semi" style={{ color: colors.status.submitted.fg }}>
                  {t("login.wakingTitle")}
                </T>
                <T size={15} family="mono" weight="medium" style={{ color: colors.status.submitted.fg }}>
                  {t("login.seconds", { n: waited })}
                </T>
              </View>
              <View style={[styles.track, { backgroundColor: colors.card }]}>
                <View
                  style={[
                    styles.bar,
                    { backgroundColor: colors.status.submitted.dot, width: `${Math.min(95, Math.round((waited / WAKE_EXPECTED_S) * 100))}%` },
                  ]}
                />
              </View>
              <T size={15}>{t("login.wakingBody")}</T>
            </View>
          )}

          <View style={{ gap: 16 }}>
            <View style={{ gap: 8 }}>
              <T size={15} weight="medium" nativeID="email-label">
                {t("login.email")}
              </T>
              <TextInput
                accessibilityLabel={t("login.email")}
                value={email}
                onChangeText={setEmail}
                editable={!busy}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                style={fieldStyle}
              />
            </View>
            <View style={{ gap: 8 }}>
              <T size={15} weight="medium">
                {t("login.password")}
              </T>
              <View>
                <TextInput
                  accessibilityLabel={t("login.password")}
                  value={password}
                  onChangeText={setPassword}
                  editable={!busy}
                  secureTextEntry={!shown}
                  autoComplete="password"
                  textContentType="password"
                  onSubmitEditing={() => void submit()}
                  style={[fieldStyle, { paddingRight: 52 }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={shown ? t("login.hidePassword") : t("login.showPassword")}
                  onPress={() => setShown((v) => !v)}
                  style={styles.eye}
                >
                  {shown ? <EyeOff size={22} color={colors.mutedForeground} /> : <Eye size={22} color={colors.mutedForeground} />}
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.bottom}>
            <Button
              label={busy ? t("login.submitting") : outcome === "offline" ? t("common.retry") : t("login.submit")}
              busy={busy}
              onPress={() => void submit()}
            />
            <T size={14} tone="muted" style={{ textAlign: "center" }}>
              {t("login.noAccount")}
            </T>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 24, paddingBottom: 16, gap: 24 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 24 },
  field: { height: 52, borderRadius: 10, paddingHorizontal: 16, fontSize: 17, fontFamily: fonts.sans },
  eye: { position: "absolute", right: 4, top: 4, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  waking: { gap: 12, padding: 16, borderRadius: 12 },
  wakingHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  track: { height: 6, borderRadius: 999, overflow: "hidden" },
  bar: { height: "100%", borderRadius: 999 },
  bottom: { marginTop: "auto", gap: 12 },
});
