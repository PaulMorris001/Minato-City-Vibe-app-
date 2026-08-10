import React, { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { View, ActivityIndicator } from "react-native";
import { consumePendingDeepLink, deepLinkToPath } from "@/utils/pendingDeepLink";

import { useTheme } from "@/contexts/ThemeContext";
type AppState = "checking" | "onboarding" | "login" | "home" | "deeplink" | "vendorSetup";

export default function Index() {
  const { colors } = useTheme();
  const [appState, setAppState] = useState<AppState>("checking");
  const [deepLinkPath, setDeepLinkPath] = useState<string | null>(null);

  useEffect(() => {
    const checkAppState = async () => {
      const token = await SecureStore.getItemAsync("token");
      const hasSeenOnboarding = await SecureStore.getItemAsync("hasSeenOnboarding");

      if (!token) {
        // Not logged in — drop any pending deep link from a stale notification
        // tap (a chat link would just 401). New users see onboarding; returning
        // guests land on Home and can browse without an account (sign-up is
        // prompted only when they take an action).
        consumePendingDeepLink();
        setAppState(hasSeenOnboarding ? "home" : "onboarding");
        return;
      }

      // Logged in — see if a notification or universal link is waiting for us.
      // A deep link wins over vendor setup: someone opening a shared event
      // should get the event, not a form.
      const pending = consumePendingDeepLink();
      const path = pending ? deepLinkToPath(pending) : null;
      if (path) {
        setDeepLinkPath(path);
        setAppState("deeplink");
        return;
      }

      // Signed up as a business and never finished the details form — resume it
      // instead of opening the client app they never asked for.
      try {
        const raw = await SecureStore.getItemAsync("user");
        const u = raw ? JSON.parse(raw) : null;
        if (u?.vendorSignupPending && !u?.isVendor) {
          setAppState("vendorSetup");
          return;
        }
      } catch {
        // Unparseable stored user — fall through to Home.
      }

      setAppState("home");
    };
    checkAppState();
  }, []);

  if (appState === "checking") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (appState === "onboarding") return <Redirect href="/onboarding" />;
  if (appState === "login") return <Redirect href="/login" />;
  if (appState === "deeplink" && deepLinkPath) return <Redirect href={deepLinkPath as any} />;
  if (appState === "vendorSetup") return <Redirect href={"/vendor-setup" as any} />;
  return <Redirect href="/(tabs)/home" />;
}
