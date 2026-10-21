import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, CameraOff, X, Zap, ZapOff } from "lucide-react-native";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BottomBar, Button, Heading, T } from "@/components/ui";
import type { Page } from "@/lib/capture";
import { preparePage } from "@/lib/images";
import { useTheme } from "@/theme/theme";

const CAMERA_BG = "#0B0D11";

/** How large a prepared page is on the phone; 0 when it cannot be told (the upload checks the total again). */
async function sizeOf(uri: string): Promise<number> {
  try {
    // Not blob(): with Expo's fetch it copies the page through base64 into React Native's blob store (M8 phone trial).
    const response = await fetch(uri);
    return (await response.arrayBuffer()).byteLength;
  } catch {
    return 0;
  }
}

/**
 * Design v0.8 95a–95c: the full-screen camera (dark whatever the theme) with the frame guide, the flash, the page
 * counter, an 80 pt shutter, the last page and "Bitti"; before it, our explanation of the permission, and the way to
 * the settings once it was refused. Every page is scaled to 2000 px and saved as JPEG at once.
 */
export function CameraScreen({
  pageCount,
  lastPage,
  replacing,
  onPage,
  onDone,
  onClose,
}: {
  pageCount: number;
  lastPage?: Page;
  /** Retaking page n: one shot, then back to the review. */
  replacing?: number;
  onPage: (page: Page) => void;
  onDone: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [flash, setFlash] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (!permission.granted) {
    const denied = !permission.canAskAgain;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ height: 56, justifyContent: "center", paddingHorizontal: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={styles.icon44}>
            <X size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.permission}>
          <View
            style={[
              styles.permIcon,
              { backgroundColor: denied ? colors.status.rejected.muted : colors.muted },
            ]}
          >
            {denied ? <CameraOff size={34} color={colors.status.rejected.fg} /> : <Camera size={34} color={colors.foreground} />}
          </View>
          <Heading size={32}>{denied ? t("camera.deniedTitle") : t("camera.askTitle")}</Heading>
          <T size={17}>{denied ? t("camera.deniedBody") : t("camera.askBody")}</T>
          {denied && (
            <View style={[styles.steps, { backgroundColor: colors.muted }]}>
              {[t("camera.deniedStep1"), t("camera.deniedStep2"), t("camera.deniedStep3")].map((line, i) => (
                <T key={line} size={16} style={{ lineHeight: 27 }}>
                  {`${i + 1}. ${line}`}
                </T>
              ))}
            </View>
          )}
        </View>
        <BottomBar border={false}>
          <Button
            label={denied ? t("camera.openSettings") : t("camera.allow")}
            onPress={() => void (denied ? Linking.openSettings() : requestPermission())}
          />
          <Button label={t("common.giveUp")} variant="ghost" height={52} onPress={onClose} />
        </BottomBar>
      </SafeAreaView>
    );
  }

  const shoot = async () => {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.9 });
      const prepared = await preparePage(photo.uri);
      onPage({ ...prepared, bytes: await sizeOf(prepared.uri) });
      if (replacing !== undefined) onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: CAMERA_BG }}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} onPress={onClose} style={styles.round}>
          <X size={24} color="#FFFFFF" strokeWidth={2.2} />
        </Pressable>
        <View style={styles.counter}>
          <T size={16} weight="semi" style={{ color: "#FFFFFF" }}>
            {t("camera.page", { n: replacing !== undefined ? replacing + 1 : pageCount + 1 })}
          </T>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: flash }}
          accessibilityLabel={flash ? t("camera.flashOn") : t("camera.flashOff")}
          onPress={() => setFlash((v) => !v)}
          style={[styles.round, flash && { backgroundColor: "#FFD54A" }]}
        >
          {flash ? <Zap size={22} color={CAMERA_BG} fill={CAMERA_BG} /> : <ZapOff size={22} color="#FFFFFF" />}
        </Pressable>
      </View>
      <View style={styles.preview}>
        <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" flash={flash ? "on" : "off"} onCameraReady={() => setReady(true)} />
        <View pointerEvents="none" style={styles.frame}>
          <View style={[styles.corner, { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 6 }]} />
          <View style={[styles.corner, { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 6 }]} />
          <View style={[styles.corner, { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 6 }]} />
          <View style={[styles.corner, { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 6 }]} />
        </View>
        <View pointerEvents="none" style={styles.hint}>
          <T size={15} weight="medium" style={{ color: "#FFFFFF" }}>
            {t("camera.align")}
          </T>
        </View>
      </View>
      <View style={styles.bottom}>
        <View style={styles.thumbSlot}>
          {lastPage && (
            <View>
              <Image source={{ uri: lastPage.uri }} style={styles.thumb} accessibilityIgnoresInvertColors />
              <View style={styles.thumbCount}>
                <T family="mono" weight="semi" size={13} style={{ color: CAMERA_BG }}>
                  {String(pageCount)}
                </T>
              </View>
            </View>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("camera.shutter")}
          accessibilityState={{ disabled: !ready || busy }}
          disabled={!ready || busy}
          onPress={() => void shoot()}
          style={styles.shutter}
        >
          {busy ? <ActivityIndicator color={CAMERA_BG} /> : <View style={styles.shutterInner} />}
        </Pressable>
        <View style={styles.thumbSlot}>
          {pageCount > 0 && replacing === undefined && (
            <Pressable accessibilityRole="button" accessibilityLabel={t("camera.done")} onPress={onDone} style={styles.done}>
              <T size={17} weight="semi" style={{ color: CAMERA_BG }}>
                {t("camera.done")}
              </T>
            </Pressable>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  icon44: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  permission: { flex: 1, justifyContent: "center", gap: 16, paddingHorizontal: 28 },
  permIcon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  steps: { padding: 16, borderRadius: 12 },
  top: { height: 60, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 },
  round: { width: 48, height: 48, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  counter: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.14)" },
  preview: { flex: 1, marginVertical: 4, backgroundColor: "#23262C", overflow: "hidden" },
  frame: { position: "absolute", left: "10%", right: "10%", top: "7%", bottom: "9%" },
  corner: { position: "absolute", width: 36, height: 36, borderColor: "#FFFFFF" },
  hint: { position: "absolute", bottom: 20, alignSelf: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)" },
  bottom: { height: 128, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24 },
  thumbSlot: { width: 80, alignItems: "center" },
  thumb: { width: 56, height: 56, borderRadius: 8, borderWidth: 2, borderColor: "#FFFFFF" },
  thumbCount: { position: "absolute", right: -8, top: -8, minWidth: 24, height: 24, borderRadius: 999, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  shutter: { width: 80, height: 80, borderRadius: 999, borderWidth: 4, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 64, height: 64, borderRadius: 999, backgroundColor: "#FFFFFF" },
  done: { minWidth: 72, height: 48, paddingHorizontal: 16, borderRadius: 999, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
});
