import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Switch,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import axios from "axios";
import * as SecureStore from "expo-secure-store";

import { Colors } from "@/constants/colors";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { scaleFontSize } from "@/utils/responsive";
import { showError } from "@/utils/toast";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";

/**
 * Which notifications the user receives. The server keeps these under
 * `user.notificationPrefs` and gates push delivery per category (see
 * server/src/services/notification.service.js). The in-app notification feed
 * (`/notifications`) always records everything regardless — this only controls
 * what pushes to the device, on top of the OS-level permission.
 */
type PrefKey =
  | "newFollowers"
  | "messages"
  | "eventUpdates"
  | "sales"
  | "payouts"
  | "eventReminderEmails";

type Prefs = Record<PrefKey, boolean>;

const DEFAULT_PREFS: Prefs = {
  newFollowers: true,
  messages: true,
  eventUpdates: true,
  sales: true,
  payouts: true,
  eventReminderEmails: true,
};

const PUSH_ROWS: { key: PrefKey; icon: keyof typeof Ionicons.glyphMap; label: string; hint: string }[] = [
  {
    key: "newFollowers",
    icon: "person-add-outline",
    label: "New followers",
    hint: "When someone starts following you.",
  },
  {
    key: "messages",
    icon: "chatbubble-ellipses-outline",
    label: "Messages",
    hint: "New direct and group chat messages.",
  },
  {
    key: "eventUpdates",
    icon: "calendar-outline",
    label: "Event invites & updates",
    hint: "Invites, accepted invites and changes to events you're on.",
  },
  {
    key: "sales",
    icon: "pricetag-outline",
    label: "Ticket & guide sales",
    hint: "Ticket sales, guide sales, bookings and order updates.",
  },
  {
    key: "payouts",
    icon: "cash-outline",
    label: "Payouts",
    hint: "Payout queued, paid, or needing your attention.",
  },
];

const EMAIL_ROWS: { key: PrefKey; icon: keyof typeof Ionicons.glyphMap; label: string; hint: string }[] = [
  {
    key: "eventReminderEmails",
    icon: "mail-outline",
    label: "Event reminder emails",
    hint: "A reminder the day before an event you're going to.",
  },
];

export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  // Per-key in-flight guard so a fast double-tap can't race two PUTs.
  const [saving, setSaving] = useState<Partial<Record<PrefKey, boolean>>>({});
  const hasLoadedOnceRef = useRef(false);

  const fetchPrefs = useCallback(async () => {
    if (!hasLoadedOnceRef.current) setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${BASE_URL}/notifications/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const incoming = res.data?.preferences ?? {};
      setPrefs({ ...DEFAULT_PREFS, ...incoming });
    } catch {
      showError("Couldn't load your notification preferences.");
    } finally {
      setLoading(false);
      hasLoadedOnceRef.current = true;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPrefs();
    }, [fetchPrefs])
  );

  /** Optimistic toggle — reverts if the server rejects the change. */
  const toggle = async (key: PrefKey, value: boolean) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const token = await SecureStore.getItemAsync("token");
      await axios.put(
        `${BASE_URL}/notifications/preferences`,
        { [key]: value },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch {
      setPrefs((prev) => ({ ...prev, [key]: !value }));
      showError("Couldn't update that preference. Please try again.");
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  };

  const renderRow = (
    row: { key: PrefKey; icon: keyof typeof Ionicons.glyphMap; label: string; hint: string },
    isLast: boolean
  ) => (
    <View
      key={row.key}
      style={[styles.row, isLast && { borderBottomWidth: 0 }]}
    >
      <View style={styles.rowLeft}>
        <Ionicons name={row.icon} size={22} color={Colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowHint}>{row.hint}</Text>
        </View>
      </View>
      <Switch
        value={prefs[row.key]}
        onValueChange={(v) => toggle(row.key, v)}
        disabled={!!saving[row.key]}
        trackColor={{ false: colors.borderMuted, true: Colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading preferences…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <View>
          <Text style={styles.headerTitle}>Notifications</Text>
          <Text style={styles.headerSubtitle}>Choose what we notify you about</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Push</Text>
        <Text style={styles.sectionDescription}>
          These apply on top of your device's notification permission. Turning one
          off stops the push — you'll still see it in your notification feed.
        </Text>
        {PUSH_ROWS.map((row, i) => renderRow(row, i === PUSH_ROWS.length - 1))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Email</Text>
        {EMAIL_ROWS.map((row, i) => renderRow(row, i === EMAIL_ROWS.length - 1))}
      </View>
    </ScrollView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      paddingTop: 60,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: c.background,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 16,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
    },
    header: {
      padding: 24,
      paddingTop: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    backButton: {
      padding: 4,
    },
    headerTitle: { fontSize: scaleFontSize(22), fontFamily: Fonts.bold, color: c.text },
    headerSubtitle: {
      fontSize: 16,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      marginTop: 2,
    },
    section: {
      backgroundColor: c.card,
      marginHorizontal: 16,
      marginBottom: 16,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: c.border,
    },
    sectionTitle: {
      fontSize: 20,
      fontFamily: Fonts.bold,
      color: c.text,
      marginBottom: 8,
    },
    sectionDescription: {
      fontSize: 14,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      marginBottom: 12,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowLeft: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingRight: 8,
    },
    rowLabel: {
      fontSize: 16,
      fontFamily: Fonts.medium,
      color: c.textBody,
    },
    rowHint: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      marginTop: 2,
    },
  });
