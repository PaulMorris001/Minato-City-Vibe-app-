import { Stack, router } from "expo-router";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import messaging from "@react-native-firebase/messaging";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications } from "@/utils/pushNotifications";
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
import ErrorBoundary from "@/components/ErrorBoundary";

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

// Show notifications when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Create Android notification channel at module load so it exists before any push arrives
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
    vibrationPattern: [0, 250, 250, 250],
  });
}

// Handle Firebase messages received while app is in the background/quit
// Guarded: Firebase native SDK may not be ready immediately on first launch
try {
  messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log("[PushNotif] Background message:", remoteMessage.notification?.title);
  });
} catch (e) {
  console.warn("[PushNotif] Background handler registration failed:", e);
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

  useEffect(() => {
    let unsubscribeForeground: (() => void) | null = null;
    let unsubscribeBackground: (() => void) | null = null;

    try {
      // Firebase doesn't auto-display notifications in the foreground — do it manually
      unsubscribeForeground = messaging().onMessage(async remoteMessage => {
        console.log("[PushNotif] Foreground message:", remoteMessage.notification?.title, remoteMessage.notification?.body);
        await Notifications.scheduleNotificationAsync({
          content: {
            title: remoteMessage.notification?.title ?? "",
            body: remoteMessage.notification?.body ?? "",
            data: remoteMessage.data ?? {},
            sound: "default",
          },
          trigger: null,
        });
      });

      // Handle tap on FCM notification when app was in the background
      unsubscribeBackground = messaging().onNotificationOpenedApp(remoteMessage => {
        const data = remoteMessage.data as any;
        if (data?.type === "new_message" && data?.chatId) {
          router.push(`/chat/${data.chatId}` as any);
        }
      });

      // Handle tap that cold-starts the app from a quit state
      messaging().getInitialNotification().then(remoteMessage => {
        if (remoteMessage) {
          const data = remoteMessage.data as any;
          if (data?.type === "new_message" && data?.chatId) {
            router.push(`/chat/${data.chatId}` as any);
          }
        }
      });
    } catch (e) {
      console.warn("[PushNotif] Firebase messaging setup failed:", e);
    }

    // Handle tap on an expo-scheduled notification (foreground case)
    const notifSub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as any;
      if (data?.type === "new_message" && data?.chatId) {
        router.push(`/chat/${data.chatId}` as any);
      }
    });

    return () => {
      unsubscribeForeground?.();
      notifSub.remove();
      unsubscribeBackground?.();
    };
  }, []);

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
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
});