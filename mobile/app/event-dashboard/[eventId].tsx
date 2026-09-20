import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Switch,
  Share,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { formatMoney } from "@/constants/payments";
import { createEventShareLink } from "@/utils/shareLinks";
import { showError, showSuccess } from "@/utils/toast";
import GlassBackButton from "@/components/shared/GlassBackButton";
import MediaTile from "@/components/shared/MediaTile";
import { StatCard } from "@/components/shared/EarningsHero";
import { VN } from "@/components/vendor/vendorTheme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface DashboardEvent {
  _id: string;
  title: string;
  slug?: string;
  shareToken?: string;
  image?: string;
  date: string;
  isPublic: boolean;
  isPaid: boolean;
  currency?: string;
  maxGuests?: number;
  seenCount?: number;
  rsvpCount?: number;
  ticketsSold?: number;
  ticketsRemaining?: number;
  ticketSalesClosedAt?: string | null;
  vendors?: { _id: string }[];
  vendorInvites?: { status: "pending" | "accepted" | "declined" }[];
  invitedUsers?: { _id: string }[];
  createdBy: { _id: string };
}

interface AttendanceSummary {
  total: number;
  attendedCount: number;
}

interface TicketSale {
  _id: string;
  amountPaid?: number;
  ticketPrice?: number;
  purchaseDate: string;
  user?: { username: string };
}

interface SalesSummary {
  ticketsSold: number;
  ticketsRemaining: number;
  totalRevenue: number;
  tickets: TicketSale[];
}

function relativeDate(iso: string) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The event organizer's control panel — one place for the numbers and
 * actions that used to be scattered across event/[id].tsx (vendors, ticket
 * toggle), event-attendees/[eventId].tsx (RSVPs/check-ins) and the
 * never-consumed getEventTicketSales endpoint (revenue). Reached from the
 * profile page and from manage-events.tsx's per-card "Dashboard" button
 * (creator-only). Deliberately doesn't look like manage-events.tsx's
 * edit-focused list: this is read-first (a hero + stat tiles + a sales
 * panel), with the quick actions as a tile grid rather than settings-style
 * chevron rows. "Manage vendors" hands off to the dedicated
 * event-vendors/[eventId].tsx screen (remove/withdraw only — adding a
 * vendor stays on event/[id].tsx); "Edit event" hands off to
 * manage-events.tsx via its `?editEventId` deep-link effect.
 */
