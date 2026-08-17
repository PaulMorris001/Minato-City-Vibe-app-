import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import MapView, { MapPressEvent, Marker, PROVIDER_DEFAULT, Region } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import BottomSheetModal from "@/components/shared/BottomSheetModal";
import PrimaryButton from "@/components/shared/PrimaryButton";
import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

export interface PinnedCoordinates {
  latitude: number;
  longitude: number;
}

interface LocationPinPickerProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (coords: PinnedCoordinates) => void;
  /** Address text the host already typed — the pin is seeded by geocoding it. */
  searchText: string;
  /** Existing pin when editing an event that already has one. */
  initial?: PinnedCoordinates | null;
}

const DELTA = 0.004;
// Somewhere neutral to open on when we have nothing to geocode. Only ever seen
// if the host opens the picker before typing an address.
const FALLBACK: PinnedCoordinates = { latitude: 6.5244, longitude: 3.3792 };

/**
 * Drop the exact pin for a venue.
 *
 * Geocoding an address gets you the right street but often the wrong side of
 * it, and rooftop bars, festival grounds and house parties rarely have a
 * clean postal address at all. The host gets the geocoded guess and drags it
 * (or taps) to where guests should actually walk.
 */
export default function LocationPinPicker({
  visible,
  onClose,
  onConfirm,
  searchText,
  initial,
}: LocationPinPickerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [pin, setPin] = useState<PinnedCoordinates | null>(initial ?? null);
  const [region, setRegion] = useState<Region | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Seed once per opening. Reopening after editing the address re-geocodes,
  // which is what the host expects when they fix a typo and try again.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    const settle = (coords: PinnedCoordinates) => {
      if (cancelled) return;
      setPin(coords);
      setRegion({ ...coords, latitudeDelta: DELTA, longitudeDelta: DELTA });
      setSeeding(false);
    };

    if (initial) {
      settle(initial);
      return;
    }
    if (!searchText.trim()) {
      settle(FALLBACK);
      return;
    }

    setSeeding(true);
    (async () => {
      try {
        const results = await Location.geocodeAsync(searchText);
        const first = results?.[0];
        settle(first ? { latitude: first.latitude, longitude: first.longitude } : FALLBACK);
      } catch {
        settle(FALLBACK);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, searchText, initial]);

  const handleMapPress = (e: MapPressEvent) => setPin(e.nativeEvent.coordinate);

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Pin the exact spot"
      scrollable={false}
      maxHeight="88%"
    >
      <View style={styles.body}>
        <Text style={styles.hint}>
          Drag the pin — or tap the map — to where guests should actually arrive.
        </Text>

        <View style={styles.mapBox}>
          {region ? (
            <MapView
              provider={PROVIDER_DEFAULT}
              style={StyleSheet.absoluteFill}
              initialRegion={region}
              onPress={handleMapPress}
            >
              {pin && (
                <Marker
                  coordinate={pin}
                  draggable
                  onDragEnd={(e) => setPin(e.nativeEvent.coordinate)}
                />
              )}
            </MapView>
          ) : (
            <View style={styles.placeholder}>
              <ActivityIndicator color={colors.primaryLight} />
              {seeding && <Text style={styles.placeholderText}>Finding that address…</Text>}
            </View>
          )}
        </View>

        {pin && (
          <View style={styles.coordRow}>
            <Ionicons name="location" size={14} color={colors.primaryLight} />
            <Text style={styles.coordText}>
              {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
            </Text>
          </View>
        )}

        <PrimaryButton
          disabled={!pin}
          onPress={() => {
            if (pin) onConfirm(pin);
            onClose();
          }}
        >
          Use this location
        </PrimaryButton>
        <TouchableOpacity onPress={onClose} style={styles.skip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </BottomSheetModal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    body: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
    hint: {
      fontFamily: Fonts.regular,
      fontSize: 13,
      color: c.textDim,
      lineHeight: 18,
    },
    mapBox: {
      height: 320,
      borderRadius: 14,
      overflow: "hidden",
      backgroundColor: c.cardAlt,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.glassStroke,
    },
    placeholder: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    placeholderText: {
      fontFamily: Fonts.regular,
      fontSize: 12.5,
      color: c.textDim,
    },
    coordRow: { flexDirection: "row", alignItems: "center", gap: 6 },
    coordText: {
      fontFamily: Fonts.medium,
      fontSize: 12.5,
      color: c.textDim,
    },
    skip: { alignSelf: "center", paddingVertical: 10 },
    skipText: {
      fontFamily: Fonts.semiBold,
      fontSize: 13.5,
      color: c.textDim,
    },
  });
