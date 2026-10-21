import { AlertTriangle, ChevronLeft, Plus, RotateCcw, Trash2, Upload } from "lucide-react-native";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Banner, BottomBar, Button, T, TopBar } from "@/components/ui";
import type { Page } from "@/lib/capture";
import { type DocType, MAX_BYTES, MAX_PAGES, QUICK_TYPES } from "@/lib/documents";
import { formatSize } from "@/lib/format";
import { useTheme } from "@/theme/theme";

/**
 * Design v0.8 96a–96b: the pages in their order with retake and delete (44 pt each), "Sayfa ekle" until the limit,
 * the optional document type, and "Yükle". The order changes by pressing and holding a page, then tapping the one to
 * swap it with (a drag would need a gesture library the app does not have).
 */
export function ReviewScreen({
  subtitle,
  pages,
  docType,
  onBack,
  onAdd,
  onRetake,
  onRemove,
  onSwap,
  onType,
  onUpload,
}: {
  subtitle: string;
  pages: Page[];
  docType?: DocType;
  onBack: () => void;
  onAdd: () => void;
  onRetake: (index: number) => void;
  onRemove: (index: number) => void;
  onSwap: (a: number, b: number) => void;
  onType: (type: DocType | undefined) => void;
  onUpload: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [moving, setMoving] = useState<number>();
  const limit = pages.length >= MAX_PAGES;
  const bytes = pages.reduce((sum, p) => sum + p.bytes, 0);
  const tooLarge = bytes > MAX_BYTES;
  const columns = limit ? 4 : 3;

  const tap = (index: number) => {
    if (moving === undefined) return;
    if (moving !== index) onSwap(moving, index);
    setMoving(undefined);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <TopBar
        title={t("review.title")}
        subtitle={subtitle}
        backIcon={ChevronLeft}
        backLabel={t("common.back")}
        onBack={onBack}
        right={
          <T size={15} weight="medium">
            {limit ? t("review.limitCount", { count: pages.length, max: MAX_PAGES }) : t("review.pages", { count: pages.length })}
          </T>
        }
      />
      <ScrollView contentContainerStyle={styles.page}>
        {limit && <Banner kind="lowConfidence" title={t("review.limitTitle", { max: MAX_PAGES })} body={t("review.limitBody")} />}
        {tooLarge && <Banner kind="rejected" icon={AlertTriangle} title={t("review.tooLargeTitle")} body={t("review.tooLargeBody")} />}
        <View style={[styles.grid, { gap: limit ? 8 : 12 }]}>
          {pages.map((page, i) => (
            <View key={`${page.uri}-${i}`} style={{ width: `${100 / columns - 3}%`, gap: 6 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("review.page", { n: i + 1 })}
                accessibilityHint={moving === undefined ? t("review.moveHint") : t("review.pickTarget")}
                onLongPress={() => setMoving(i)}
                onPress={() => tap(i)}
                style={[styles.thumb, { borderColor: moving === i ? colors.ring : colors.border, borderWidth: moving === i ? 3 : 1 }]}
              >
                <Image source={{ uri: page.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <T family="mono" weight="semi" size={13} style={{ color: colors.primaryForeground }}>
                    {String(i + 1)}
                  </T>
                </View>
              </Pressable>
              {!limit && (
                <View style={{ flexDirection: "row", gap: 4 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("review.retake")} ${i + 1}`}
                    onPress={() => onRetake(i)}
                    style={[styles.action, { borderColor: colors.input, backgroundColor: colors.card }]}
                  >
                    <RotateCcw size={20} color={colors.foreground} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t("review.remove")} ${i + 1}`}
                    onPress={() => onRemove(i)}
                    style={[styles.action, { borderColor: colors.input, backgroundColor: colors.card }]}
                  >
                    <Trash2 size={20} color={colors.destructive} />
                  </Pressable>
                </View>
              )}
            </View>
          ))}
          {!limit && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("review.addPage")}
              onPress={onAdd}
              style={[styles.add, { width: `${100 / columns - 3}%`, borderColor: colors.input }]}
            >
              <Plus size={26} color={colors.foreground} />
              <T size={15} weight="medium">
                {t("review.addPage")}
              </T>
            </Pressable>
          )}
        </View>
        {!limit && pages.length > 1 && (
          <T size={14} tone="muted">
            {moving === undefined ? t("review.moveHint") : t("review.pickTarget")}
          </T>
        )}
        <View style={{ gap: 10 }}>
          <T size={16} weight="semi">
            {t("review.typeTitle")} <T size={16} tone="muted">{t("review.optional")}</T>
          </T>
          <View style={styles.types} accessibilityRole="radiogroup" accessibilityLabel={t("review.typeTitle")}>
            {[...QUICK_TYPES, undefined].map((type) => {
              const on = docType === type;
              return (
                <Pressable
                  key={type ?? "unknown"}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => onType(type)}
                  style={[
                    styles.type,
                    { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.input },
                  ]}
                >
                  <T size={16} weight="medium" style={{ color: on ? colors.primaryForeground : colors.foreground }}>
                    {type ? t(`docType.${type}`) : t("review.unknownType")}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
      <BottomBar>
        <T size={15} tone="muted" style={{ textAlign: "center" }}>
          {t("review.size", { count: pages.length, size: formatSize(bytes) })}
        </T>
        <Button label={t("review.upload")} variant="brand" icon={Upload} disabled={pages.length === 0 || tooLarge} onPress={onUpload} />
      </BottomBar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { gap: 18, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  thumb: { aspectRatio: 3 / 4, borderRadius: 10, overflow: "hidden", backgroundColor: "#E9E4DA" },
  badge: { position: "absolute", left: 6, top: 6, minWidth: 26, height: 26, paddingHorizontal: 6, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  action: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  add: { aspectRatio: 3 / 4, borderRadius: 10, borderWidth: 2, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 6 },
  types: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  type: { height: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
});
