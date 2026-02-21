import { Stack } from "expo-router";
import React, { useEffect } from "react";
import { Platform, useColorScheme } from "react-native";
import {
  useFonts,
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
} from "@expo-google-fonts/outfit";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import { PortalProvider } from "@gorhom/portal";
import { AccountProvider } from "@/contexts/AccountContext";
import socketService from "@/services/socket.service";
import { theme } from "@/constants/theme";
import { StatusBar } from "expo-status-bar";
import { setupGlobalErrorHandler, setupConsoleOverride } from "@/utils/errorHandler";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://c506563770a3f78e29dd984fe34407a7@o4510577846714368.ingest.us.sentry.io/4510577847697408',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

// Prevent auto-hiding splash screen
SplashScreen.preventAutoHideAsync();

// Set the animation options
SplashScreen.setOptions({
  duration: 1000,
  fade: true,
});

// Setup global error handlers
setupGlobalErrorHandler();
setupConsoleOverride();

export default Sentry.wrap(function RootLayout() {
  const colorScheme = useColorScheme() || "dark";

  const [fontsLoaded] = useFonts({
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Outfit_900Black,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();

      // Initialize socket connection
      socketService.connect();
    }

    // Cleanup on unmount
    return () => {
      socketService.disconnect();
    };
  }, [fontsLoaded]);

  // Set navigation bar color for Android
  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setButtonStyleAsync(
        colorScheme === "light" ? "dark" : "light"
      );
      NavigationBar.setBackgroundColorAsync(
        colorScheme === "dark"
          ? theme.colors.dark.background
          : theme.colors.light.background
      );
    }
  }, [colorScheme]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AccountProvider>
      <PortalProvider>
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor:
                colorScheme === "dark"
                  ? theme.colors.dark.background
                  : theme.colors.light.background,
            },
          }}
        />
      </PortalProvider>
    </AccountProvider>
  );
});