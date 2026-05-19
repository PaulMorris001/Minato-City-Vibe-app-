import React, { useMemo } from "react";
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useFormatPrice } from "@/hooks/useFormatPrice";

const TK_BG = "#0B0613";
const TK_SURFACE = "rgba(26,16,48,0.7)";
const TK_STROKE = "rgba(255,255,255,0.08)";
const TK_STROKE_HI = "rgba(255,255,255,0.14)";
const TK_TEXT = "#F4EEFF";
const TK_TEXT_DIM = "rgba(244,238,255,0.62)";
const TK_TEXT_MUTE = "rgba(244,238,255,0.38)";
const TK_GREEN_SOFT = "#6EE7B7";
const TK_GREEN = "#34D399";
const TK_AMBER_SOFT = "#FCD34D";

const COVER_FALLBACKS: [string, string, string][] = [
  ["#22D3EE", "#1A1030", "#7C3AED"],
  ["#EC4899", "#7C3AED", "#0B0613"],
  ["#F59E0B", "#EC4899", "#7C3AED"],
  ["#0B0613", "#7C3AED", "#EC4899"],
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function fallbackGradient(seed: string): [string, string, string] {
  return COVER_FALLBACKS[hashString(seed) % COVER_FALLBACKS.length];
}

const ORGANIZER_COLORS = ["#22D3EE", "#EC4899", "#A855F7", "#F59E0B", "#34D399", "#7C3AED"];
function organizerColor(seed: string): string {
  return ORGANIZER_COLORS[hashString(seed) % ORGANIZER_COLORS.length];
}

// Decorative QR — deterministic grid of cells from the ticket code seed.
function DecorativeQR({ seed, size = 50, color = TK_TEXT }: { seed: string; size?: number; color?: string }) {
  const grid = 11;
  const cells = useMemo(() => {
    let h = hashString(seed) || 1;
    const arr: boolean[] = [];
    for (let i = 0; i < grid * grid; i++) {
      h = (h * 1103515245 + 12345) & 0x7fffffff;
      arr.push(h % 100 > 50);
    }
    const setBlock = (r: number, c: number) => {
      for (let dr = 0; dr < 3; dr++)
        for (let dc = 0; dc < 3; dc++) {
          const i = (r + dr) * grid + (c + dc);
          if (i < arr.length) arr[i] = dr === 0 || dr === 2 || dc === 0 || dc === 2;
        }
    };
    setBlock(0, 0);
    setBlock(0, grid - 3);
    setBlock(grid - 3, 0);
    return arr;
  }, [seed]);

  const cell = size / grid;
  return (
    <View style={{ width: size, height: size, flexDirection: "row", flexWrap: "wrap" }}>
      {cells.map((on, i) => (
        <View
          key={i}
          style={{
            width: cell,
            height: cell,
            backgroundColor: on ? color : "transparent",
          }}
        />
      ))}
    </View>
  );
}

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
  const status: "valid" | "expired" = isPastEvent || !ticket.isValid ? "expired" : "valid";

  const city = ticket.event.location?.split(",")[0]?.trim() || ticket.event.location || "";
  const dateLabel = eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timeLabel = eventDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const organizerName = ticket.event.createdBy?.username || "Organizer";
  const organizerInitial = organizerName.charAt(0).toUpperCase();
  const orgColor = organizerColor(ticket.event.createdBy?._id || organizerName);

  const code = ticket.ticketCode.substring(0, 8).toUpperCase();
  const fallback = fallbackGradient(ticket.event._id);

  const statusLabel = status === "valid" ? "VALID" : "EXPIRED";
  const statusColor = status === "valid" ? TK_GREEN_SOFT : TK_TEXT_MUTE;
  const statusDotColor = status === "valid" ? TK_GREEN : "rgba(255,255,255,0.4)";

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.92}
      onPress={() => router.push(`/event/${ticket.event._id}` as any)}
    >
      {/* Poster */}
      <View style={styles.poster}>
        {ticket.event.image ? (
          <ImageBackground source={{ uri: ticket.event.image }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={fallback}
            locations={[0, 0.5, 1]}
            start={{ x: 0.15, y: 0 }}
            end={{ x: 0.85, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        )}

        {/* Readability overlay */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.45)"]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* Grayscale tint for expired/used */}
        {status === "expired" && <View style={styles.grayOverlay} pointerEvents="none" />}

        {/* Top chip row */}
        <View style={styles.topRow} pointerEvents="none">
          <View style={styles.admitStamp}>
            <Text style={styles.admitText}>ADMIT ONE</Text>
          </View>
          <View style={styles.priceChip}>
            <Text style={styles.priceText}>${formatPrice(ticket.ticketPrice)}</Text>
          </View>
        </View>

        {/* Title block */}
        <View style={styles.posterTitleBlock} pointerEvents="none">
          <Text style={styles.posterTitle} numberOfLines={1}>
            {ticket.event.title}
          </Text>
          <View style={styles.metaRow}>
            {city ? (
              <>
                <Text style={styles.metaText}>{city}</Text>
                <View style={styles.metaDot} />
              </>
            ) : null}
            <Text style={styles.metaText}>{dateLabel}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>{timeLabel}</Text>
          </View>
        </View>
      </View>

      {/* Perforation */}
      <View style={styles.perforation} pointerEvents="none">
        <View style={[styles.notch, { left: -8 }]} />
        <View style={[styles.notch, { right: -8 }]} />
        <View style={styles.dashRow}>
          {Array.from({ length: 28 }).map((_, i) => (
            <View key={i} style={styles.dash} />
          ))}
        </View>
      </View>

      {/* Stub */}
      <View style={styles.stub}>
        <View style={styles.qrBox}>
          <DecorativeQR seed={ticket.ticketCode} size={50} color={TK_TEXT} />
        </View>
        <View style={styles.stubRight}>
          <Text style={styles.codeLabel}>TICKET CODE</Text>
          <Text style={styles.codeValue}>{code}</Text>
          <View style={styles.stubBottom}>
            <View style={styles.organizerRow}>
              <View style={[styles.avatar, { backgroundColor: orgColor }]}>
                <Text style={styles.avatarText}>{organizerInitial}</Text>
              </View>
              <Text style={styles.organizerName} numberOfLines={1}>
                {organizerName}
              </Text>
            </View>
            <View style={styles.validityPill}>
              <View style={[styles.validityDot, { backgroundColor: statusDotColor }]} />
              <Text style={[styles.validityText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "relative",
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: TK_SURFACE,
    borderWidth: 1,
    borderColor: TK_STROKE,
    shadowColor: "#7C3AED",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 12,
  },

  // Poster
  poster: {
    position: "relative",
    height: 132,
    overflow: "hidden",
  },
  grayOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  topRow: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  admitStamp: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.7)",
    backgroundColor: "rgba(0,0,0,0.25)",
    transform: [{ rotate: "-2deg" }],
  },
  admitText: {
    color: "#fff",
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 9,
    letterSpacing: 1.6,
  },
  priceChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  priceText: {
    color: "#fff",
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  posterTitleBlock: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 12,
  },
  posterTitle: {
    color: "#fff",
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 22,
    letterSpacing: -0.6,
    lineHeight: 24,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  metaRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    color: "rgba(255,255,255,0.85)",
    fontFamily: "Outfit_600SemiBold",
    fontSize: 11,
  },
  metaDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.6)",
    marginHorizontal: 6,
  },

  // Perforation
  perforation: {
    position: "relative",
    height: 16,
  },
  notch: {
    position: "absolute",
    top: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: TK_BG,
  },
  dashRow: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 7,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dash: {
    width: 6,
    height: 1.5,
    backgroundColor: TK_STROKE_HI,
    borderRadius: 1,
  },

  // Stub
  stub: {
    paddingTop: 4,
    paddingBottom: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  qrBox: {
    width: 60,
    height: 60,
    borderRadius: 10,
    padding: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: TK_STROKE_HI,
    alignItems: "center",
    justifyContent: "center",
  },
  stubRight: {
    flex: 1,
    minWidth: 0,
  },
  codeLabel: {
    fontFamily: "Outfit_700Bold",
    fontSize: 9,
    color: TK_TEXT_MUTE,
    letterSpacing: 1.2,
  },
  codeValue: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 16,
    color: TK_TEXT,
    letterSpacing: 0.6,
    marginTop: 2,
  },
  stubBottom: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  organizerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  avatar: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontFamily: "Outfit_700Bold",
    fontSize: 8,
  },
  organizerName: {
    flex: 1,
    fontFamily: "Outfit_500Medium",
    fontSize: 10.5,
    color: TK_TEXT_DIM,
  },
  validityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: 8,
  },
  validityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    shadowColor: TK_GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  validityText: {
    fontFamily: "Outfit_700Bold",
    fontSize: 9.5,
    letterSpacing: 0.6,
  },
});

export { TK_BG, TK_SURFACE, TK_STROKE, TK_STROKE_HI, TK_TEXT, TK_TEXT_DIM, TK_TEXT_MUTE, TK_GREEN_SOFT, TK_AMBER_SOFT };
