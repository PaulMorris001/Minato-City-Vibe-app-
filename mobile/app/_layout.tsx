import { Stack, router } from "expo-router";
import React, { useEffect, useCallback } from "react";
import { Platform, Linking } from "react-native";
import messaging from "@react-native-firebase/messaging";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications } from "@/utils/pushNotifications";
import {
  setPendingDeepLink,
  deepLinkToPath,
  looksLikeObjectId,
  type PendingDeepLink,
} from "@/utils/pendingDeepLink";
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
import {
  BricolageGrotesque_500Medium,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
} from "@expo-google-fonts/bricolage-grotesque";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import { PortalProvider } from "@gorhom/portal";
import { AccountProvider } from "@/contexts/AccountContext";
import { UnreadProvider } from "@/contexts/UnreadContext";
import socketService from "@/services/socket.service";
import { StripeProvider } from "@stripe/stripe-react-native";
import { theme } from "@/constants/theme";
import { StatusBar } from "expo-status-bar";
import { setupGlobalErrorHandler, setupConsoleOverride } from "@/utils/errorHandler";
import * as Sentry from '@sentry/react-native';
import ErrorBoundary from "@/components/ErrorBoundary";

Sentry.init({
  dsn: 'https://b73520e1b6648db41574a92098b42ec2@o4510577981915136.ingest.us.sentry.io/4510577983356928',
  // dsn: 'https://c506563770a3f78e29dd984fe34407a7@o4510577846714368.ingest.us.sentry.io/4510577847697408',

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
    BricolageGrotesque_500Medium,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
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

    /**
     * Parse a notification data payload into a structured deep link, or null
     * if it isn't routable. Logs the raw payload either way so we have
     * something to look at when reports come in.
     */
    const linkFromNotificationData = (data: unknown, source: string): PendingDeepLink | null => {
      console.log(`[PushNotif] ${source} payload:`, JSON.stringify(data));
      if (!data || typeof data !== "object") return null;
      const d = data as Record<string, unknown>;
      const type = typeof d.type === "string" ? d.type : null;

      if (type === "new_message" && looksLikeObjectId(d.chatId)) {
        return { kind: "chat", chatId: d.chatId };
      }
      if (type === "new_follower" && typeof d.followerId === "string" && d.followerId) {
        return { kind: "user", userId: d.followerId };
      }
      console.warn("[PushNotif] payload was not routable:", type, d);
      return null;
    };

    /**
     * Attempt to route immediately. If the navigator isn't ready yet (cold
     * start, before the initial route mounts) the push silently no-ops, so
     * we ALSO park the link in the pending store — index.tsx will pick it
     * up after the auth check resolves.
     */
    const route = (link: PendingDeepLink | null) => {
      if (!link) return;
      setPendingDeepLink(link);
      const path = deepLinkToPath(link);
      if (!path) return;
      try {
        router.push(path as any);
      } catch (err) {
        console.warn("[PushNotif] router.push threw, will rely on pending queue:", err);
      }
    };

    try {
      // Firebase doesn't auto-display notifications in the foreground — do it manually
      unsubscribeForeground = messaging().onMessage(async remoteMessage => {
        console.log("[PushNotif] Foreground message:", remoteMessage.notification?.title);
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

      // Tap while app was backgrounded
      unsubscribeBackground = messaging().onNotificationOpenedApp(remoteMessage => {
        route(linkFromNotificationData(remoteMessage?.data, "onNotificationOpenedApp"));
      });

      // Tap that cold-started the app from a quit state
      messaging().getInitialNotification().then(remoteMessage => {
        if (remoteMessage) {
          route(linkFromNotificationData(remoteMessage.data, "getInitialNotification"));
        }
      });
    } catch (e) {
      console.warn("[PushNotif] Firebase messaging setup failed:", e);
    }

    // Tap on an expo-scheduled notification (i.e. the one we displayed manually
    // while the app was in the foreground).
    const notifSub = Notifications.addNotificationResponseReceivedListener(response => {
      route(linkFromNotificationData(
        response.notification.request.content.data,
        "expoNotificationResponse"
      ));
    });

    return () => {
      unsubscribeForeground?.();
      notifSub.remove();
      unsubscribeBackground?.();
    };
  }, []);

  const routeDeepLink = useCallback((url: string | null) => {
    if (!url) return;
    try {
      const parsed = new URL(url);
      const isAppScheme = parsed.protocol === 'mobile:';
      // For custom schemes the URL parser puts the first segment into `host`
      // (e.g. `mobile://share/TOKEN` → host=`share`, pathname=`/TOKEN`).
      // For https Universal Links the segment is in the pathname instead.
      const segments = isAppScheme
        ? [parsed.host, ...parsed.pathname.split('/').filter(Boolean)]
        : parsed.pathname.split('/').filter(Boolean);

      const [kind, token] = segments;
      if (!token) return;

      console.log("[DeepLink] received url:", url, "→ kind:", kind, "token:", token);

      // Accept both the Universal Link shape (`/event/TOKEN`) and the web
      // landing page's redirect (`mobile://share/TOKEN`) for events.
      let link: PendingDeepLink | null = null;
      if (kind === 'event' || kind === 'share') {
        link = { kind: 'event', token };
      } else if (kind === 'guide') {
        link = { kind: 'guide', token };
      }

      if (!link) return;

      // Park the link in the pending queue AND attempt to push right now.
      // The queue covers the cold-start race where router.push runs before
      // index.tsx has finished routing — index.tsx will pick it up and
      // redirect there instead of `/(tabs)/home`.
      setPendingDeepLink(link);
      const path = deepLinkToPath(link);
      if (!path) return;
      try {
        router.push(path as any);
      } catch (err) {
        console.warn("[DeepLink] router.push threw, relying on pending queue:", err);
      }
    } catch (err) {
      console.warn("[DeepLink] failed to parse url:", url, err);
    }
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then(routeDeepLink);
    const sub = Linking.addEventListener('url', ({ url }) => routeDeepLink(url));
    return () => sub.remove();
  }, [routeDeepLink]);

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
        merchantIdentifier="merchant.com.nightvibe.minato"
      >
        <AccountProvider>
          <UnreadProvider>
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
          </UnreadProvider>
        </AccountProvider>
      </StripeProvider>
    </ErrorBoundary>
  );
});