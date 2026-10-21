/**
 * The design tokens of KozaPass (docs/design/v0.8/globals.css), the ones the app uses, light and dark. The web and the
 * app share the values; React Native has no CSS variables, so they live here.
 */
export interface Status {
  dot: string;
  fg: string;
  muted: string;
}

export interface Palette {
  background: string;
  foreground: string;
  card: string;
  popover: string;
  primary: string;
  primaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  input: string;
  ring: string;
  brand: string;
  brandForeground: string;
  brandMuted: string;
  brandText: string;
  destructive: string;
  destructiveForeground: string;
  skeleton: string;
  scrim: string;
  story: string;
  silk: string;
  status: Record<"pending" | "submitted" | "approved" | "rejected" | "lowConfidence" | "expiring", Status>;
}

export type StatusKind = keyof Palette["status"];

export const light: Palette = {
  background: "#FCFBF9",
  foreground: "#1C1B19",
  card: "#FFFFFF",
  popover: "#FFFFFF",
  primary: "#1F1E1C",
  primaryForeground: "#FAF8F4",
  muted: "#F2F0EC",
  mutedForeground: "#6B665E",
  border: "#E6E3DD",
  input: "#D2CEC6",
  ring: "#8C2F4B",
  brand: "#8C2F4B",
  brandForeground: "#FFFFFF",
  brandMuted: "#F5E8EC",
  brandText: "#8C2F4B",
  destructive: "#B42318",
  destructiveForeground: "#FFFFFF",
  skeleton: "#ECE9E4",
  scrim: "rgba(28, 27, 25, 0.42)",
  story: "#FAF6EE",
  silk: "#EFE6D8",
  status: {
    pending: { dot: "#8A857C", fg: "#57534C", muted: "#F1EFEB" },
    submitted: { dot: "#2F6FDB", fg: "#1F5BB8", muted: "#E8F0FB" },
    approved: { dot: "#22945A", fg: "#1E7042", muted: "#E6F4EC" },
    rejected: { dot: "#D92D20", fg: "#B42318", muted: "#FDECEA" },
    lowConfidence: { dot: "#D99A06", fg: "#8A5A00", muted: "#FDF3DC" },
    expiring: { dot: "#E8680C", fg: "#B54708", muted: "#FEEFE3" },
  },
};

export const dark: Palette = {
  background: "#0F1218",
  foreground: "#E9E7E3",
  card: "#151922",
  popover: "#1B202A",
  primary: "#E9E7E3",
  primaryForeground: "#151922",
  muted: "#1B202A",
  mutedForeground: "#AEB4BF",
  border: "#262C38",
  input: "#303746",
  ring: "#D98AA3",
  brand: "#D98AA3",
  brandForeground: "#1A0C12",
  brandMuted: "#2E1A22",
  brandText: "#E6A5B9",
  destructive: "#C23B2F",
  destructiveForeground: "#FFFFFF",
  skeleton: "#1F2531",
  scrim: "rgba(4, 6, 10, 0.66)",
  story: "#151922",
  silk: "#EFE6D8",
  status: {
    pending: { dot: "#8A93A3", fg: "#BDB8AF", muted: "#232833" },
    submitted: { dot: "#5B8FE8", fg: "#93B8F6", muted: "#16233A" },
    approved: { dot: "#3DB374", fg: "#86D3A5", muted: "#13291D" },
    rejected: { dot: "#EF5B4F", fg: "#F4A097", muted: "#34181A" },
    lowConfidence: { dot: "#E3AE2F", fg: "#F0C666", muted: "#2F2610" },
    expiring: { dot: "#F0853A", fg: "#F6A86F", muted: "#35220F" },
  },
};