export default function EventDashboardScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;

  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<DashboardEvent | null>(null);
  const [attendance, setAttendance] = useState<AttendanceSummary | null>(null);
  const [sales, setSales] = useState<SalesSummary | null>(null);
  const [togglingSales, setTogglingSales] = useState(false);

  const authHeaders = async () => ({
    Authorization: `Bearer ${await SecureStore.getItemAsync("token")}`,
  });

  const load = useCallback(async () => {
    if (!eventId) return;
    try {
      const headers = await authHeaders();
      const eventRes = await axios.get(`${BASE_URL}/events/${eventId}`, { headers });
      const ev: DashboardEvent = eventRes.data.event;
      setEvent(ev);

      const [attendanceRes, salesRes] = await Promise.all([
        axios.get(`${BASE_URL}/events/${eventId}/attendance`, { headers }).catch(() => null),
        ev.isPaid
          ? axios.get(`${BASE_URL}/events/${eventId}/tickets`, { headers }).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (attendanceRes) setAttendance(attendanceRes.data);
      if (salesRes) setSales(salesRes.data);
    } catch {
      showError("Failed to load the event dashboard");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // Ticket sales can be toggled from event/[id].tsx too — refresh on focus so
  // a change made there (or a new sale) shows up here without a manual pull.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleToggleTicketSales = async (close: boolean) => {
    if (!event) return;
    setTogglingSales(true);
    try {
      const headers = await authHeaders();
      const res = await axios.patch(
        `${BASE_URL}/events/${event._id}/ticket-sales`,
        { closed: close },
        { headers }
      );
      setEvent((prev) => (prev ? { ...prev, ticketSalesClosedAt: res.data.ticketSalesClosedAt ?? null } : prev));
      showSuccess(close ? "Ticket sales closed." : "Ticket sales reopened.");
    } catch (error: any) {
      showError(error.response?.data?.message || "Couldn't update ticket sales.");
    } finally {
      setTogglingSales(false);
    }
  };

  const handleShare = async () => {
    if (!event) return;
    try {
      const link = createEventShareLink(event.slug || event.shareToken || event._id);
      await Share.share({
        message: `Check out this event on OurCityvibe: ${event.title}\n${link}`,
        title: event.title,
        url: link,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  if (loading || !event) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const acceptedVendors = event.vendors?.length ?? 0;
  const pendingVendorInvites = (event.vendorInvites ?? []).filter((v) => v.status === "pending").length;
  const going = event.isPaid ? event.ticketsSold ?? 0 : event.rsvpCount ?? 0;
  const capacity = event.maxGuests ?? 0;
  const soldRatio = capacity > 0 ? Math.min(1, (event.ticketsSold ?? 0) / capacity) : 0;

  const tiles: {
    key: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
    accent: string;
    title: string;
    subtitle: string;
    onPress: () => void;
  }[] = [
    {
      key: "guests",
      icon: "people-outline",
      accent: VN.cyan,
      title: "Guest List",
      subtitle: event.isPublic
        ? `${attendance?.total ?? going} total`
        : `${event.invitedUsers?.length ?? 0} invited`,
      onPress: () => router.push(`/event-attendees/${event._id}` as any),
    },
    {
      key: "vendors",
      icon: "briefcase-outline",
      accent: VN.purpleSoft,
      title: "Manage Vendors",
      subtitle:
        acceptedVendors > 0 || pendingVendorInvites > 0
          ? `${acceptedVendors} confirmed${pendingVendorInvites > 0 ? ` · ${pendingVendorInvites} pending` : ""}`
          : "None yet",
      onPress: () => router.push(`/event-vendors/${event._id}` as any),
    },
    {
      key: "edit",
      icon: "create-outline",
      accent: VN.amber,
      title: "Edit Event",
      subtitle: "Details, photos & pricing",
      onPress: () => router.push(`/manage-events?editEventId=${event._id}` as any),
    },
    {
      key: "share",
      icon: "share-social-outline",
      accent: VN.pink,
      title: "Share Event",
      subtitle: "Send the link out",
      onPress: handleShare,
    },
  ];

  return (
    <View style={styles.container}>
      {/* Hero — the cover, not a form field. Back button floats over it like
          event/[id].tsx's own hero, so this reads as a place you land on
          rather than a settings page you scroll down. */}
      <View style={styles.hero}>
        {event.image ? (
          <MediaTile uri={event.image} style={StyleSheet.absoluteFillObject} autoPlay />
        ) : (
          <LinearGradient
            colors={[colors.primaryDark, colors.accentPink]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        )}
        <LinearGradient
          colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.75)"]}
          style={StyleSheet.absoluteFillObject}
        />
        <SafeAreaView edges={["top"]} style={styles.heroTopSafe} pointerEvents="box-none">
          <GlassBackButton overMedia />
        </SafeAreaView>
        <View style={styles.heroBottom}>
          <View style={styles.heroChipRow}>
            <View style={styles.heroChip}>
              <Text style={styles.heroChipText}>{event.isPublic ? "PUBLIC" : "PRIVATE"}</Text>
            </View>
            {event.isPaid && (
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>TICKETED</Text>
              </View>
            )}
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>{event.title}</Text>
          <Text style={styles.heroDate}>
            {new Date(event.date).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>OVERVIEW</Text>
        <View style={styles.statsGrid}>
          <StatCard icon="eye" accent={VN.purpleSoft} label="Views" value={event.seenCount ?? 0} sub="unique viewers" />
          <StatCard icon="people" accent={VN.cyan} label="Going" value={going} sub={event.isPaid ? "tickets sold" : "RSVPs"} />
          <StatCard
            icon="checkmark-circle"
            accent={VN.green}
            label="Checked In"
            value={attendance?.attendedCount ?? 0}
            sub={`of ${attendance?.total ?? going}`}
          />
          {event.isPaid && (
            <StatCard
              icon="cash"
              accent={VN.amber}
              label="Revenue"
              value={formatMoney(sales?.totalRevenue ?? 0, event.currency)}
              sub="all time"
            />
          )}
        </View>

        {event.isPaid && (
          <>
            <Text style={styles.sectionLabel}>TICKET SALES</Text>
            <View style={styles.salesPanel}>
              <View style={styles.salesHeaderRow}>
                <View style={styles.salesHeaderLeft}>
                  <View style={[styles.salesIconWrap, { backgroundColor: VN.amber + "22" }]}>
                    <Ionicons name="ticket" size={16} color={VN.amber} />
                  </View>
                  <View>
                    <Text style={styles.salesHeaderTitle}>
                      {event.ticketsSold ?? 0} sold{capacity > 0 ? ` of ${capacity}` : ""}
                    </Text>
                    <Text style={styles.salesHeaderSub}>
                      {event.ticketSalesClosedAt ? "Sales closed" : "Sales open"}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={!event.ticketSalesClosedAt}
                  onValueChange={(open) => handleToggleTicketSales(!open)}
                  disabled={togglingSales}
                  trackColor={{ false: colors.borderMuted, true: colors.primary }}
                  thumbColor="#fff"
                />
              </View>

              {capacity > 0 && (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${soldRatio * 100}%` }]} />
                </View>
              )}

              <View style={styles.salesDivider} />

              <Text style={styles.cardSectionTitle}>RECENT SALES</Text>
              {sales && sales.tickets.length > 0 ? (
                sales.tickets.slice(0, 8).map((t) => (
                  <View key={t._id} style={styles.saleRow}>
                    <Text style={styles.saleName} numberOfLines={1}>{t.user?.username || "Guest"}</Text>
                    <Text style={styles.saleMeta}>{relativeDate(t.purchaseDate)}</Text>
                    <Text style={styles.saleAmount}>
                      {formatMoney(t.amountPaid ?? t.ticketPrice ?? 0, event.currency)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyText}>No tickets sold yet.</Text>
              )}
            </View>
          </>
        )}

        <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
        <View style={styles.tileGrid}>
          {tiles.map((tile) => (
            <TouchableOpacity
              key={tile.key}
              style={styles.tile}
              activeOpacity={0.85}
              onPress={tile.onPress}
            >
              <View style={[styles.tileIconWrap, { backgroundColor: tile.accent + "1F" }]}>
                <Ionicons name={tile.icon} size={20} color={tile.accent} />
              </View>
              <Text style={styles.tileTitle}>{tile.title}</Text>
              <Text style={styles.tileSubtitle} numberOfLines={1}>{tile.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    hero: { height: 240, backgroundColor: c.backgroundSecondary },
    heroTopSafe: { paddingHorizontal: 16, paddingTop: 8 },
    heroBottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 20, gap: 6 },
    heroChipRow: { flexDirection: "row", gap: 8, marginBottom: 2 },
    heroChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: "rgba(255,255,255,0.18)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
    },
    heroChipText: { fontSize: 10.5, fontFamily: Fonts.bold, color: "#fff", letterSpacing: 0.5 },
    heroTitle: { fontSize: 24, fontFamily: Fonts.bold, color: "#fff" },
    heroDate: { fontSize: 13.5, fontFamily: Fonts.medium, color: "rgba(255,255,255,0.85)" },
    content: { padding: 16, paddingBottom: 48, gap: 10 },
    sectionLabel: {
      fontSize: 12,
      fontFamily: Fonts.bold,
      color: c.textMuted,
      letterSpacing: 0.6,
      marginTop: 8,
      marginBottom: 2,
    },
    statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    salesPanel: {
      backgroundColor: c.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 12,
    },
    salesHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    salesHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
    salesIconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    salesHeaderTitle: { fontSize: 15, fontFamily: Fonts.bold, color: c.text },
    salesHeaderSub: { fontSize: 12, fontFamily: Fonts.regular, color: c.textSecondary, marginTop: 1 },
    progressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.borderMuted,
      overflow: "hidden",
    },
    progressFill: { height: "100%", borderRadius: 4, backgroundColor: VN.amber },
    salesDivider: { height: 1, backgroundColor: c.border },
    cardSectionTitle: {
      fontSize: 11,
      fontFamily: Fonts.semiBold,
      color: c.textMuted,
      letterSpacing: 0.4,
    },
    saleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderMuted,
    },
    saleName: { flex: 1, minWidth: 0, fontSize: 13.5, fontFamily: Fonts.semiBold, color: c.text },
    saleMeta: { fontSize: 12, fontFamily: Fonts.regular, color: c.textMuted },
    saleAmount: { fontSize: 13.5, fontFamily: Fonts.bold, color: c.text },
    emptyText: { fontSize: 13, fontFamily: Fonts.regular, color: c.textMuted, paddingVertical: 4 },
    tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tile: {
      flexBasis: "47%",
      flexGrow: 1,
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 6,
    },
    tileIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    tileTitle: { fontSize: 14.5, fontFamily: Fonts.semiBold, color: c.text },
    tileSubtitle: { fontSize: 12, fontFamily: Fonts.regular, color: c.textSecondary },
  });
