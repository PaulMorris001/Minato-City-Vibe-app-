import { Stack } from "expo-router";
import React from "react";

import { useTheme } from "@/contexts/ThemeContext";
import { CreateEventProvider } from "@/contexts/CreateEventContext";

/**
 * Event creation: a basics screen plus optional detours (tiers, other
 * locations, sub-events, venue proof) — a hub, not a linear wizard. One draft
 * shared across all of them via CreateEventProvider, scoped to this group's
 * lifetime: entering mounts a fresh draft, leaving (success or back-out)
 * discards it. Mirrors birthday-raffle/_layout.tsx's Stack shape.
 */
export default function CreateEventLayout() {
  const { colors } = useTheme();

  return (
    <CreateEventProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.backgroundDeep },
          animation: "slide_from_right",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="tiers" />
        <Stack.Screen name="locations" />
        <Stack.Screen name="sub-events" />
        <Stack.Screen name="venue-proof" />
      </Stack>
    </CreateEventProvider>
  );
}
