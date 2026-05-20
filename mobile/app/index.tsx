import React, { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { View, ActivityIndicator } from "react-native";
import { consumePendingDeepLink, deepLinkToPath } from "@/utils/pendingDeepLink";

type AppState = "checking" | "onboarding" | "login" | "home" | "deeplink";

export default function Index() {
  const [appState, setAppState] = useState<AppState>("checking");
  const [deepLinkPath, setDeepLinkPath] = useState<string | null>(null);

  useEffect(() => {
    const checkAppState = async () => {
      const token = await SecureStore.getItemAsync("token");
      const hasSeenOnboarding = await SecureStore.getItemAsync("hasSeenOnboarding");

      if (!token) {
        // Not logged in — if there's a pending deep link from a stale notification
        // tap, drop it. The user needs to log in first; pushing them straight to
        // a chat would just 401.
        consumePendingDeepLink();
        setAppState(hasSeenOnboarding ? "login" : "onboarding");
        return;
      }

      // Logged in — see if a notification or universal link is waiting for us.
      const pending = consumePendingDeepLink();
      const path = pending ? deepLinkToPath(pending) : null;
      if (path) {
        setDeepLinkPath(path);
        setAppState("deeplink");
      } else {
        setAppState("home");
      }
    };
    checkAppState();
  }, []);

  if (appState === "checking") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f0f1a" }}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  if (appState === "onboarding") return <Redirect href="/onboarding" />;
  if (appState === "login") return <Redirect href="/login" />;
  if (appState === "deeplink" && deepLinkPath) return <Redirect href={deepLinkPath as any} />;
  return <Redirect href="/(tabs)/home" />;
}
