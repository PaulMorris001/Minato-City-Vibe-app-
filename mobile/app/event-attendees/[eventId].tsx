import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { scaleFontSize } from "@/utils/responsive";
import { capitalize } from "@/libs/helpers";
import { openUserProfile } from "@/utils/userNavigation";
import { Avatar } from "@/components/shared/Avatar";
import UserListItemSkeleton from "@/components/skeletons/UserListItemSkeleton";
import { showError } from "@/utils/toast";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";

interface Signup {
  userId: string;
  username: string;
  profilePicture?: string;
  isGuest: boolean;
  type: "rsvp" | "ticket";
  ticketCount: number;
  tiers: string[];
  checkedIn: boolean;
  attendedAt: string | null;
  joinedAt: string | null;
}

interface SignupsResponse {
  total: number;
  rsvpCount: number;
  ticketCount: number;
  ticketsIssued: number;
  attendedCount: number;
  attendees: Signup[];
}

type Filter = "all" | "ticket" | "rsvp";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ticket", label: "Tickets" },
  { key: "rsvp", label: "RSVPs" },
];

/**
 * The organizer's guest list — everyone who RSVP'd or bought a ticket, one row
 * per person. Reached from the "Who's coming" card on the event screen; the
 * server gates it to the creator and co-hosts.
 */
export default function EventAttendeesScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { eventId } = useLocalSearchParams<{ eventId: string }>();

  const [data, setData] = useState<SignupsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const fetchSignups = useCallback(async () => {
    if (!eventId) return;
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/events/${eventId}/signups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showError(body.message || "Couldn't load the guest list.");
        return;
      }
      setData(await res.json());
    } catch (error) {
      console.error("Error fetching signups:", error);
      showError("Couldn't load the guest list.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchSignups();
  }, [fetchSignups]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSignups();
  }, [fetchSignups]);

  const attendees = useMemo(() => {
    const all = data?.attendees ?? [];
    return filter === "all" ? all : all.filter((a) => a.type === filter);
  }, [data, filter]);

  /** "2 tickets · VIP" / "RSVP", plus the check-in state once scanned. */
  const subtitleFor = (item: Signup) => {
    const parts: string[] = [];
    if (item.type === "ticket") {
      parts.push(`${item.ticketCount} ticket${item.ticketCount === 1 ? "" : "s"}`);
      if (item.tiers.length) parts.push(item.tiers.join(", "));
    } else {
      parts.push("RSVP");
    }
    if (item.isGuest) parts.push("guest");
    return parts.join(" · ");
  };

  const renderItem = ({ item }: { item: Signup }) => (
    <TouchableOpacity
      style={styles.userItem}
      activeOpacity={item.isGuest ? 1 : 0.7}
      disabled={item.isGuest}
      onPress={() => openUserProfile(item.userId)}
    >
      <Avatar uri={item.profilePicture} name={item.username} size={48} />
      <View style={styles.userInfo}>
        <Text style={styles.userName} numberOfLines={1}>
          {capitalize(item.username || "Member")}
        </Text>
        <Text style={styles.userSub} numberOfLines={1}>
          {subtitleFor(item)}
        </Text>
      </View>
      {item.checkedIn ? (
        <View style={styles.checkedInPill}>
          <Ionicons name="checkmark-circle" size={14} color={colors.success} />
          <Text style={styles.checkedInText}>Checked in</Text>
        </View>
      ) : (
        !item.isGuest && (
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        )
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <LinearGradient
        colors={[colors.backgroundSecondary, colors.backgroundTertiary]}
        style={styles.container}
      >
        <UserListItemSkeleton count={6} />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.backgroundSecondary, colors.backgroundTertiary]}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <GlassBackButton style={styles.backButton} />
          <Text style={styles.headerTitle}>{"Who's coming"}</Text>
          <View style={{ width: 40 }} />
        </View>

        <FlatList
          data={attendees}
          renderItem={renderItem}
          keyExtractor={(item) => item.userId}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              <Text style={styles.summary}>
                {data?.total ?? 0} going
                {(data?.attendedCount ?? 0) > 0
                  ? ` · ${data?.attendedCount} checked in`
                  : ""}
              </Text>
              <View style={styles.filterRow}>
                {FILTERS.map((f) => {
                  const active = filter === f.key;
                  const count =
                    f.key === "all"
                      ? data?.total ?? 0
                      : f.key === "ticket"
                        ? data?.ticketCount ?? 0
                        : data?.rsvpCount ?? 0;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setFilter(f.key)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          active && styles.filterChipTextActive,
                        ]}
                      >
                        {f.label} {count}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {filter === "all"
                  ? "Nobody has signed up yet"
                  : filter === "ticket"
                    ? "No tickets sold yet"
                    : "No RSVPs yet"}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
    },
    backButton: { marginRight: 16 },
    headerTitle: {
      flex: 1,
      fontSize: scaleFontSize(24),
      fontFamily: Fonts.bold,
      color: c.text,
    },
    listContent: {
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    summary: {
      fontSize: 15,
      fontFamily: Fonts.medium,
      color: c.textSecondary,
      marginBottom: 14,
    },
    filterRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 8,
    },
    filterChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.glassFillSubtle,
    },
    filterChipActive: {
      backgroundColor: c.primaryFadedStrong,
      borderColor: c.primaryBorder,
    },
    filterChipText: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textSecondary,
    },
    filterChipTextActive: {
      color: c.primaryLight,
    },
    userItem: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
      gap: 12,
    },
    userInfo: {
      flex: 1,
      minWidth: 0,
    },
    userName: {
      fontSize: 16,
      fontFamily: Fonts.semiBold,
      color: c.text,
    },
    userSub: {
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      marginTop: 2,
    },
    checkedInPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: c.glassFillSubtle,
    },
    checkedInText: {
      fontSize: 12,
      fontFamily: Fonts.semiBold,
      color: c.success,
    },
    emptyContainer: {
      alignItems: "center",
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 16,
      fontFamily: Fonts.semiBold,
      color: c.textMuted,
      marginTop: 12,
    },
  });
