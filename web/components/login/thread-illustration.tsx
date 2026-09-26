import { useTranslations } from "next-intl";

/*
 * Design F: a thread leaves the cocoon and passes the four supply-chain stages. The story panel is a
 * fixed light "cocoon" surface in both themes, so the colours are the design's literal brand values.
 */
const BRAND = "#8C2F4B";
const COCOON = "#FAF6EE";
const INK = "#1F1E1C";
const LABEL = "#57534C";

const STAGES = ["yarn", "fabric", "dye", "garment"] as const;

/** Desktop, 720 × 320. */
export function ThreadIllustration() {
  const t = useTranslations("login");
  const points = [
    [290, 150],
    [400, 212],
    [510, 128],
    [620, 192],
  ] as const;
  return (
    <svg viewBox="0 0 720 320" className="h-auto w-full overflow-visible" role="img" aria-label={t("illustrationLabel")}>
      <g transform="translate(96 196) rotate(35)">
        <ellipse rx="52" ry="72" fill={BRAND} />
        <path
          d="M-46 -30Q0 -14 46 -30M-51 2Q0 18 51 2M-45 34Q0 50 45 34"
          fill="none"
          stroke={COCOON}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      <path
        d="M137 137C142 112 168 100 176 118C184 136 158 146 156 128C154 106 190 92 230 112C258 126 262 150 290 150S360 212 400 212S470 128 510 128S580 192 620 192C652 192 672 172 704 170"
        fill="none"
        stroke={BRAND}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {points.map(([cx, cy], i) => (
        <g key={STAGES[i]}>
          <circle cx={cx} cy={cy} r="6" fill={COCOON} stroke={INK} strokeWidth="1.5" />
          <text x={cx} y={cy + 30} textAnchor="middle" fill={LABEL} className="font-mono" fontSize="12">
            {t(`stages.${STAGES[i]}`)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Mobile, 342 × 72. */
export function ThreadIllustrationCompact() {
  const t = useTranslations("login");
  const points = [
    [100, 40],
    [170, 22],
    [240, 44],
    [310, 26],
  ] as const;
  return (
    <svg viewBox="0 0 342 72" className="h-auto w-full overflow-visible" role="img" aria-label={t("illustrationLabel")}>
      <g transform="translate(24 42) rotate(35)">
        <ellipse rx="13" ry="18" fill={BRAND} />
        <path d="M-11.5 -5Q0 -1 11.5 -5M-11 5Q0 9 11 5" fill="none" stroke={COCOON} strokeWidth="1.5" strokeLinecap="round" />
      </g>
      <path
        d="M34 27C40 14 52 16 50 26C48 34 40 28 46 20C60 6 75 40 100 40S150 22 170 22S215 44 240 44S290 26 310 26C322 26 330 28 338 30"
        fill="none"
        stroke={BRAND}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      {points.map(([cx, cy], i) => (
        <g key={STAGES[i]}>
          <circle cx={cx} cy={cy} r="3.5" fill={COCOON} stroke={INK} strokeWidth="1.2" />
          <text x={cx} y={cy + 18} textAnchor="middle" fill={LABEL} className="font-mono" fontSize="9">
            {t(`stages.${STAGES[i]}`)}
          </text>
        </g>
      ))}
    </svg>
  );
}
