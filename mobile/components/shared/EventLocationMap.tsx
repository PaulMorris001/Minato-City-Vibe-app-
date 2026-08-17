import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import { cacheRead, cacheWrite } from "@/utils/offlineCache";
import { openInMapsApp } from "@/utils/maps";

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface EventLocationMapProps {
  /** GeoJSON coordinates as stored on the event: [lng, lat]. */
  coordinates?: number[] | null;
  /** Street address, used both for the geocode fallback and the pin label. */
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  /**
   * The event's display location string ("Houston", "Lagos, Nigeria").
   *
   * Load-bearing for older events: the structured city/state/country fields
   * were added after `location`, so events that predate them have nothing else
   * to geocode from. Without this fallback those events show no map at all.
   */
  location?: string | null;
  /** Event title — labels the pin and the hand-off sheet. */
  title: string;
}

// How wide a view the card shows. ~600m across, which frames a venue and
// enough of its surroundings to be recognisable.
const DELTA = 0.006;

/**
 * A venue on a map, tappable to hand off to the user's map app.
 *
 * Events created from 1.2.0 carry a `geo` point set by the host. Everything
 * older has only an address string, so this geocodes it on the device — free
 * and key-less, unlike a server-side geocoding API — and caches the answer so
 * the OS geocoder (which rate-limits) is asked once per venue, not once per
 * open.
 *
 * Renders nothing at all when there is no pin and no address to find one from;
 * a card that says "no map" is worse than no card.
 */
export default function EventLocationMap({
  coordinates,
  address,
  city,
  state,
  country,
  location,
  title,
}: EventLocationMapProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  // Memoized because it's an effect dependency — a fresh object each render
  // would re-run the geocode effect on every render.
  const stored = useMemo<Coordinates | null>(
    () =>
      Array.isArray(coordinates) && coordinates.length === 2
        ? { latitude: coordinates[1], longitude: coordinates[0] }
        : null,
    [coordinates]
  );

  const searchText =
    [address, city, state, country].filter(Boolean).join(", ") ||
    (location || "").trim();

  const [resolved, setResolved] = useState<Coordinates | null>(stored);
  const [geocoding, setGeocoding] = useState(!stored && !!searchText);

  useEffect(() => {
    if (stored || !searchText) return;
    let cancelled = false;
    const cacheKey = `geocode:${searchText.toLowerCase()}`;

    (async () => {
      const hit = await cacheRead<Coordinates>(cacheKey);
      if (cancelled) return;
      if (hit) {
        setResolved(hit.data);
        setGeocoding(false);
        return;
      }
      try {
        const results = await Location.geocodeAsync(searchText);
        if (cancelled) return;
        const first = results?.[0];
        if (first) {
          const point = { latitude: first.latitude, longitude: first.longitude };
          setResolved(point);
          cacheWrite(cacheKey, point);
        }
      } catch {
        // Offline, or the OS geocoder found nothing — fall through to the
        // address-only card below.
      } finally {
        if (!cancelled) setGeocoding(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stored, searchText]);

  if (!stored && !searchText) return null;

  const label = searchText || title;

  const handlePress = () =>
    openInMapsApp({
      latitude: resolved?.latitude,
      longitude: resolved?.longitude,
      label,
    });

  return (
    <Pressable onPress={handlePress} style={styles.wrap} accessibilityRole="button">
      <View style={styles.mapBox}>
        {resolved ? (
          // pointerEvents lives on this wrapper, not the MapView: the native
          // Android map view doesn't honour the prop itself and would swallow
          // the tap that opens the maps app. A live map inside a scroll view
          // would also steal every vertical pan — this card is a picture with
          // a tap target, not a map you drive.
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <MapView
              provider={PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFill}
              initialRegion={{
                ...resolved,
                latitudeDelta: DELTA,
                longitudeDelta: DELTA,
              }}
              scrollEnabled={false}
              zoomEnabled={false}
              rotateEnabled={false}
              pitchEnabled={false}
              toolbarEnabled={false}
            >
              <Marker coordinate={resolved} title={title} description={searchText || undefined} />
            </MapView>
          </View>
        ) : (
          <View style={styles.placeholder}>
            {geocoding ? (
              <ActivityIndicator size="small" color={colors.primaryLight} />
            ) : (
              <Ionicons name="map-outline" size={22} color={colors.textDim} />
            )}
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Ionicons name="navigate-outline" size={15} color={colors.primaryLight} />
        <Text style={styles.footerText} numberOfLines={1}>
          {resolved ? "Get directions" : `Search for ${label}`}
        </Text>
        <Ionicons name="chevron-forward" size={15} color={colors.textDim} />
      </View>
    </Pressable>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      marginTop: 12,
      borderRadius: 12,
      overflow: "hidden",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.glassStroke,
    },
    mapBox: {
      height: 150,
      backgroundColor: c.cardAlt,
    },
    placeholder: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    footer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: c.cardAlt,
    },
    footerText: {
      flex: 1,
      fontFamily: Fonts.semiBold,
      fontSize: 13.5,
      color: c.textBright,
    },
  });
