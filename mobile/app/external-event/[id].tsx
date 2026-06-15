import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as WebBrowser from "expo-web-browser";
import { Fonts } from "@/constants/fonts";
import { AU } from "@/components/auth/tokens";
import { GlassCard } from "@/components/event-details/GlassCard";
import { heroEmojiFor } from "@/utils/eventDetails";
import { externalEventService, ExternalEvent } from "@/services/externalEvent.service";

/**
 * Detail screen for external events (Ticketmaster, Bandsintown, etc).
 *
 * Visual language intentionally mirrors the native event detail screen
 * (mobile/app/event/[id].tsx) so the two feel like the same app. Same hero
 * proportions, same fade gradient, same emoji watermark, same chip row,
 * same GlassCard content blocks. The only major differences:
 *
 *   - No RSVP / share / group chat / favorite (we're a referrer here)
 *   - No purchase sheet — the floating CTA opens the provider checkout in
 *     an in-app browser sheet
 *   - No PUBLIC / PRIVATE chip (these are third-party listings)
 *
 * Most styling is copy-pasted from the native screen so the design tokens
 * stay in sync. If the native screen evolves, mirror changes here too.
 */

const HERO_HEIGHT = 380;

const SOURCE_META: Record<
  ExternalEvent["source"],
  { label: string; chipBg: string; chipBorder: string }
> = {
  ticketmaster: {
    label: "TICKETMASTER",
    chipBg: "rgba(2,108,223,0.22)",
    chipBorder: "rgba(2,108,223,0.45)",
  },
  bandsintown: {
    label: "BANDSINTOWN",
    chipBg: "rgba(0,206,200,0.22)",
    chipBorder: "rgba(0,206,200,0.45)",
  },
};

