import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import GlassBackButton from "@/components/shared/GlassBackButton";
import EmptyState from "@/components/shared/EmptyState";
import { externalEventService } from "@/services/externalEvent.service";
import { fetchWithCache } from "@/utils/offlineCache";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

/**
 * The full text of an event description.
 *
 * The event screen clamps its ABOUT card to a few lines; this is where "Read
 * more" lands. It re-fetches by id rather than taking the text as a route
 * param — expo-router serializes params into persisted navigation state, and a
 * few thousand characters of description do not belong there.
 *
 * Reads through the offline cache, so a description opened once is still
 * readable with no connection.
 */
export default function EventDescriptionScreen() {
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const styles = useThemedStyles(createStyles);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        if (source === "external") {
          const { event } = await externalEventService.getById(id);
          if (cancelled) return;
          setTitle(event.title || "");
          setDescription(event.description || "");
          return;
        }

        const token = await SecureStore.getItemAsync("token");
        const { data } = await fetchWithCache<{ event?: { title?: string; description?: string } }>(
          `${BASE_URL}/events/${id}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            cacheKey: `event:${id}`,
          }
        );
        if (cancelled) return;
        setTitle(data?.event?.title || "");
        setDescription(data?.event?.description || "");
      } catch {
        // Leaves `description` empty, which renders the empty state below.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, source]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <GlassBackButton size={38} />
          <Text style={styles.headerTitle} numberOfLines={2}>
            {title || "About this event"}
          </Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : description ? (
          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.microLabel}>ABOUT</Text>
            <Text style={styles.text} selectable>
              {description}
            </Text>
          </ScrollView>
        ) : (
          <EmptyState
            icon="document-text-outline"
            title="Nothing to show"
            subtitle="This event's description couldn't be loaded."
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.backgroundDeep },
    safe: { flex: 1 },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      paddingTop: 8,
      paddingHorizontal: 22,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      marginBottom: 12,
    },
    headerTitle: {
      flex: 1,
      fontFamily: "BricolageGrotesque_800ExtraBold",
      fontSize: 22,
      color: c.textBright,
      letterSpacing: -0.6,
    },
    body: { paddingHorizontal: 22, paddingBottom: 48 },
    microLabel: {
      fontFamily: Fonts.bold,
      fontSize: 10,
      letterSpacing: 1.2,
      color: c.textMuted,
      marginBottom: 10,
    },
    text: {
      fontFamily: Fonts.regular,
      fontSize: 15.5,
      lineHeight: 24,
      color: c.text,
    },
  });
