import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** App icon 180 (design A1 v0.2): full mark in cocoon cream on a mulberry tile. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#8C2F4B",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32">
          <g transform="translate(13 18.5) rotate(35)">
            <ellipse rx="8" ry="11" fill="#FAF6EE" />
            <path
              d="M-7.1 -4.5Q0 -2 7.1 -4.5M-7.8 0.6Q0 3.1 7.8 0.6M-6.8 5.6Q0 8 6.8 5.6"
              fill="none"
              stroke="#8C2F4B"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </g>
          <path
            d="M19.3 9.5C20 6 24 5.5 24.5 8C25 10.5 21.5 10.5 22.5 7.5C23.5 4.5 27 4 30 2.5"
            fill="none"
            stroke="#FAF6EE"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    size,
  );
}
