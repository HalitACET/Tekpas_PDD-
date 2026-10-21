import Svg, { Ellipse, G, Path } from "react-native-svg";
import { useTheme } from "@/theme/theme";

/** The cocoon mark of KozaPass (docs/design/v0.8, KozaPass Marka): a mulberry cocoon with its thread. */
export function Logo({ size = 34, background }: { size?: number; background?: string }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityElementsHidden importantForAccessibility="no">
      <G transform="translate(13 18.5) rotate(35)">
        <Ellipse rx={8.5} ry={11.5} fill={colors.brand} />
        <Path d="M-7.2 -2.5Q0 0.5 7.2 -2.5M-6.8 4Q0 7 6.8 4" fill="none" stroke={background ?? colors.background} strokeWidth={2} strokeLinecap="round" />
      </G>
      <Path d="M19.6 9.2C22.5 5.5 25 9.5 29.5 3" fill="none" stroke={colors.brand} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}
