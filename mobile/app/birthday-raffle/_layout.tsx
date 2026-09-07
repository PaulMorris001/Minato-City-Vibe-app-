import { useTheme } from "@/contexts/ThemeContext";
import { Stack } from "expo-router";
import React from "react";

export default function BirthdayRaffleLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.backgroundDeep,
        },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="status" />
    </Stack>
  );
}