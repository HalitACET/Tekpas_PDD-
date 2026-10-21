import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from "@expo-google-fonts/geist";
import { GeistMono_400Regular, GeistMono_500Medium, GeistMono_600SemiBold } from "@expo-google-fonts/geist-mono";
import { Newsreader_400Regular } from "@expo-google-fonts/newsreader";

/** The design's three families (Geist, Geist Mono, Newsreader for headings); a family per weight, as React Native wants. */
export const fontAssets = {
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
  Newsreader_400Regular,
};

export const fonts = {
  sans: "Geist_400Regular",
  sansMedium: "Geist_500Medium",
  sansSemi: "Geist_600SemiBold",
  mono: "GeistMono_400Regular",
  monoMedium: "GeistMono_500Medium",
  monoSemi: "GeistMono_600SemiBold",
  serif: "Newsreader_400Regular",
};
