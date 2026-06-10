import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Fonts } from "@/constants/fonts";
import { scaleFontSize } from "@/utils/responsive";
import type { ExternalEvent } from "@/services/externalEvent.service";

/**
 * Card for events ingested from third-party providers (Ticketmaster etc).
 *
 * Visual language mirrors PublicEventCard so external events sit naturally
 * in a mixed feed — but with two key differences:
 *
 *   1. A provider badge in the top-left so users know what they're tapping.
 *   2. The CTA opens the provider's checkout in an in-app browser instead
 *      of the Stripe sheet. Tapping anywhere on the card does the same.
 *
 * No favorites / RSVP / "Your Event" states — we're a referrer here, not
 * the merchant of record, so the in-app actions don't apply.
 */

const SOURCE_META: Record<
  ExternalEvent["source"],
  { label: string; bg: string }
> = {
  ticketmaster: { label: "Ticketmaster", bg: "#026CDF" },
  bandsintown: { label: "Bandsintown", bg: "#00CEC8" },
};

interface ExternalEventCardProps {
  event: ExternalEvent;
  style?: any;
}

function formatPriceLine(event: ExternalEvent): string | null {
  if (event.priceMin == null && event.priceMax == null) return null;
  const sym = event.currency === "USD" ? "$" : event.currency + " ";
  if (event.priceMin != null && event.priceMax != null && event.priceMin !== event.priceMax) {
    return `${sym}${Math.round(event.priceMin)} – ${sym}${Math.round(event.priceMax)}`;
  }
  const v = event.priceMin ?? event.priceMax;
  return `From ${sym}${Math.round(v as number)}`;
}

export default function ExternalEventCard({ event, style }: ExternalEventCardProps) {
  const router = useRouter();
  const sourceMeta = SOURCE_META[event.source] ?? { label: event.source, bg: "#374151" };
  const priceLine = formatPriceLine(event);

  // Card tap → detail screen (NOT the provider URL). Only the explicit
  // "Get Tickets" button in the detail screen sends users out to Ticketmaster.
  const openDetail = () => router.push(`/external-event/${event._id}` as any);

  return (
    <TouchableOpacity
      style={[styles.eventCard, style]}
      activeOpacity={0.9}
      onPress={openDetail}
    >
      <View style={styles.eventCardInner}>
        {event.image ? (
          <Image
            source={{ uri: event.image }}
            style={styles.eventCardImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
          />
        ) : (
          <LinearGradient
            colors={["#667eea", "#764ba2"]}
            style={styles.eventCardImagePlaceholder}
          >
            <Ionicons name="calendar" size={48} color="rgba(255,255,255,0.5)" />
          </LinearGradient>
        )}

        {/* Source badge — top-left */}
        <View style={[styles.sourceBadge, { backgroundColor: sourceMeta.bg }]}>
          <Text style={styles.sourceBadgeText}>{sourceMeta.label}</Text>
        </View>

        {/* External-link indicator — top-right (mirrors heart position in PublicEventCard) */}
        <View style={styles.externalIndicator}>
          <Ionicons name="open-outline" size={18} color="#fff" />
        </View>

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.9)"]}
          style={styles.eventCardGradient}
        >
          <View style={styles.eventCardContent}>
            <Text style={styles.eventCardTitle} numberOfLines={2}>
              {event.title}
            </Text>

            <View style={styles.eventCardDetail}>
              <Ionicons name="location" size={14} color="#a855f7" />
              <Text style={styles.eventCardDetailText} numberOfLines={1}>
                {event.location || event.city}
              </Text>
            </View>

            <View style={styles.eventCardDetail}>
              <Ionicons name="calendar" size={14} color="#a855f7" />
              <Text style={styles.eventCardDetailText}>
                {new Date(event.date).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </View>

            {event.category && (
              <View style={styles.eventCardDetail}>
                <Ionicons name="pricetag" size={14} color="#a855f7" />
                <Text style={styles.eventCardDetailText} numberOfLines={1}>
                  {[event.category, event.genre].filter(Boolean).join(" · ")}
                </Text>
              </View>
            )}

            {priceLine && (
              <View style={styles.priceContainer}>
                <LinearGradient
                  colors={["#f093fb", "#f5576c"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.priceBadge}
                >
                  <Ionicons name="pricetag" size={12} color="#fff" />
                  <Text style={styles.priceText}>{priceLine}</Text>
                </LinearGradient>
              </View>
            )}

            <TouchableOpacity
              style={styles.getTicketsButton}
              onPress={(e) => {
                e.stopPropagation();
                openDetail();
              }}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={["#a855f7", "#7c3aed"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.getTicketsGradient}
              >
                <Ionicons name="information-circle" size={16} color="#fff" />
                <Text style={styles.getTicketsText}>View Details</Text>
                <Ionicons name="chevron-forward" size={14} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
            {(event.additionalDates ?? 0) > 0 && (
              <Text style={styles.moreDatesHint}>
                +{event.additionalDates} more {event.additionalDates === 1 ? "date" : "dates"}
              </Text>
            )}
          </View>
        </LinearGradient>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  eventCard: {
    width: "100%",
    height: 400,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  eventCardInner: { flex: 1, position: "relative" },
  eventCardImage: { width: "100%", height: "100%", resizeMode: "cover" },
  eventCardImagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  sourceBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 10,
    // Subtle white border so the pill stays legible on busy images
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
  },
  sourceBadgeText: {
    fontSize: scaleFontSize(11),
    fontFamily: Fonts.bold,
    color: "#fff",
    letterSpacing: 0.5,
  },
  externalIndicator: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  eventCardGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "60%",
    justifyContent: "flex-end",
  },
  eventCardContent: { padding: 20 },
  eventCardTitle: {
    fontSize: scaleFontSize(22),
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 12,
  },
  eventCardDetail: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  eventCardDetailText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#e5e7eb",
    flex: 1,
  },
  priceContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
    gap: 12,
  },
  priceBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  priceText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  getTicketsButton: { marginTop: 4 },
  getTicketsGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    gap: 8,
  },
  getTicketsText: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  moreDatesHint: {
    marginTop: 8,
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.medium,
    color: "#c084fc",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});
