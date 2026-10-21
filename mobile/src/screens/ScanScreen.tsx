import { CameraView, useCameraPermissions } from "expo-camera";
import * as WebBrowser from "expo-web-browser";
import { Check, Globe, QrCode, RefreshCw, ScanLine, WifiOff, Zap, ZapOff } from "lucide-react-native";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Permission } from "@/components/Permission";
import { BottomBar, Button, Sheet, T } from "@/components/ui";
import { ApiError, type BatchResponse, lookupBatch } from "@/lib/queries";
import { passportUrl, readCode } from "@/lib/scan";
import { fonts } from "@/theme/fonts";
import { useTheme } from "@/theme/theme";

const CAMERA_BG = "#1E2127";
const HIT = "#3DB374";
const BOX = 248;
/** The same code read again within this time is the same scan. */
const REPEAT_MS = 2000;
/** How long the green "Okundu" stays before the lookup shows. */
const HIT_MS = 600;

type Code = { gtin: string; batchNo: string };
type Phase =
  | { kind: "idle" }
  | { kind: "hit"; code: Code }
  | { kind: "resolving"; code: Code }
  | { kind: "unknown"; text: string }
  | { kind: "offline"; code: Code }
  | { kind: "foreign"; code: Code; url: string };

/**
 * Design v0.9 101a–101h: the camera reads QR codes only. A GS1 Digital Link of one of the company's batches opens its
 * summary; another company's (or an unknown) batch opens our public passport page in the in-app browser; anything
 * else is shown as read and never opened.
 */
