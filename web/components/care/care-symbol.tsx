import type { CareSymbol, Gentleness } from "@tekpas/shared";

/**
 * A care symbol as a plain line icon (design v1.0, KozaPassBakimSembol): like ISO 3758 but not a copy of the
 * registered GINETEX marks. Decorative: the caller always shows or announces the symbol's text.
 */

type Path = { d: string; w?: number };

const TUB = "M3 6l2.2 11h13.6L21 6";
const WAVE = "M3 6c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0";
const SQUARE = "M4 3h16v16H4Z";
const CIRCLE = "M7 11a5 5 0 1 0 10 0a5 5 0 1 0-10 0";
const BIG_CIRCLE = "M4.5 11a7.5 7.5 0 1 0 15 0a7.5 7.5 0 1 0-15 0";
const TRIANGLE = "M12 3.5L21 18.5H3Z";
const IRON = "M3 17h18l-1.5-6A3.5 3.5 0 0 0 16 8.5H9A6 6 0 0 0 3 14.5Z";
const CROSS = "M3 2.5l18 17M21 2.5L3 19.5";
const HAND = "M9.5 15v-3.5a1 1 0 0 1 2 0V14M11.5 13.5v-4a1 1 0 0 1 2 0v4M13.5 13.5v-2.5a1 1 0 0 1 2 0V15";
const dot = (x: number, y: number, w = 2.6): Path => ({ d: `M${x} ${y}h.01`, w });

interface Drawing {
  paths: Path[];
  text?: { value: string; y: number; size: number };
}

const DRAWINGS: Record<CareSymbol, Drawing> = {
  WASH_30: { paths: [{ d: TUB }, { d: WAVE }], text: { value: "30", y: 15, size: 6.5 } },
  WASH_40: { paths: [{ d: TUB }, { d: WAVE }], text: { value: "40", y: 15, size: 6.5 } },
  WASH_60: { paths: [{ d: TUB }, { d: WAVE }], text: { value: "60", y: 15, size: 6.5 } },
  WASH_95: { paths: [{ d: TUB }, { d: WAVE }], text: { value: "95", y: 15, size: 6.5 } },
  HAND_WASH: { paths: [{ d: TUB }, { d: WAVE }, { d: HAND }] },
  DO_NOT_WASH: { paths: [{ d: TUB }, { d: WAVE }, { d: CROSS }] },
  BLEACH_ANY: { paths: [{ d: TRIANGLE }] },
  BLEACH_OXYGEN_ONLY: { paths: [{ d: TRIANGLE }, { d: "M11 9l-3.5 7M15 9l-3.5 7" }] },
  DO_NOT_BLEACH: { paths: [{ d: TRIANGLE }, { d: CROSS }] },
  TUMBLE_DRY_LOW: { paths: [{ d: SQUARE }, { d: CIRCLE }, dot(12, 11)] },
  TUMBLE_DRY_NORMAL: { paths: [{ d: SQUARE }, { d: CIRCLE }, dot(10.3, 11), dot(13.7, 11)] },
  DO_NOT_TUMBLE_DRY: { paths: [{ d: SQUARE }, { d: CIRCLE }, { d: CROSS }] },
  LINE_DRY: { paths: [{ d: SQUARE }, { d: "M4 7c4 3.5 12 3.5 16 0" }] },
  DRY_FLAT: { paths: [{ d: SQUARE }, { d: "M7.5 11h9" }] },
  DRY_IN_SHADE: { paths: [{ d: SQUARE }, { d: "M4 9l6-6" }, { d: "M12 7.5v8" }] },
  IRON_LOW: { paths: [{ d: IRON }, dot(12.5, 13.5, 2.4)] },
  IRON_MEDIUM: { paths: [{ d: IRON }, dot(10.5, 13.5, 2.4), dot(14.5, 13.5, 2.4)] },
  IRON_HIGH: { paths: [{ d: IRON }, dot(9, 13.5, 2.4), dot(12.5, 13.5, 2.4), dot(16, 13.5, 2.4)] },
  DO_NOT_IRON: { paths: [{ d: IRON }, { d: CROSS }] },
  DRY_CLEAN_P: { paths: [{ d: BIG_CIRCLE }], text: { value: "P", y: 14, size: 9 } },
  DRY_CLEAN_F: { paths: [{ d: BIG_CIRCLE }], text: { value: "F", y: 14, size: 9 } },
  WET_CLEAN: { paths: [{ d: BIG_CIRCLE }], text: { value: "W", y: 14, size: 9 } },
  DO_NOT_PROFESSIONAL_CLEAN: { paths: [{ d: BIG_CIRCLE }, { d: CROSS }] },
};

const BARS: Record<Gentleness, Path[]> = {
  NORMAL: [],
  GENTLE: [{ d: "M5 21h14" }],
  VERY_GENTLE: [{ d: "M5 21h14" }, { d: "M5 23.2h14" }],
};

export function CareSymbolIcon({
  symbol,
  gentleness = "NORMAL",
  size = 28,
  className,
}: {
  symbol: CareSymbol;
  gentleness?: Gentleness;
  size?: number;
  className?: string;
}) {
  const drawing = DRAWINGS[symbol];
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      data-care-symbol={symbol}
      style={{ display: "block", flex: "none", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" }}
    >
      {[...drawing.paths, ...BARS[gentleness]].map((p, i) => (
        <path key={i} d={p.d} style={{ strokeWidth: p.w ?? 1.5 }} />
      ))}
      {drawing.text && (
        <text
          x={12}
          y={drawing.text.y}
          style={{ fill: "currentColor", stroke: "none", textAnchor: "middle", fontFamily: "var(--font-mono), monospace", fontWeight: 600, fontSize: `${drawing.text.size}px` }}
        >
          {drawing.text.value}
        </text>
      )}
    </svg>
  );
}
