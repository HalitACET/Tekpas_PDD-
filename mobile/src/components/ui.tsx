import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  type TextProps,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import type { StatusKind } from "@/theme/colors";
import { fonts } from "@/theme/fonts";
import { useTheme } from "@/theme/theme";

/**
 * The few building blocks of the app's screens (design v0.8): text in the design's sizes, the buttons of the bottom
 * bar (56 pt, 14 radius), status chips, cards, alert boxes, the bottom sheet and skeletons. Touch targets are 44 pt or
 * more; secondary grey text is used only for secondary lines.
 */

type Tone = "default" | "muted" | "brand" | "danger";

export function T({
  children,
  size = 16,
  weight = "regular",
  family = "sans",
  tone = "default",
  style,
  ...rest
}: TextProps & {
  children: ReactNode;
  size?: number;
  weight?: "regular" | "medium" | "semi";
  family?: "sans" | "mono" | "serif";
  tone?: Tone;
  style?: TextStyle | TextStyle[];
}) {
  const { colors } = useTheme();
  const fontFamily =
    family === "serif"
      ? fonts.serif
      : family === "mono"
        ? weight === "semi" ? fonts.monoSemi : weight === "medium" ? fonts.monoMedium : fonts.mono
        : weight === "semi" ? fonts.sansSemi : weight === "medium" ? fonts.sansMedium : fonts.sans;
  const color =
    tone === "muted" ? colors.mutedForeground : tone === "brand" ? colors.brandText : tone === "danger" ? colors.status.rejected.fg : colors.foreground;
  return (
    <Text
      {...rest}
      style={[{ fontFamily, fontSize: size, color, lineHeight: family === "serif" ? size * 1.12 : size * 1.42 }, style]}
    >
      {children}
    </Text>
  );
}

/** "Giriş yapın", "Görevler": the serif heading of a screen. */
export function Heading({ children, size = 34 }: { children: ReactNode; size?: number }) {
  return (
    <T family="serif" size={size} style={{ letterSpacing: -0.6 }} accessibilityRole="header">
      {children}
    </T>
  );
}

type Variant = "primary" | "brand" | "secondary" | "ghost" | "destructive" | "locked";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon: Icon,
  busy = false,
  disabled = false,
  height = 56,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: LucideIcon;
  busy?: boolean;
  disabled?: boolean;
  height?: number;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const look: Record<Variant, { bg: string; fg: string; border?: string; dashed?: boolean }> = {
    primary: { bg: colors.primary, fg: colors.primaryForeground },
    brand: { bg: colors.brand, fg: colors.brandForeground },
    secondary: { bg: colors.card, fg: colors.foreground, border: colors.input },
    ghost: { bg: "transparent", fg: colors.foreground },
    destructive: { bg: colors.destructive, fg: colors.destructiveForeground },
    locked: { bg: colors.muted, fg: colors.mutedForeground, border: colors.input, dashed: true },
  };
  const { bg, fg, border, dashed } = look[variant];
  const off = disabled || busy || variant === "locked";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          height,
          backgroundColor: bg,
          borderColor: border ?? "transparent",
          borderWidth: border ? 1 : 0,
          borderStyle: dashed ? "dashed" : "solid",
          opacity: busy ? 0.7 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : Icon ? <Icon size={22} color={fg} strokeWidth={2} /> : null}
      <T size={17} weight="semi" style={{ color: fg }}>
        {label}
      </T>
    </Pressable>
  );
}

/** "Veri toplanıyor", "AI okudu · 2 alan sarı": a dot and a word in a status colour. */
export function Chip({ kind, label, small = false }: { kind: StatusKind; label: string; small?: boolean }) {
  const { colors } = useTheme();
  const s = colors.status[kind];
  return (
    <View
      style={[
        styles.chip,
        { backgroundColor: s.muted, paddingVertical: small ? 3 : 4, paddingLeft: small ? 8 : 9, paddingRight: small ? 10 : 11 },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: s.dot, width: small ? 6 : 7, height: small ? 6 : 7 }]} />
      <T size={small ? 13 : 14} weight="medium" style={{ color: s.fg }}>
        {label}
      </T>
    </View>
  );
}

