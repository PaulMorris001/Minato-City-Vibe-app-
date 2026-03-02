import { Stack } from "expo-router";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
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
import { StripeProvider } from "@stripe/stripe-react-native";
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

// Show notifications even when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotifications() {
  if (!Device.isDevice) return; // Push notifications don't work on simulators

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return;

  let token: string | undefined;
  try {
    const result = await Notifications.getExpoPushTokenAsync({
      projectId: "a1e5c06d-26a5-4e05-89d9-3b9acf9a3ea4",
    });
    token = result.data;
  } catch {
    // Expo Go (SDK 53+) doesn't support remote push tokens — silently skip
    return;
  }

  const authToken = await SecureStore.getItemAsync("token");
  if (authToken && token) {
    try {
      await fetch(`${BASE_URL}/notifications/token`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ token }),
      });
    } catch (err) {
      console.error("Failed to save push token:", err);
    }
  }
}

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
      socketService.connect();
      registerForPushNotifications();
    }

    return () => {
      socketService.disconnect();
    };
  }, [fontsLoaded]);

  // Set navigation bar color for Android
  useEffect(() => {
    if (Platform.OS === "android") {
      NavigationBar.setButtonStyleAsync("light");
      NavigationBar.setBackgroundColorAsync(theme.colors.dark.background);
    }
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <StripeProvider
      publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
      merchantIdentifier="merchant.com.nightvibe.mobile"
    >
      <AccountProvider>
        <PortalProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: theme.colors.dark.background,
              },
            }}
          />
        </PortalProvider>
      </AccountProvider>
    </StripeProvider>
  );
});