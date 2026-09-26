import { cn } from "@/lib/utils";

/** Above this size the full mark is drawn; at or below it the simplified one (design A1 v0.2). */
const SIMPLIFIED_MAX = 24;

interface LogoMarkProps {
  size?: number;
  /** Cocoon and thread colour. */
  color?: string;
  /** Colour of the winding lines on the cocoon: the surface the mark sits on. */
  cutout?: string;
  className?: string;
  /** Force a variant (e.g. the favicon art) instead of choosing by size. */
  variant?: "full" | "simplified";
  title?: string;
}

/** A1 "Koza ipliği": a cocoon with winding lines and a thread unravelling from its tip. */
export function LogoMark({
  size = 24,
  color = "var(--brand)",
  cutout = "var(--background)",
  className,
  variant,
  title,
}: LogoMarkProps) {
  const simplified = variant ? variant === "simplified" : size <= SIMPLIFIED_MAX;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {simplified ? (
        <>
          <g transform="translate(13 18.5) rotate(35)">
            <ellipse rx="8.5" ry="11.5" fill={color} />
            <path
              d="M-7.2 -2.5Q0 0.5 7.2 -2.5M-6.8 4Q0 7 6.8 4"
              fill="none"
              stroke={cutout}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
          <path d="M19.6 9.2C22.5 5.5 25 9.5 29.5 3" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <g transform="translate(13 18.5) rotate(35)">
            <ellipse rx="8" ry="11" fill={color} />
            <path
              d="M-7.1 -4.5Q0 -2 7.1 -4.5M-7.8 0.6Q0 3.1 7.8 0.6M-6.8 5.6Q0 8 6.8 5.6"
              fill="none"
              stroke={cutout}
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </g>
          <path
            d="M19.3 9.5C20 6 24 5.5 24.5 8C25 10.5 21.5 10.5 22.5 7.5C23.5 4.5 27 4 30 2.5"
            fill="none"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
}

interface LogoProps {
  /** Mark size in px; the word mark scales with it as in the design (30→19, 24→16, 22→15). */
  size?: number;
  color?: string;
  cutout?: string;
  className?: string;
}

const WORDMARK_SIZE: Record<number, number> = { 30: 19, 24: 16, 22: 15 };

/** Mark + "KozaPass" word mark. */
export function Logo({ size = 22, color, cutout, className }: LogoProps) {
  const fontSize = WORDMARK_SIZE[size] ?? Math.round(size * 0.66);
  return (
    <span className={cn("inline-flex items-center", size >= 30 ? "gap-2.5" : "gap-2", className)}>
      <LogoMark size={size} color={color} cutout={cutout} />
      <span className="font-semibold tracking-[-0.03em]" style={{ fontSize }}>
        KozaPass
      </span>
    </span>
  );
}
