import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import axios from "axios";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import EmptyState from "@/components/shared/EmptyState";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

export interface ManualTopicSummary {
  slug: string;
  title: string;
  summary: string;
}

/** Icon per topic. Keyed by slug so the server stays free of client concerns. */
const TOPIC_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  events: "calendar-outline",
  guides: "book-outline",
  vendors: "storefront-outline",
};

/**
 * The how-to manual index.
 *
 * Content is fetched rather than bundled so the same words back the website's
 * /help pages and a copy edit doesn't need an app store release.
 */
export default function HelpScreen() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [topics, setTopics] = useState<ManualTopicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await axios.get(`${BASE_URL}/manual`);
      setTopics(res.data?.topics ?? []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <LinearGradient
        colors={[colors.background, colors.backgroundSecondary, colors.backgroundTertiary]}
        style={styles.header}
      >
        <GlassBackButton style={styles.backButton} />
        <View>
          <Text style={styles.headerTitle}>How it works</Text>
          <Text style={styles.headerSubtitle}>Guides for hosts, writers and businesses</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Everything you need to run an event, publish a city guide or set up your business —
          written out, start to finish.
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : failed ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load the guides"
            subtitle="Check your connection and try again."
            actionLabel="Retry"
            onAction={load}
          />
        ) : (
          topics.map((topic) => (
            <TouchableOpacity
              key={topic.slug}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(`/help/${topic.slug}` as any)}
            >
              <View style={styles.cardIcon}>
                <Ionicons
                  name={TOPIC_ICONS[topic.slug] ?? "help-circle-outline"}
                  size={22}
                  color={colors.primary}
                />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{topic.title}</Text>
                <Text style={styles.cardSummary}>{topic.summary}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      paddingTop: Platform.OS === "android" ? StatusBar.currentHeight! + 16 : 60,
      paddingBottom: 20,
      paddingHorizontal: getResponsivePadding(),
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 12,
    },
    backButton: { padding: 4, marginBottom: 2 },
    headerTitle: { fontSize: scaleFontSize(26), fontFamily: Fonts.bold, color: c.text },
    headerSubtitle: {
      fontSize: scaleFontSize(13),
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      marginTop: 2,
    },
    content: { padding: getResponsivePadding(), paddingBottom: 40 },
    intro: {
      fontSize: scaleFontSize(15),
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      lineHeight: 22,
      marginBottom: 24,
    },
    loading: { paddingVertical: 40, alignItems: "center" },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    cardIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.primaryFaded,
    },
    cardText: { flex: 1, minWidth: 0 },
    cardTitle: { fontSize: scaleFontSize(16), fontFamily: Fonts.semiBold, color: c.text },
    cardSummary: {
      fontSize: scaleFontSize(13),
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      lineHeight: 19,
      marginTop: 3,
    },
    bottomPad: { height: 20 },
  });
