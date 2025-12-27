import React from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Fonts } from "@/constants/fonts";
import { useFormatPrice } from "@/hooks/useFormatPrice";

const { width: screenWidth } = Dimensions.get("window");

interface Ticket {
  _id: string;
  event: {
    _id: string;
    title: string;
    date: string;
    location: string;
    image?: string;
    createdBy: {
      _id: string;
      username: string;
      email: string;
      profilePicture?: string;
    };
  };
  ticketPrice: number;
  purchaseDate: string;
  ticketCode: string;
  isValid: boolean;
}

interface TicketCardProps {
  ticket: Ticket;
}

export default function TicketCard({ ticket }: TicketCardProps) {
  const router = useRouter();
  const formatPrice = useFormatPrice();
  const eventDate = new Date(ticket.event.date);
  const isPastEvent = eventDate < new Date();

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.9}
      onPress={() => router.push(`/event/${ticket.event._id}` as any)}
    >
      <LinearGradient
        colors={isPastEvent ? ["#374151", "#1f2937"] : ["#a855f7", "#7c3aed"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ticketContainer}
      >
        {/* Perforated edge effect */}
        <View style={styles.perforation}>
          {Array.from({ length: 15 }).map((_, index) => (
            <View key={index} style={styles.perforationDot} />
          ))}
        </View>

        <View style={styles.ticketContent}>
          {/* Left section with event details */}
          <View style={styles.leftSection}>
            {ticket.event.image ? (
              <Image source={{ uri: ticket.event.image }} style={styles.eventImage} />
            ) : (
              <View style={styles.eventImagePlaceholder}>
                <Ionicons name="calendar" size={32} color="rgba(255,255,255,0.6)" />
              </View>
            )}

            <View style={styles.eventInfo}>
              <Text style={styles.eventTitle} numberOfLines={2}>
                {ticket.event.title}
              </Text>

              <View style={styles.eventDetail}>
                <Ionicons name="location" size={14} color="rgba(255,255,255,0.9)" />
                <Text style={styles.eventDetailText} numberOfLines={1}>
                  {ticket.event.location}
                </Text>
              </View>

              <View style={styles.eventDetail}>
                <Ionicons name="calendar" size={14} color="rgba(255,255,255,0.9)" />
                <Text style={styles.eventDetailText}>
                  {eventDate.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </Text>
              </View>

              <View style={styles.eventDetail}>
                <Ionicons name="time" size={14} color="rgba(255,255,255,0.9)" />
                <Text style={styles.eventDetailText}>
                  {eventDate.toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          </View>

          {/* Right section with ticket details */}
          <View style={styles.rightSection}>
            <View style={styles.priceContainer}>
              <Text style={styles.priceLabel}>PRICE</Text>
              <Text style={styles.priceValue}>${formatPrice(ticket.ticketPrice)}</Text>
            </View>

            <View style={styles.qrPlaceholder}>
              <Ionicons name="qr-code" size={48} color="rgba(255,255,255,0.9)" />
              <Text style={styles.qrText}>Ticket Code</Text>
              <Text style={styles.ticketCodeText} numberOfLines={1}>
                {ticket.ticketCode.substring(0, 8).toUpperCase()}
              </Text>
            </View>

            {isPastEvent && (
              <View style={styles.pastBadge}>
                <Text style={styles.pastBadgeText}>EXPIRED</Text>
              </View>
            )}

            {!isPastEvent && ticket.isValid && (
              <View style={styles.validBadge}>
                <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                <Text style={styles.validBadgeText}>VALID</Text>
              </View>
            )}
          </View>
        </View>

        {/* Bottom section with purchase info */}
        <View style={styles.bottomSection}>
          <View style={styles.purchaseInfo}>
            <Ionicons name="person-circle" size={16} color="rgba(255,255,255,0.8)" />
            <Text style={styles.purchaseInfoText}>
              Organized by {ticket.event.createdBy.username}
            </Text>
          </View>
          <View style={styles.purchaseInfo}>
            <Ionicons name="receipt" size={16} color="rgba(255,255,255,0.8)" />
            <Text style={styles.purchaseInfoText}>
              Purchased on{" "}
              {new Date(ticket.purchaseDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </View>
        </View>

        {/* Ticket corners decoration */}
        <View style={[styles.corner, styles.cornerTopLeft]} />
        <View style={[styles.corner, styles.cornerTopRight]} />
        <View style={[styles.corner, styles.cornerBottomLeft]} />
        <View style={[styles.corner, styles.cornerBottomRight]} />
      </LinearGradient>
    </TouchableOpacity>
  );
}

// Calculate responsive dimensions based on screen width
const cardPadding = screenWidth > 400 ? 20 : 16;
const imageSize = screenWidth > 400 ? 80 : screenWidth * 0.18;
const rightSectionWidth = screenWidth > 400 ? 100 : screenWidth * 0.25;

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  ticketContainer: {
    borderRadius: 20,
    padding: cardPadding,
    position: "relative",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  perforation: {
    position: "absolute",
    top: "50%",
    right: rightSectionWidth,
    flexDirection: "column",
    gap: 8,
    transform: [{ translateY: -60 }],
  },
  perforationDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.3)",
  },
  ticketContent: {
    flexDirection: "row",
    gap: screenWidth > 400 ? 16 : 12,
  },
  leftSection: {
    flex: 1,
    flexDirection: "row",
    gap: 12,
  },
  eventImage: {
    width: imageSize,
    height: imageSize,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  eventImagePlaceholder: {
    width: imageSize,
    height: imageSize,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  eventInfo: {
    flex: 1,
    justifyContent: "center",
  },
  eventTitle: {
    fontSize: screenWidth > 400 ? 18 : 16,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 8,
  },
  eventDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  eventDetailText: {
    fontSize: screenWidth > 400 ? 13 : 12,
    fontFamily: Fonts.regular,
    color: "rgba(255,255,255,0.9)",
    flex: 1,
  },
  rightSection: {
    width: rightSectionWidth,
    alignItems: "center",
    justifyContent: "space-between",
  },
  priceContainer: {
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 1,
  },
  priceValue: {
    fontSize: screenWidth > 400 ? 24 : 20,
    fontFamily: Fonts.black,
    color: "#fff",
    marginTop: 4,
  },
  qrPlaceholder: {
    alignItems: "center",
    paddingVertical: 8,
  },
  qrText: {
    fontSize: 10,
    fontFamily: Fonts.semiBold,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
  },
  ticketCodeText: {
    fontSize: 12,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginTop: 2,
    letterSpacing: 1,
  },
  validBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  validBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#10b981",
    letterSpacing: 0.5,
  },
  pastBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pastBadgeText: {
    fontSize: 10,
    fontFamily: Fonts.bold,
    color: "#ef4444",
    letterSpacing: 0.5,
  },
  bottomSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.2)",
    gap: 8,
  },
  purchaseInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  purchaseInfoText: {
    fontSize: screenWidth > 400 ? 12 : 11,
    fontFamily: Fonts.regular,
    color: "rgba(255,255,255,0.8)",
  },
  corner: {
    position: "absolute",
    width: 20,
    height: 20,
    backgroundColor: "#0f0f1a",
    borderRadius: 10,
  },
  cornerTopLeft: {
    top: -10,
    left: -10,
  },
  cornerTopRight: {
    top: -10,
    right: -10,
  },
  cornerBottomLeft: {
    bottom: -10,
    left: -10,
  },
  cornerBottomRight: {
    bottom: -10,
    right: -10,
  },
});
