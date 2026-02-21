import React, { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { View, ActivityIndicator } from "react-native";

type AppState = "checking" | "onboarding" | "login" | "home";

export default function Index() {
  const [appState, setAppState] = useState<AppState>("checking");

  useEffect(() => {
    const checkAppState = async () => {
      const token = await SecureStore.getItemAsync("token");
      const hasSeenOnboarding = await SecureStore.getItemAsync("hasSeenOnboarding");

      if (!token) {
        // Not logged in - check if new user needs onboarding
        if (!hasSeenOnboarding) {
          setAppState("onboarding");
        } else {
          setAppState("login");
        }
      } else {
        // Logged in - go to home
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

  if (appState === "onboarding") {
    return <Redirect href="/onboarding" />;
  }

  if (appState === "login") {
    return <Redirect href="/login" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
