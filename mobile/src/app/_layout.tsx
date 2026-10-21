import "@/lib/i18n";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, router } from "expo-router";
import * as NativeSplash from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NotificationBanner } from "@/components/NotificationBanner";
import { CaptureProvider } from "@/lib/capture";
import { configureNotifications } from "@/lib/notifications";
import { createQueryClient } from "@/lib/query-client";
import { restoreSession } from "@/lib/session";
import { useSession } from "@/lib/use-session";
import { SplashScreen } from "@/screens/SplashScreen";
import { fontAssets } from "@/theme/fonts";
import { ThemeProvider, useTheme } from "@/theme/theme";

void NativeSplash.preventAutoHideAsync();
configureNotifications();

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) NativeSplash.hide();
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <CaptureProvider>
            <Navigation />
          </CaptureProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * The stored session is restored first (design v0.8 91, "Oturumunuz açılıyor…"); then the signed-in routes and the
 * login guard each other, so a lost session lands on the login wherever the person was.
 */
function Navigation() {
  const session = useSession();
  const { scheme } = useTheme();
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    void restoreSession();
  }, []);

  const retry = async () => {
    setRetrying(true);
    await restoreSession();
    setRetrying(false);
  };

  if (session.status === "unknown" || (session.status === "unreachable" && retrying)) return <SplashScreen />;
  if (session.status === "unreachable") return <SplashScreen unreachable onRetry={() => void retry()} />;

  const signedIn = session.status === "authenticated";
  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="capture/index" />
          <Stack.Screen name="capture/step" />
          <Stack.Screen name="capture/camera" options={{ animation: "fade" }} />
          <Stack.Screen name="capture/review" />
          <Stack.Screen name="capture/upload" options={{ gestureEnabled: false }} />
          <Stack.Screen name="document/[id]" />
          <Stack.Screen name="document/approved" options={{ gestureEnabled: false }} />
          <Stack.Screen name="batch/[id]" />
          <Stack.Screen name="step/[id]" />
          <Stack.Screen name="notifications/ask" options={{ gestureEnabled: false }} />
          <Stack.Screen name="notifications/denied" />
          <Stack.Screen name="capture/queued" options={{ gestureEnabled: false }} />
          <Stack.Screen name="queue" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      {signedIn && <NotificationBanner onOpen={(target) => router.push(target as never)} />}
    </View>
  );
}