export function ScanScreen({
  focused,
  onBatch,
  onNotNow,
  lookup = lookupBatch,
  openBrowser = (url: string) => WebBrowser.openBrowserAsync(url),
}: {
  focused: boolean;
  onBatch: (batch: BatchResponse) => void;
  onNotNow: () => void;
  lookup?: typeof lookupBatch;
  openBrowser?: (url: string) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [torch, setTorch] = useState(false);
  const [height, setHeight] = useState(0);
  const last = useRef<{ data: string; at: number }>(undefined);
  const abort = useRef<AbortController>(undefined);

  const resolve = async (code: Code) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase({ kind: "hit", code });
    await new Promise((done) => setTimeout(done, HIT_MS));
    if (controller.signal.aborted) return;
    setPhase({ kind: "resolving", code });
    try {
      const batch = await lookup(code.gtin, code.batchNo, controller.signal);
      if (controller.signal.aborted) return;
      setPhase({ kind: "idle" });
      onBatch(batch);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ApiError && error.status === 404) {
        const url = passportUrl(code.gtin, code.batchNo);
        setPhase({ kind: "foreign", code, url });
        await openBrowser(url);
        setPhase({ kind: "idle" });
      } else {
        setPhase({ kind: "offline", code });
      }
    }
  };

  const scanned = ({ data }: { data: string }) => {
    if (phase.kind !== "idle") return;
    const now = Date.now();
    if (last.current && last.current.data === data && now - last.current.at < REPEAT_MS) return;
    last.current = { data, at: now };
    const code = readCode(data);
    if (code.kind === "other") setPhase({ kind: "unknown", text: code.text });
    else void resolve(code);
  };

  const cancel = () => {
    abort.current?.abort();
    setPhase({ kind: "idle" });
  };

  if (!permission) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  if (!permission.granted) {
    const denied = !permission.canAskAgain;
    return (
      <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
        <Permission
          icon={ScanLine}
          denied={denied}
          title={denied ? t("scan.deniedTitle") : t("scan.askTitle")}
          body={denied ? t("scan.deniedBody") : t("scan.askBody")}
          steps={denied ? [t("scan.deniedStep1"), t("scan.deniedStep2"), t("scan.deniedStep3")] : undefined}
        />
        <BottomBar border={false}>
          <Button
            label={denied ? t("scan.openSettings") : t("scan.allow")}
            onPress={() => void (denied ? Linking.openSettings() : requestPermission())}
          />
          {!denied && <Button label={t("scan.notNow")} variant="ghost" height={52} onPress={onNotNow} />}
        </BottomBar>
      </SafeAreaView>
    );
  }

  const green = phase.kind === "hit" || phase.kind === "resolving";
  const corner = green ? HIT : "#FFFFFF";
  const dim = `rgba(5,7,10,${green ? 0.62 : 0.48})`;
  const top = Math.max(0, height * 0.43 - BOX / 2);
  const code = "code" in phase ? phase.code : undefined;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: "#0B0D11" }}>
      <View style={styles.live} onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height)}>
        {focused && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={phase.kind === "idle" ? scanned : undefined}
          />
        )}
        {/* The dimmed surroundings of the frame, as four bands. */}
        <View pointerEvents="none" style={[styles.band, { top: 0, height: top, left: 0, right: 0, backgroundColor: dim }]} />
        <View pointerEvents="none" style={[styles.band, { top: top + BOX, bottom: 0, left: 0, right: 0, backgroundColor: dim }]} />
        <View pointerEvents="none" style={[styles.band, { top, height: BOX, left: 0, right: "50%", marginRight: BOX / 2, backgroundColor: dim }]} />
        <View pointerEvents="none" style={[styles.band, { top, height: BOX, right: 0, left: "50%", marginLeft: BOX / 2, backgroundColor: dim }]} />
        <View
          pointerEvents="none"
          style={[styles.box, { top, backgroundColor: phase.kind === "hit" ? "rgba(61,179,116,0.16)" : "transparent" }]}
        >
          <View style={[styles.corner, { left: 0, top: 0, borderLeftWidth: 5, borderTopWidth: 5, borderTopLeftRadius: 22, borderColor: corner }]} />
          <View style={[styles.corner, { right: 0, top: 0, borderRightWidth: 5, borderTopWidth: 5, borderTopRightRadius: 22, borderColor: corner }]} />
          <View style={[styles.corner, { left: 0, bottom: 0, borderLeftWidth: 5, borderBottomWidth: 5, borderBottomLeftRadius: 22, borderColor: corner }]} />
          <View style={[styles.corner, { right: 0, bottom: 0, borderRightWidth: 5, borderBottomWidth: 5, borderBottomRightRadius: 22, borderColor: corner }]} />
          {phase.kind === "hit" && (
            <View style={styles.hitMark}>
              <Check size={38} color="#0B0D11" strokeWidth={2.8} />
            </View>
          )}
        </View>
        <View pointerEvents="none" style={styles.titleWrap}>
          <View style={styles.titlePill}>
            <T size={16} weight="semi" style={{ color: "#FFFFFF" }} accessibilityRole="header">
              {t("scan.title")}
            </T>
          </View>
        </View>
        <View style={styles.bottom}>
          {phase.kind === "hit" ? (
            <>
              <View accessibilityLiveRegion="polite" style={[styles.pill, { backgroundColor: HIT }]}>
                <T size={17} weight="semi" style={{ color: "#0B0D11" }}>
                  {t("scan.hit")}
                </T>
              </View>
              <T size={15} family="mono" weight="medium" style={{ color: "#FFFFFF" }}>
                {phase.code.batchNo}
              </T>
            </>
          ) : phase.kind === "resolving" ? (
            <>
              <View accessibilityLiveRegion="polite" style={[styles.pill, { backgroundColor: "rgba(0,0,0,0.65)" }]}>
                <ActivityIndicator color="#FFFFFF" />
                <T size={17} weight="semi" style={{ color: "#FFFFFF" }}>
                  {t("scan.resolving")}
                </T>
              </View>
              <T size={15} family="mono" weight="medium" style={{ color: "#FFFFFF" }}>
                {phase.code.batchNo}
              </T>
              <Pressable accessibilityRole="button" onPress={cancel} style={styles.cancel}>
                <T size={17} weight="medium" style={{ color: "#FFFFFF" }}>
                  {t("scan.cancel")}
                </T>
              </Pressable>
            </>
          ) : (
            <>
              <T size={17} weight="medium" style={styles.hint}>
                {t("scan.hint")}
              </T>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{ checked: torch }}
                accessibilityLabel={torch ? t("scan.flashOn") : t("scan.flashOff")}
                onPress={() => setTorch((v) => !v)}
                style={[styles.flash, torch && { backgroundColor: "#FFD54A" }]}
              >
                {torch ? <Zap size={24} color="#0B0D11" fill="#0B0D11" /> : <ZapOff size={24} color="#FFFFFF" />}
              </Pressable>
            </>
          )}
        </View>
      </View>

      <Sheet visible={phase.kind === "unknown"} onClose={cancel}>
        <SheetIcon icon={QrCode} bg={colors.muted} fg={colors.foreground} />
        <T family="serif" size={28}>
          {t("scan.unknownTitle")}
        </T>
        <T size={16} style={{ lineHeight: 24 }}>
          {t("scan.unknownBody")}
        </T>
        {phase.kind === "unknown" && <Mono label={t("scan.readText")} value={phase.text} />}
        <Button label={t("scan.scanAgain")} icon={ScanLine} onPress={cancel} />
      </Sheet>

      <Sheet visible={phase.kind === "offline"} onClose={cancel}>
        <SheetIcon icon={WifiOff} bg={colors.status.rejected.muted} fg={colors.status.rejected.fg} />
        <T family="serif" size={28}>
          {t("scan.offlineTitle")}
        </T>
        <T size={16} style={{ lineHeight: 24 }}>
          {t("scan.offlineBody", { code: code?.batchNo ?? "" })}
        </T>
        <Button label={t("scan.retry")} variant="brand" icon={RefreshCw} onPress={() => code && void resolve(code)} />
        <Button label={t("scan.giveUp")} variant="ghost" height={52} onPress={cancel} />
      </Sheet>

      <Sheet visible={phase.kind === "foreign"} onClose={cancel}>
        <SheetIcon icon={Globe} bg={colors.status.submitted.muted} fg={colors.status.submitted.fg} />
        <T family="serif" size={28}>
          {t("scan.foreignTitle")}
        </T>
        <T size={16} style={{ lineHeight: 24 }}>
          {t("scan.foreignBody")}
        </T>
        {phase.kind === "foreign" && <Mono label={t("scan.address")} value={phase.url.replace(/^https?:\/\//, "")} />}
        <View style={styles.opening}>
          <ActivityIndicator color={colors.foreground} />
          <T size={16} weight="medium">
            {t("scan.opening")}
          </T>
        </View>
        <Button label={t("scan.cancel")} variant="ghost" height={52} onPress={cancel} />
      </Sheet>
    </SafeAreaView>
  );
}

function SheetIcon({ icon: Icon, bg, fg }: { icon: typeof Globe; bg: string; fg: string }) {
  return (
    <View style={[styles.sheetIcon, { backgroundColor: bg }]}>
      <Icon size={26} color={fg} strokeWidth={2} />
    </View>
  );
}

function Mono({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.mono, { backgroundColor: colors.muted }]}>
      <T size={14} weight="semi">
        {label}
      </T>
      <T size={15} numberOfLines={1} style={{ fontFamily: fonts.monoMedium }}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  live: { flex: 1, overflow: "hidden", backgroundColor: CAMERA_BG },
  band: { position: "absolute" },
  box: { position: "absolute", left: "50%", marginLeft: -BOX / 2, width: BOX, height: BOX, borderRadius: 22 },
  corner: { position: "absolute", width: 44, height: 44 },
  hitMark: {
    position: "absolute",
    left: BOX / 2 - 36,
    top: BOX / 2 - 36,
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: HIT,
    alignItems: "center",
    justifyContent: "center",
  },
  titleWrap: { position: "absolute", top: 16, left: 0, right: 0, alignItems: "center" },
  titlePill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.55)" },
  bottom: { position: "absolute", left: 24, right: 24, bottom: 24, alignItems: "center", gap: 18 },
  hint: { color: "#FFFFFF", textAlign: "center", maxWidth: 290, lineHeight: 24 },
  flash: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  pill: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999 },
  cancel: {
    alignSelf: "stretch",
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  sheetIcon: { width: 52, height: 52, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  mono: { gap: 4, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12 },
  opening: { flexDirection: "row", alignItems: "center", gap: 10 },
});
