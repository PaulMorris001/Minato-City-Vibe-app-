import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  Platform,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams } from "expo-router";
import axios from "axios";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import EmptyState from "@/components/shared/EmptyState";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface ManualSection {
  heading: string;
  body: string;
  bullets?: string[];
}

interface ManualTopic {
  slug: string;
  title: string;
  summary: string;
  sections: ManualSection[];
}

/** One manual topic, rendered from the API's structured sections. */
export default function HelpTopicScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [topic, setTopic] = useState<ManualTopic | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setFailed(false);
    try {
      const res = await axios.get(`${BASE_URL}/manual/${slug}`);
      setTopic(res.data?.topic ?? null);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

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
        <View style={styles.headerText}>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {topic?.title ?? "How it works"}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : failed || !topic ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load this guide"
            subtitle="Check your connection and try again."
            actionLabel="Retry"
            onAction={load}
          />
        ) : (
          <>
            <Text style={styles.intro}>{topic.summary}</Text>
            {topic.sections.map((section) => (
              <View key={section.heading} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.heading}</Text>
                <Text style={styles.sectionBody}>{section.body}</Text>
                {section.bullets?.map((bullet) => (
                  <View key={bullet} style={styles.bulletRow}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ))}
          </>
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
    headerText: { flex: 1, minWidth: 0 },
    headerTitle: { fontSize: scaleFontSize(26), fontFamily: Fonts.bold, color: c.text },
    content: { padding: getResponsivePadding(), paddingBottom: 40 },
    loading: { paddingVertical: 40, alignItems: "center" },
    intro: {
      fontSize: scaleFontSize(15),
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      lineHeight: 22,
      marginBottom: 24,
    },
    section: {
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    sectionTitle: {
      fontSize: scaleFontSize(16),
      fontFamily: Fonts.semiBold,
      color: c.text,
      marginBottom: 8,
    },
    sectionBody: {
      fontSize: scaleFontSize(14),
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      lineHeight: 21,
    },
    bulletRow: { flexDirection: "row", gap: 8, marginTop: 10 },
    bulletDot: {
      fontSize: scaleFontSize(14),
      fontFamily: Fonts.regular,
      color: c.primary,
      lineHeight: 21,
    },
    bulletText: {
      flex: 1,
      fontSize: scaleFontSize(14),
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      lineHeight: 21,
    },
    bottomPad: { height: 20 },
  });
