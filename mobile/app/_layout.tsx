import { Stack, router } from "expo-router";
import Toast from "react-native-toast-message";
import React, { useEffect, useCallback, useState } from "react";
import { Platform, Linking } from "react-native";
import { BASE_URL } from "@/constants/constants";
import messaging from "@react-native-firebase/messaging";
import * as Notifications from "expo-notifications";
import { registerForPushNotifications } from "@/utils/pushNotifications";
import {
  setPendingDeepLink,
  deepLinkToPath,
  looksLikeObjectId,
  type PendingDeepLink,
} from "@/utils/pendingDeepLink";
import { parseDeepLink } from "@/utils/deepLinkParser";
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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AccountProvider } from "@/contexts/AccountContext";
import { UnreadProvider } from "@/contexts/UnreadContext";
import socketService from "@/services/socket.service";
import { StripeProvider } from "@stripe/stripe-react-native";
import { theme } from "@/constants/theme";
import { StatusBar } from "expo-status-bar";
import { setupGlobalErrorHandler, setupConsoleOverride } from "@/utils/errorHandler";
import { setupApiClient } from "@/utils/apiClient";
import { checkBackendReachable } from "@/utils/reachability";
import * as Sentry from '@sentry/react-native';
import ErrorBoundary from "@/components/ErrorBoundary";

Sentry.init({
  dsn: 'https://7bdbc70f71d50069c92caff275f1243e@o4510577981915136.ingest.us.sentry.io/4511517861871616',
  // dsn: 'https://b73520e1b6648db41574a92098b42ec2@o4510577981915136.ingest.us.sentry.io/4510577983356928',
  // dsn: 'https://c506563770a3f78e29dd984fe34407a7@o4510577846714368.ingest.us.sentry.io/4510577847697408',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Crashes-only policy:
  // - We don't use Sentry.logger.* — disable to stop accidental log shipping.
  // - replaysSessionSampleRate=0 stops Sentry from recording a video for 10%
  //   of *every* session regardless of whether anything went wrong. Only
  //   sessions that experience an actual error get a replay (the
  //   replaysOnErrorSampleRate=1 path).
  // - Status/breadcrumb traces from the app go to Render via remoteLog
  //   (utils/remoteLog.ts) instead of Sentry.
  enableLogs: false,
  replaysSessionSampleRate: 0,
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

// Configure axios defaults (20s timeout, retry on transient network errors)
// for every call site in the app — no per-screen changes needed.
setupApiClient();

// Fire a /health probe (3 staggered attempts) so we know IMMEDIATELY when a
// user's network can't reach the backend, instead of waiting for a login
// attempt to silently hang. Sentry gets a single capture if all attempts
// fail; the rest of the app can read `getReachability()` to show a banner.
checkBackendReachable();

// Push notification `type` values that should deep-link to the event details
// screen. The payload carries an `eventId`. Add new types here as they ship.
const EVENT_PUSH_TYPES = new Set([
  "event",
  "event_reminder",
  "ticket_sold",
  "ticket_refunded",
  "paid_event_approved",
  "paid_event_rejected",
]);

// Push notification `type` values that should deep-link to a guide. Payload
// carries `guideId`.
const GUIDE_PUSH_TYPES = new Set(["guide", "guide_sold"]);

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

  // Publishable key: start from the build-time value as a fallback, then
  // override with the key the SERVER reports so it always matches the secret
  // key used to create PaymentIntents (same Stripe account + test/live mode).
  // This prevents the "client_secret does not match any associated
  // PaymentIntent" error that occurs when a build's baked-in key drifts out of
  // sync with the server's mode.
  const [stripeKey, setStripeKey] = useState(
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/stripe/config`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.publishableKey) {
          setStripeKey(data.publishableKey);
        }
      } catch {
        // Keep the build-time fallback if the server is unreachable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      // Event-related pushes — server sends these with `eventId` in the payload.
      // Routes through the `event` queue kind so the cold-start path lands on
      // /share/[token] (which accepts both shareToken and _id).
      if (
        EVENT_PUSH_TYPES.has(type ?? "") &&
        typeof d.eventId === "string" &&
        d.eventId
      ) {
        return { kind: "event", token: d.eventId };
      }
      // Guide-related pushes.
      if (
        GUIDE_PUSH_TYPES.has(type ?? "") &&
        typeof d.guideId === "string" &&
        d.guideId
      ) {
        return { kind: "guide", token: d.guideId };
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
    const parsed = parseDeepLink(url);
    if (!parsed) {
      // Unknown host/scheme/kind/segment — silently ignore. Keeps us from
      // reacting to URLs that aren't ours (Safari bookmarks etc.).
      return;
    }
    console.log("[DeepLink] parsed:", url, "→", parsed.pathname, parsed.params);

    // IMPORTANT: do NOT call router.push here. expo-router auto-routes URL
    // deep links (Universal Links + custom scheme) to the matching file route
    // via its built-in linking config — pushing again would mount the screen
    // twice and the second mount's failed fetch would alert over the working
    // first one. We only park the link in the pending queue as a safety net
    // for cold starts where index.tsx mounts (e.g. via notification taps),
    // in case index.tsx's redirect needs to know about a URL we received
    // around the same time.
    let link: PendingDeepLink | null = null;
    if (parsed.pathname === "/event/[id]" || parsed.pathname === "/share/[token]") {
      const token = parsed.params.id ?? parsed.params.token;
      if (token) link = { kind: "event", token };
    } else if (parsed.pathname === "/guide/[id]") {
      if (parsed.params.id) link = { kind: "guide", token: parsed.params.id };
    } else if (parsed.pathname === "/user/[id]") {
      if (parsed.params.id) link = { kind: "user", userId: parsed.params.id };
    }
    if (link) setPendingDeepLink(link);
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
        <StripeProvider publishableKey={stripeKey}>
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
              <Toast />
            </PortalProvider>
            </UnreadProvider>
          </AccountProvider>
        </StripeProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
});