/** A small mono tag: a certificate type, a batch number. */
export function Tag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: colors.muted }]}>
      <T family="mono" weight="semi" size={13}>
        {label}
      </T>
    </View>
  );
}

/** A count in a pill next to a group title. */
export function Count({ value, brand = false }: { value: number; brand?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.count, { backgroundColor: brand ? colors.brandMuted : colors.muted }]}>
      <T family="mono" weight="semi" size={14} style={{ color: brand ? colors.brandText : colors.foreground }}>
        {String(value)}
      </T>
    </View>
  );
}

/** A card of a list; with onPress it is one large touch target. */
export function Card({
  children,
  onPress,
  style,
  accessibilityLabel,
  disabled,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const base = [styles.card, { borderColor: colors.border, backgroundColor: colors.card }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [...base, { opacity: pressed ? 0.8 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

/** An alert box: a title in bold and a sentence (wrong password, connection lost, reading takes long). */
export function Banner({
  kind,
  title,
  body,
  icon: Icon,
  meta,
}: {
  kind: StatusKind | "neutral";
  title: string;
  body?: string;
  icon?: LucideIcon;
  meta?: string;
}) {
  const { colors } = useTheme();
  const bg = kind === "neutral" ? colors.muted : colors.status[kind].muted;
  const fg = kind === "neutral" ? colors.foreground : colors.status[kind].fg;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: bg }]}>
      {Icon && <Icon size={20} color={fg} strokeWidth={2} style={{ marginTop: 1 }} />}
      <View style={{ flex: 1, gap: 4 }}>
        <T size={15} weight="semi" style={{ color: fg }}>
          {title}
        </T>
        {body ? <T size={15}>{body}</T> : null}
        {meta ? (
          <T size={13} family="mono" tone="muted">
            {meta}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** The top bar of a step of a flow: back or close (44 pt), a title, something on the right. */
export function TopBar({
  title,
  subtitle,
  onBack,
  backIcon: BackIcon,
  backLabel,
  right,
  border = false,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backIcon: LucideIcon;
  backLabel: string;
  right?: ReactNode;
  border?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.topBar, border && { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} hitSlop={8} style={styles.icon44}>
        <BackIcon size={24} color={colors.foreground} strokeWidth={2} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <T size={18} weight="semi" accessibilityRole="header">
          {title}
        </T>
        {subtitle ? (
          <T size={13} family="mono" weight="medium" tone="muted">
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ? <View style={{ paddingHorizontal: 12 }}>{right}</View> : null}
    </View>
  );
}

/** The bar at the bottom of a screen that holds its main action, within the thumb's reach. */
export function BottomBar({ children, border = true }: { children: ReactNode; border?: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.bottomBar,
        { backgroundColor: colors.background },
        border && { borderTopWidth: 1, borderTopColor: colors.border },
      ]}
    >
      {children}
    </View>
  );
}

/** A sheet from the bottom over a scrim (date picker, sign-out, a conflict). */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("common.close")} style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]} onPress={onClose} />
      <View accessibilityViewIsModal style={[styles.sheet, { backgroundColor: colors.popover }]}>
        <View style={[styles.grabber, { backgroundColor: colors.input }]} />
        {children}
      </View>
    </Modal>
  );
}

export function Skeleton({ width, height, radius = 5 }: { width: number | `${number}%`; height: number; radius?: number }) {
  const { colors } = useTheme();
  return <View style={{ width, height, borderRadius: radius, backgroundColor: colors.skeleton }} />;
}

/** The three-way switch of the profile (language, theme). */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={[styles.segmented, { backgroundColor: colors.muted }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: colors.card, elevation: 1, shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }]}
          >
            <T size={16} weight={on ? "semi" : "medium"}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16 },
  chip: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999 },
  dot: { borderRadius: 999 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  count: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 14, borderWidth: 1 },
  banner: { flexDirection: "row", gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12 },
  topBar: { height: 56, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 },
  icon44: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  bottomBar: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 28, gap: 14 },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 999 },
  segmented: { flexDirection: "row", gap: 4, padding: 4, borderRadius: 12 },
  segment: { flex: 1, height: 48, borderRadius: 9, alignItems: "center", justifyContent: "center" },
});
