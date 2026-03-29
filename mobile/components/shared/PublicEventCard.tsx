import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Fonts } from "@/constants/fonts";
import { scaleFontSize } from "@/utils/responsive";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";

export interface PublicEvent {
  _id: string;
  title: string;
  date: string;
  location: string;
  image?: string;
  description?: string;
  isPublic: boolean;
  isPaid: boolean;
  ticketPrice?: number;
  maxGuests?: number;
  ticketsSold?: number;
  ticketsRemaining?: number;
  userHasPurchased?: boolean;
  isCreator?: boolean;
  isFavorited?: boolean;
  rsvpCount?: number;
  createdBy: {
    _id: string;
    username: string;
    email: string;
    profilePicture?: string;
  };
}

interface PublicEventCardProps {
  event: PublicEvent;
  onPurchaseTicket?: (eventId: string, eventTitle: string) => void;
  onJoinFreeEvent?: (eventId: string, eventTitle: string) => void;
  style?: any;
}

export default function PublicEventCard({
  event,
  onPurchaseTicket,
  onJoinFreeEvent,
  style,
}: PublicEventCardProps) {
  const router = useRouter();
  const formatPrice = useFormatPrice();
  const [favorited, setFavorited] = useState(event.isFavorited ?? false);
  const [togglingFavorite, setTogglingFavorite] = useState(false);

  const toggleFavorite = async () => {
    if (togglingFavorite) return;
    setTogglingFavorite(true);
    const next = !favorited;
    setFavorited(next);
    try {
      const token = await SecureStore.getItemAsync("token");
      await fetch(`${BASE_URL}/favorites/${event._id}`, {
        method: next ? "POST" : "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setFavorited(!next); // revert on error
    } finally {
      setTogglingFavorite(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.eventCard, style]}
      activeOpacity={0.9}
      onPress={() => router.push(`/event/${event._id}` as any)}
    >
      <View style={styles.eventCardInner}>
        {event.image ? (
          <Image source={{ uri: event.image }} style={styles.eventCardImage} contentFit="cover" cachePolicy="memory-disk" transition={200} />
        ) : (
          <LinearGradient
            colors={["#667eea", "#764ba2"]}
            style={styles.eventCardImagePlaceholder}
          >
            <Ionicons name="calendar" size={48} color="rgba(255,255,255,0.5)" />
          </LinearGradient>
        )}

        <TouchableOpacity
          style={styles.favoriteButton}
          onPress={(e) => { e.stopPropagation(); toggleFavorite(); }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={favorited ? "heart" : "heart-outline"}
            size={22}
            color={favorited ? "#ef4444" : "#fff"}
          />
        </TouchableOpacity>

        {(event.rsvpCount ?? 0) > 0 && (
          <View style={styles.rsvpBadge}>
            <Text style={styles.rsvpBadgeText}>🎉 {event.rsvpCount} going</Text>
          </View>
        )}

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
                {event.location}
              </Text>
            </View>

            <View style={styles.eventCardDetail}>
              <Ionicons name="calendar" size={14} color="#a855f7" />
              <Text style={styles.eventCardDetailText}>
                {new Date(event.date).toLocaleDateString()}
              </Text>
            </View>

            {event.isPaid && (
              <>
                <View style={styles.eventCardPriceContainer}>
                  <LinearGradient
                    colors={["#f093fb", "#f5576c"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.eventCardPriceBadge}
                  >
                    <Ionicons name="pricetag" size={12} color="#fff" />
                    <Text style={styles.eventCardPriceText}>
                      ${formatPrice(event.ticketPrice)}
                    </Text>
                  </LinearGradient>

                  {event.ticketsRemaining !== undefined && (
                    <Text style={styles.eventCardTicketsText}>
                      {event.ticketsRemaining} left
                    </Text>
                  )}
                </View>

                {/* Show Buy Ticket button only if user hasn't purchased and isn't the creator */}
                {!event.userHasPurchased && !event.isCreator && onPurchaseTicket && (
                  <TouchableOpacity
                    style={styles.buyTicketButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onPurchaseTicket(event._id, event.title);
                    }}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={["#a855f7", "#7c3aed"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.buyTicketGradient}
                    >
                      <Ionicons name="ticket" size={16} color="#fff" />
                      <Text style={styles.buyTicketText}>Buy Ticket</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}

                {/* Show "Purchased" badge if user has a ticket */}
                {event.userHasPurchased && (
                  <View style={styles.purchasedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                    <Text style={styles.purchasedText}>Purchased</Text>
                  </View>
                )}

                {/* Show "Your Event" badge if user is the creator */}
                {event.isCreator && (
                  <View style={styles.creatorBadge}>
                    <Ionicons name="star" size={16} color="#f59e0b" />
                    <Text style={styles.creatorText}>Your Event</Text>
                  </View>
                )}
              </>
            )}

            {!event.isPaid && (
              <>
                <View style={styles.freeEventBadge}>
                  <Text style={styles.freeEventText}>FREE EVENT</Text>
                </View>

                {/* Show Join button only if user hasn't joined and isn't the creator */}
                {!event.userHasPurchased && !event.isCreator && onJoinFreeEvent && (
                  <TouchableOpacity
                    style={styles.joinEventButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      onJoinFreeEvent(event._id, event.title);
                    }}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={["#10b981", "#059669"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.joinEventGradient}
                    >
                      <Ionicons name="add-circle" size={16} color="#fff" />
                      <Text style={styles.joinEventText}>Join Event</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                )}

                {/* Show "Joined" badge if user has joined */}
                {event.userHasPurchased && (
                  <View style={styles.joinedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                    <Text style={styles.joinedText}>Joined</Text>
                  </View>
                )}

                {/* Show "Your Event" badge if user is the creator */}
                {event.isCreator && (
                  <View style={styles.creatorBadge}>
                    <Ionicons name="star" size={16} color="#f59e0b" />
                    <Text style={styles.creatorText}>Your Event</Text>
                  </View>
                )}
              </>
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
  eventCardInner: {
    flex: 1,
    position: "relative",
  },
  eventCardImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  eventCardImagePlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  rsvpBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 10,
  },
  rsvpBadgeText: {
    fontSize: scaleFontSize(12),
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
  favoriteButton: {
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
  eventCardContent: {
    padding: 20,
  },
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
  eventCardPriceContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 12,
    gap: 12,
  },
  eventCardPriceBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  eventCardPriceText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  eventCardTicketsText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.medium,
    color: "#fbbf24",
  },
  buyTicketButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  buyTicketGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  buyTicketText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  freeEventBadge: {
    backgroundColor: "#10b981",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: "flex-start",
    marginTop: 8,
    marginBottom: 8,
  },
  freeEventText: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.bold,
    color: "#fff",
    letterSpacing: 0.5,
  },
  joinEventButton: {
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 4,
  },
  joinEventGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  joinEventText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  joinedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  joinedText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#10b981",
  },
  purchasedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  purchasedText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#10b981",
  },
  creatorBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 4,
  },
  creatorText: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.bold,
    color: "#f59e0b",
  },
});
