import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { scaleFontSize } from "@/utils/responsive";
import { vendorAccentColor } from "@/utils/eventDetails";
import { showError, showSuccess } from "@/utils/toast";
import GlassBackButton from "@/components/shared/GlassBackButton";
import MediaTile from "@/components/shared/MediaTile";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface EventVendor {
  _id: string;
  name: string;
  images?: string[];
  rating?: number;
  verified?: boolean;
  vendorType?: { name: string } | string;
  city?: string;
}

interface VendorInvite {
  vendor: EventVendor;
  status: "pending" | "accepted" | "declined";
  invitedAt?: string;
  respondedAt?: string;
}

interface EventForVendors {
  _id: string;
  title: string;
  createdBy: { _id: string };
  vendors?: EventVendor[];
  vendorInvites?: VendorInvite[];
}

function vendorTypeName(vt?: { name: string } | string) {
  if (!vt) return "";
  return typeof vt === "string" ? vt : vt.name;
}

function relativeDate(iso?: string) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The organizer's real "manage vendors" surface — confirmed lineup, invites
 * still awaiting a response, and declined ones, each with a way to remove or
 * withdraw. Adding a vendor deliberately stays on event/[id].tsx (the action
 * sheet's "Add a vendor" item and the ON THE BILL empty state) — this screen
 * is for what happens to a vendor once they're already in the picture, not
 * for finding new ones.
 */
export default function EventVendorsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<EventForVendors | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const authHeaders = async () => ({
    Authorization: `Bearer ${await SecureStore.getItemAsync("token")}`,
  });

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const headers = await authHeaders();
      const res = await axios.get(`${BASE_URL}/events/${eventId}`, { headers });
      setEvent(res.data.event);
    } catch {
      showError("Failed to load vendors");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const removeVendor = (vendor: EventVendor, mode: "confirmed" | "pending") => {
    if (!event) return;
    Alert.alert(
      mode === "pending" ? "Withdraw invite?" : "Remove vendor?",
      mode === "pending"
        ? `${vendor.name} will no longer see this invite.`
        : `${vendor.name} will be taken off the event.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: mode === "pending" ? "Withdraw" : "Remove",
          style: "destructive",
          onPress: async () => {
            setRemovingId(vendor._id);
            try {
              const headers = await authHeaders();
              await axios.delete(`${BASE_URL}/events/${event._id}/vendors/${vendor._id}`, { headers });
              showSuccess(mode === "pending" ? "Invite withdrawn." : "Vendor removed.");
              load();
            } catch (error: any) {
              showError(error.response?.data?.message || "Something went wrong.");
            } finally {
              setRemovingId(null);
            }
          },
        },
      ]
    );
  };

  if (loading || !event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <GlassBackButton style={styles.backButton} />
          <Text style={styles.headerTitle}>Manage Vendors</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const confirmed = event.vendors ?? [];
  const pending = (event.vendorInvites ?? []).filter((v) => v.status === "pending");
  const declined = (event.vendorInvites ?? []).filter((v) => v.status === "declined");
  const isEmpty = confirmed.length === 0 && pending.length === 0 && declined.length === 0;

  const renderVendorRow = (
    vendor: EventVendor,
    opts: { statusText: string; statusColor: string; onRemove?: () => void }
  ) => {
    const accent = vendorAccentColor(vendor._id || vendor.name);
    const vt = vendorTypeName(vendor.vendorType);
    return (
      <View key={vendor._id} style={styles.vendorRow}>
        <TouchableOpacity
          style={styles.vendorRowMain}
          activeOpacity={0.8}
          onPress={() =>
            router.push({
              pathname: "/vendor-details/[vendorId]",
              params: { vendorId: vendor._id, vendorName: vendor.name },
            } as any)
          }
        >
          {vendor.images?.[0] ? (
            <MediaTile uri={vendor.images[0]} style={styles.vendorThumb} posterOnly />
          ) : (
            <View style={[styles.vendorThumb, styles.vendorThumbFallback, { backgroundColor: accent + "26" }]}>
              <Text style={[styles.vendorEmoji, { color: accent }]}>✦</Text>
            </View>
          )}
          <View style={styles.vendorInfo}>
            <View style={styles.vendorNameRow}>
              <Text style={styles.vendorName} numberOfLines={1}>{vendor.name}</Text>
              {vendor.verified && <Ionicons name="checkmark-circle" size={14} color={colors.success} />}
            </View>
            <Text style={styles.vendorMeta} numberOfLines={1}>
              {[vt, vendor.city].filter(Boolean).join(" · ") || " "}
            </Text>
            <Text style={[styles.vendorStatus, { color: opts.statusColor }]}>{opts.statusText}</Text>
          </View>
        </TouchableOpacity>
        {opts.onRemove && (
          <TouchableOpacity
            style={styles.removeBtn}
            onPress={opts.onRemove}
            disabled={removingId === vendor._id}
            hitSlop={8}
          >
            {removingId === vendor._id ? (
              <ActivityIndicator size="small" color={colors.error} />
            ) : (
              <Ionicons name="close-circle-outline" size={22} color={colors.error} />
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <Text style={styles.headerTitle}>Manage Vendors</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {isEmpty ? (
          <View style={styles.emptyState}>
            <Ionicons name="briefcase-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No vendors yet</Text>
            <Text style={styles.emptyText}>
              Add a vendor from the event page to start building your lineup.
            </Text>
            <TouchableOpacity
              style={styles.emptyLinkBtn}
              onPress={() => router.push(`/event/${event._id}` as any)}
            >
              <Text style={styles.emptyLinkText}>Go to event</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>CONFIRMED · {confirmed.length}</Text>
            {confirmed.length > 0 ? (
              confirmed.map((v) =>
                renderVendorRow(v, {
                  statusText: "On the bill",
                  statusColor: colors.success,
                  onRemove: () => removeVendor(v, "confirmed"),
                })
              )
            ) : (
              <Text style={styles.emptySectionText}>None confirmed yet.</Text>
            )}

            {pending.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>AWAITING RESPONSE · {pending.length}</Text>
                {pending.map((vi) =>
                  renderVendorRow(vi.vendor, {
                    statusText: `Invited ${relativeDate(vi.invitedAt)}`,
                    statusColor: colors.warning,
                    onRemove: () => removeVendor(vi.vendor, "pending"),
                  })
                )}
              </>
            )}

            {declined.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>DECLINED · {declined.length}</Text>
                {declined.map((vi) =>
                  renderVendorRow(vi.vendor, {
                    statusText: `Declined ${relativeDate(vi.respondedAt)}`,
                    statusColor: colors.textMuted,
                  })
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 16,
    },
    backButton: {},
    headerTitle: { fontSize: scaleFontSize(22), fontFamily: Fonts.bold, color: c.text },
    content: { padding: 16, paddingBottom: 48, gap: 8 },
    sectionLabel: {
      fontSize: 12,
      fontFamily: Fonts.bold,
      color: c.textMuted,
      letterSpacing: 0.6,
      marginTop: 14,
      marginBottom: 2,
    },
    emptySectionText: { fontSize: 13, fontFamily: Fonts.regular, color: c.textMuted, paddingVertical: 4 },
    vendorRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 10,
      marginTop: 8,
    },
    vendorRowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
    vendorThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: c.border },
    vendorThumbFallback: { alignItems: "center", justifyContent: "center" },
    vendorEmoji: { fontSize: 18, fontFamily: Fonts.bold },
    vendorInfo: { flex: 1, minWidth: 0, gap: 1 },
    vendorNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    vendorName: { fontSize: 14.5, fontFamily: Fonts.semiBold, color: c.text, flexShrink: 1 },
    vendorMeta: { fontSize: 12, fontFamily: Fonts.regular, color: c.textSecondary },
    vendorStatus: { fontSize: 11.5, fontFamily: Fonts.semiBold, marginTop: 1 },
    removeBtn: { padding: 6 },
    emptyState: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 24, gap: 10 },
    emptyTitle: { fontSize: 17, fontFamily: Fonts.bold, color: c.text, marginTop: 4 },
    emptyText: { fontSize: 13.5, fontFamily: Fonts.regular, color: c.textSecondary, textAlign: "center", lineHeight: 19 },
    emptyLinkBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, padding: 8 },
    emptyLinkText: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.primary },
  });