function GlassRoundIcon({
  icon,
  onPress,
  size = 36,
}: {
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.glassRound, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Ionicons name={icon} size={size * 0.5} color="#fff" />
    </TouchableOpacity>
  );
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

function formatDateLine(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ExternalEventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<ExternalEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      try {
        const res = await externalEventService.getById(id);
        if (!cancelled) setEvent(res.event);
      } catch (err) {
        console.warn("[ExternalEventDetail] load failed:", err);
        if (!cancelled) {
          Alert.alert("Couldn't load event", "Try again later.");
          goBack();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const heroEmoji = useMemo(() => heroEmojiFor(event?.title), [event?.title]);

  const openTicketUrl = async () => {
    if (!event?.ticketUrl) {
      Alert.alert("Unavailable", "No ticket link is available for this event.");
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(event.ticketUrl, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch (err) {
      console.warn("[ExternalEventDetail] openBrowserAsync failed:", err);
      Alert.alert("Couldn't open", "Try again or check your network.");
    }
  };

  const openMaps = () => {
    if (!event) return;
    const dest = [event.venueName, event.address, event.city, event.state, event.country]
      .filter(Boolean)
      .join(", ");
    const q = encodeURIComponent(dest);
    const url = event.geo?.coordinates
      ? `https://maps.apple.com/?ll=${event.geo.coordinates[1]},${event.geo.coordinates[0]}&q=${q}`
      : `https://maps.apple.com/?q=${q}`;
    Linking.openURL(url).catch(() => Alert.alert("Maps unavailable"));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={AU.purple} />
        </SafeAreaView>
      </View>
    );
  }

  if (!event) return null;

  const sourceMeta = SOURCE_META[event.source] ?? {
    label: event.source.toUpperCase(),
    chipBg: "rgba(0,0,0,0.4)",
    chipBorder: "rgba(255,255,255,0.18)",
  };
  const priceLine = formatPriceLine(event);
  const dateLine = formatDateLine(event.date);
  const longDate = formatLongDate(event.date);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={true}>
        {/* ─── HERO ─────────────────────────────────────────── */}
        <View style={styles.hero}>
          {event.image ? (
            <Image
              source={{ uri: event.image }}
              style={styles.heroImage}
              contentFit="cover"
              transition={200}
            />
          ) : null}
          <LinearGradient
            colors={
              event.image
                ? ["transparent", "transparent"]
                : ["#22D3EE", "#7C3AED", "#EC4899"]
            }
            locations={[0, 0.6, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={styles.heroFallback}
          />

          {/* Emoji watermark */}
          <Text style={styles.heroEmoji}>{heroEmoji}</Text>

          {/* Bottom readability fade */}
          <LinearGradient
            colors={["rgba(11,6,19,0)", "rgba(11,6,19,0.55)", AU.bg]}
            locations={[0, 0.5, 1]}
            style={styles.heroFade}
            pointerEvents="none"
          />

          {/* Top chrome */}
          <SafeAreaView edges={["top"]} style={styles.topChromeSafe} pointerEvents="box-none">
            <View style={styles.topChromeRow}>
              <GlassRoundIcon
                icon="chevron-back"
                onPress={() => {
                  if (router.canGoBack()) router.back();
                  else router.replace("/(tabs)/home" as any);
                }}
              />
            </View>
          </SafeAreaView>

          {/* Chip row */}
          <View style={styles.chipRow}>
            {priceLine && (
              <View style={[styles.chip, styles.chipDark]}>
                <Text style={[styles.chipText, { color: AU.text }]}>
                  TICKETED · {priceLine}
                </Text>
              </View>
            )}
            {(event.additionalDates ?? 0) > 0 && (
              <View style={[styles.chip, styles.chipDark]}>
                <Text style={[styles.chipText, { color: AU.text }]}>
                  +{event.additionalDates} MORE {event.additionalDates === 1 ? "DATE" : "DATES"}
                </Text>
              </View>
            )}
          </View>

          {/* Title + meta */}
          <View style={styles.heroBottom}>
            <Text style={styles.heroTitle} numberOfLines={3}>
              {event.title}
            </Text>
            <View style={styles.heroMetaRow}>
              <Ionicons name="calendar-outline" size={14} color={AU.purpleSoft} />
              <Text style={styles.heroMetaText}>{dateLine}</Text>
              {!!event.city && (
                <>
                  <View style={styles.metaDot} />
                  <Ionicons name="location-outline" size={14} color={AU.purpleSoft} />
                  <Text style={styles.heroMetaText}>{event.city}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ─── CONTENT ──────────────────────────────────────── */}
        <View style={styles.content}>
          {/* Gallery (only if we have multiple real images) */}
          {event.images && event.images.length > 1 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.galleryContent}
              style={styles.galleryStrip}
            >
              {event.images.slice(0, 8).map((url) => (
                <Image
                  key={url}
                  source={{ uri: url }}
                  style={styles.galleryImage}
                  contentFit="cover"
                />
              ))}
            </ScrollView>
          )}

          {/* When + Where card */}
          <GlassCard>
            <Text style={styles.microLabel}>When</Text>
            <Text style={styles.factValue}>{longDate}</Text>
            <View style={styles.divider} />
            <Text style={styles.microLabel}>Where</Text>
            <TouchableOpacity onPress={openMaps} activeOpacity={0.8}>
              <Text style={styles.factValue}>
                {event.venueName || event.location || event.city}
              </Text>
              {(event.address || event.city) && (
                <Text style={styles.factSubvalue}>
                  {[event.address, event.city, event.state, event.country]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              )}
              <View style={styles.mapsHintRow}>
                <Ionicons name="navigate-outline" size={13} color={AU.purpleSoft} />
                <Text style={styles.mapsHintText}>Open in Maps</Text>
              </View>
            </TouchableOpacity>
          </GlassCard>

          {/* Category / Genre card */}
          {(event.category || event.genre) && (
            <GlassCard>
              <Text style={styles.microLabel}>Category</Text>
              <Text style={styles.factValue}>
                {[event.category, event.genre, event.subGenre]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </GlassCard>
          )}

          {/* Lineup */}
          {(event.performers?.length ?? 0) > 0 && (
            <GlassCard>
              <Text style={styles.microLabel}>Lineup</Text>
              <View style={styles.performerRow}>
                {event.performers!.map((p) => (
                  <View key={p} style={styles.performerChip}>
                    <Text style={styles.performerText}>{p}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>
          )}

          {/* About */}
          {event.description ? (
            <GlassCard>
              <Text style={styles.microLabel}>About</Text>
              <Text style={styles.aboutText}>{event.description}</Text>
            </GlassCard>
          ) : null}

          {/* Multi-date callout */}
          {(event.additionalDates ?? 0) > 0 && (
            <GlassCard style={{ borderColor: "rgba(168,85,247,0.4)" }}>
              <View style={styles.calloutHeader}>
                <Ionicons name="calendar-outline" size={16} color={AU.purpleSoft} />
                <Text style={styles.microLabel}>More dates available</Text>
              </View>
              <Text style={styles.aboutText}>
                {event.additionalDates === 1
                  ? "1 more date is available for this show. Tap Get Tickets to see all dates on Ticketmaster."
                  : `${event.additionalDates} more dates are available for this show. Tap Get Tickets to see all dates on Ticketmaster.`}
              </Text>
            </GlassCard>
          )}
        </View>
      </ScrollView>

      {/* ─── Floating CTA ─────────────────────────────────── */}
      <SafeAreaView edges={["bottom"]} style={styles.ctaWrap}>
        <TouchableOpacity onPress={openTicketUrl} activeOpacity={0.85}>
          <LinearGradient
            colors={["#A855F7", "#7C3AED", "#EC4899"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaGradient}
          >
            <Ionicons name="ticket" size={18} color="#fff" />
            <Text style={styles.ctaText}>
              Get Tickets on {sourceMeta.label === "TICKETMASTER" ? "Ticketmaster" : sourceMeta.label}
            </Text>
            <Ionicons name="arrow-forward" size={16} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AU.bg },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { paddingBottom: 140 },

  // ── Hero (mirrors native event detail proportions) ────────────
  hero: {
    height: HERO_HEIGHT,
    width: "100%",
    position: "relative",
    backgroundColor: AU.surface,
  },
  heroImage: { ...StyleSheet.absoluteFillObject },
  heroFallback: { ...StyleSheet.absoluteFillObject },
  heroEmoji: {
    position: "absolute",
    right: -30,
    top: 20,
    fontSize: 260,
    opacity: 0.22,
    transform: [{ rotate: "-12deg" }],
  },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 220,
  },

  // Top chrome
  topChromeSafe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  topChromeRow: {
    paddingHorizontal: 16,
    paddingTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  glassRound: {
    backgroundColor: "rgba(11,6,19,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Chips
  chipRow: {
    position: "absolute",
    top: 110,
    left: 18,
    right: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    zIndex: 5,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipDark: {
    backgroundColor: "rgba(0,0,0,0.4)",
    borderColor: "rgba(255,255,255,0.18)",
  },
  chipText: {
    fontFamily: Fonts.bold,
    fontSize: 11,
    letterSpacing: 0.44,
  },

  // Title block over hero
  heroBottom: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 24,
    zIndex: 2,
  },
  heroTitle: {
    color: "#fff",
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 32,
    lineHeight: 32 * 0.97,
    letterSpacing: -1,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 18,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    flexWrap: "wrap",
  },
  heroMetaText: {
    color: "rgba(255,255,255,0.9)",
    fontFamily: Fonts.semiBold,
    fontSize: 13,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.45)",
    marginHorizontal: 4,
  },

  // ── Content
  content: { paddingHorizontal: 18, paddingTop: 16, gap: 14 },

  microLabel: {
    fontFamily: Fonts.bold,
    fontSize: 10,
    color: AU.textMute,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  factValue: {
    fontFamily: Fonts.semiBold,
    fontSize: 15,
    color: AU.text,
  },
  factSubvalue: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: AU.textDim,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: AU.stroke,
    marginVertical: 12,
  },
  mapsHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  mapsHintText: {
    fontFamily: Fonts.semiBold,
    fontSize: 12,
    color: AU.purpleSoft,
  },

  // Gallery
  galleryStrip: { marginBottom: 4 },
  galleryContent: { gap: 10, paddingRight: 8 },
  galleryImage: { width: 140, height: 100, borderRadius: 12 },

  // Lineup chips
  performerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  performerChip: {
    backgroundColor: "rgba(168,85,247,0.15)",
    borderColor: "rgba(168,85,247,0.4)",
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  performerText: {
    fontFamily: Fonts.semiBold,
    fontSize: 13,
    color: "#e9d5ff",
  },

  // About text
  aboutText: {
    fontFamily: Fonts.regular,
    fontSize: 14,
    color: AU.text,
    lineHeight: 21,
  },

  // Callout
  calloutHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  // CTA
  ctaWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: AU.bg,
    borderTopWidth: 1,
    borderTopColor: AU.stroke,
  },
  ctaGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    gap: 10,
  },
  ctaText: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    color: "#fff",
  },
});
