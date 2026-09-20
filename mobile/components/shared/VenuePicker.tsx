import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { EventVenue } from "@/libs/interfaces";
import { formatLocation } from "@/utils/location";

/**
 * The venues of an event, venue #1 first. Mirrors allVenues() on the server, and
 * the index of each entry IS what the server stores as `locationIndex` — so the
 * order here must stay exactly "top-level location, then additionalLocations".
 */
export function eventVenues(event: {
  location?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  additionalLocations?: EventVenue[] | null;
}): EventVenue[] {
  return [
    {
      location: event.location || "",
      address: event.address,
      city: event.city,
      state: event.state,
      country: event.country,
    },
    ...(event.additionalLocations ?? []),
  ];
}

/** True when this event runs at more than one venue, so a pick is required. */
export function needsVenuePick(event: { additionalLocations?: EventVenue[] | null }): boolean {
  return (event.additionalLocations?.length ?? 0) > 0;
}

interface VenuePickerProps {
  venues: EventVenue[];
  /** The chosen index, or null for "nothing picked yet". */
  value: number | null;
  onChange: (index: number) => void;
  label?: string;
  /** Tighter rows, for use inside a bottom sheet next to other controls. */
  compact?: boolean;
}

/**
 * Which venue of a multi-venue event an attendee is going to. Single-select —
 * one body goes through one door, and the server stores exactly one venue per
 * pass — so these are radios, not checkboxes, however many venues there are.
 */
export default function VenuePicker({
  venues,
  value,
  onChange,
  label = "Which location are you going to?",
  compact = false,
}: VenuePickerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      {venues.map((venue, index) => {
        const selected = value === index;
        const place =
          formatLocation({ city: venue.city, state: venue.state, country: venue.country }) ||
          venue.location;
        return (
          <TouchableOpacity
            key={index}
            style={[
              styles.row,
              compact && styles.rowCompact,
              selected && styles.rowSelected,
            ]}
            onPress={() => onChange(index)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={[venue.address, place].filter(Boolean).join(", ")}
          >
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={selected ? colors.primaryLight : colors.textMuted}
            />
            <View style={styles.rowText}>
              <Text style={styles.venueCity} numberOfLines={1}>
                {place}
              </Text>
              {!!venue.address && (
                <Text style={styles.venueAddress} numberOfLines={2}>
                  {venue.address}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    label: {
      fontSize: 12,
      fontFamily: Fonts.semiBold,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: c.textSecondary,
      marginBottom: 10,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.glassStroke,
      backgroundColor: c.glassFillSubtle,
      marginBottom: 8,
    },
    rowCompact: {
      paddingVertical: 9,
      marginBottom: 6,
    },
    rowSelected: {
      borderColor: c.primaryBorder,
      backgroundColor: c.primaryFaded,
    },
    rowText: {
      flex: 1,
    },
    venueCity: {
      fontSize: 14,
      fontFamily: Fonts.semiBold,
      color: c.textBright,
    },
    venueAddress: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      marginTop: 2,
    },
  });
