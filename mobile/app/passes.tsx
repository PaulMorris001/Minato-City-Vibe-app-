import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Image,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
type AttendanceStatus = "incoming" | "attended" | "missed";

interface Pass {
  id: string;
  type: "rsvp" | "ticket";
  status: AttendanceStatus;
  attendedAt: string | null;
  /** Ticket tier purchased ("VIP", …) — null for RSVP passes and single-price tickets. */
  tierName?: string | null;
  qr: string; // data URL
  event: {
    _id: string;
    title: string;
    date: string;
    location?: string;
    address?: string;
    image?: string;
  };
}

const STATUS_META: Record<
  AttendanceStatus,
  { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  incoming: { label: "Incoming", color: "#C084FC", bg: "rgba(168,85,247,0.16)", icon: "time-outline" },
  attended: { label: "Attended", color: "#34D399", bg: "rgba(52,211,153,0.16)", icon: "checkmark-circle" },
  missed: { label: "Missed", color: "#F87171", bg: "rgba(248,113,113,0.14)", icon: "close-circle-outline" },
};

export default function PassesScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPasses = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${BASE_URL}/my-passes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPasses(res.data?.passes || []);
    } catch (error) {
      console.error("Fetch passes error:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchPasses();
    }, [fetchPasses])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchPasses();
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <GlassBackButton size={38} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>My Passes</Text>
            <Text style={styles.headerSubtitle}>Show your QR at the door</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push("/bookings" as any)}
            style={styles.bookingsButton}
            activeOpacity={0.8}
          >
            <Ionicons name="briefcase-outline" size={16} color={colors.primaryLight} />
            <Text style={styles.bookingsButtonText}>Bookings</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : passes.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🎫</Text>
              <Text style={styles.emptyTitle}>No passes yet</Text>
              <Text style={styles.emptyText}>
                RSVP to an event or buy a ticket and your QR pass shows up here.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 16 }}>
              {passes.map((pass) => {
                const meta = STATUS_META[pass.status];
                return (
                  <View key={pass.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <Text style={styles.eventTitle} numberOfLines={2}>
                        {pass.event.title}
                        {pass.tierName ? ` · ${pass.tierName}` : ""}
                      </Text>
                      <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                        <Ionicons name={meta.icon} size={12} color={meta.color} />
                        <Text style={[styles.badgeText, { color: meta.color }]}>
                          {meta.label}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={13} color={colors.textDim} />
                      <Text style={styles.metaText}>
                        {new Date(pass.event.date).toLocaleString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </Text>
                    </View>
                    {!!(pass.event.address || pass.event.location) && (
                      <View style={styles.metaRow}>
                        <Ionicons name="location-outline" size={13} color={colors.textDim} />
                        <Text style={styles.metaText} numberOfLines={1}>
                          {pass.event.address || pass.event.location}
                        </Text>
                      </View>
                    )}

                    {/* QR — dimmed once attended or missed */}
                    <View style={styles.qrWrap}>
                      <Image
                        source={{ uri: pass.qr }}
                        style={[
                          styles.qr,
                          pass.status !== "incoming" && { opacity: 0.25 },
                        ]}
                        resizeMode="contain"
                      />
                      {pass.status === "attended" && (
                        <View style={styles.qrOverlay}>
                          <Ionicons name="checkmark-circle" size={48} color={colors.successLight} />
                          <Text style={styles.qrOverlayText}>Checked in</Text>
                        </View>
                      )}
                      {pass.status === "missed" && (
                        <View style={styles.qrOverlay}>
                          <Ionicons name="close-circle" size={48} color={colors.errorLight} />
                          <Text style={styles.qrOverlayText}>Event missed</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.passType}>
                      {pass.type === "ticket" ? "🎟️ Ticket" : "✅ RSVP"} ·{" "}
                      {pass.status === "incoming"
                        ? "Show this code to be checked in"
                        : pass.status === "attended"
                        ? `Checked in${
                            pass.attendedAt
                              ? " " +
                                new Date(pass.attendedAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })
                              : ""
                          }`
                        : "You didn't check in"}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.backgroundDeep },
  safe: { flex: 1 },
  header: {
    paddingTop: 8,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 8,
  },
  headerTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 28,
    color: c.textBright,
    letterSpacing: -1,
    lineHeight: 30,
  },
  headerSubtitle: { fontFamily: "Outfit_500Medium", fontSize: 12, color: c.textDim, marginTop: 4 },
  bookingsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.primaryFaded,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.28)",
  },
  bookingsButtonText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 12.5,
    color: c.primaryLight,
    letterSpacing: 0.1,
  },
  scrollContent: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28 },
  loadingWrap: { paddingVertical: 80, alignItems: "center" },
  card: {
    backgroundColor: c.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: c.glassFill,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  eventTitle: {
    flex: 1,
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 17,
    color: c.textBright,
    letterSpacing: -0.2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { fontFamily: "Outfit_700Bold", fontSize: 10, letterSpacing: 0.4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  metaText: { fontFamily: "Outfit_500Medium", fontSize: 12.5, color: c.textDim, flexShrink: 1 },
  qrWrap: {
    alignSelf: "center",
    marginTop: 18,
    marginBottom: 14,
    width: 220,
    height: 220,
    borderRadius: 18,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  qr: { width: 196, height: 196 },
  qrOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 6 },
  qrOverlayText: { fontFamily: "Outfit_700Bold", fontSize: 14, color: c.cardAlt },
  passType: {
    fontFamily: "Outfit_500Medium",
    fontSize: 12.5,
    color: c.textDim,
    textAlign: "center",
  },
  emptyState: { alignItems: "center", paddingVertical: 70, paddingHorizontal: 24 },
  emptyEmoji: { fontSize: 72, opacity: 0.3, marginBottom: 14 },
  emptyTitle: { fontFamily: "BricolageGrotesque_800ExtraBold", fontSize: 20, color: c.textBright, marginBottom: 8 },
  emptyText: { fontFamily: "Outfit_500Medium", fontSize: 13, color: c.textDim, textAlign: "center" },
});
