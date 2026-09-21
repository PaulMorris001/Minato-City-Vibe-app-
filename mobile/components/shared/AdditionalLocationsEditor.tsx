import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import LocationPicker from "@/components/shared/LocationPicker";
import LocationPinPicker, { PinnedCoordinates } from "@/components/shared/LocationPinPicker";
import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { EventVenue, LocationSelection } from "@/libs/interfaces";
import { formatLocation } from "@/utils/location";
import { scaleFontSize } from "@/utils/responsive";

// Venue #1 is the event's own location, so this is 10 total — mirrors
// MAX_EVENT_LOCATIONS in server/src/utils/eventLocations.js.
const MAX_ADDITIONAL = 9;

export interface LocationDraft {
  /**
   * Stable row identity. LocationPicker copies `value` into its own state on
   * mount, so keying rows by index would hand one venue's country/state
   * dropdowns to the next row the moment an earlier row is removed.
   */
  key: string;
  address: string;
  selection: LocationSelection | null;
  pin: PinnedCoordinates | null;
}

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Seed editor rows from a saved event's additionalLocations. */
export function draftsFromVenues(venues?: EventVenue[] | null): LocationDraft[] {
  return (venues || []).map((v) => {
    const coords = v.geo?.coordinates;
    return {
      key: newKey(),
      address: v.address || "",
      selection: v.city
        ? { country: v.country || "United States", state: v.state || "", city: v.city }
        : null,
      pin:
        Array.isArray(coords) && coords.length === 2
          ? { latitude: coords[1], longitude: coords[0] }
          : null,
    };
  });
}

/** True when any row is missing the city/state the server requires. */
export function hasIncompleteDraft(drafts: LocationDraft[]): boolean {
  return drafts.some((d) => !d.selection?.city || !d.selection?.state);
}

/**
 * The `additionalLocations` payload — same flat shape as venue #1's fields,
 * with the pin as plain latitude/longitude. Call after hasIncompleteDraft.
 */
export function venuesFromDrafts(drafts: LocationDraft[]) {
  return drafts.map((d) => ({
    location: formatLocation(d.selection!),
    address: d.address.trim(),
    city: d.selection!.city,
    state: d.selection!.state,
    country: d.selection!.country,
    ...(d.pin ?? {}),
  }));
}

interface AdditionalLocationsEditorProps {
  value: LocationDraft[];
  onChange: (drafts: LocationDraft[]) => void;
}

/**
 * The other venues an in-person event runs at in parallel, beneath the
 * event's own location fields. Each is a card with the same three inputs as
 * venue #1 — address, country/state/city, optional map pin. Carries no
 * horizontal margin; the parent form sets the gutter.
 */
export default function AdditionalLocationsEditor({ value, onChange }: AdditionalLocationsEditorProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [pinningKey, setPinningKey] = useState<string | null>(null);

  const update = (key: string, patch: Partial<LocationDraft>) =>
    onChange(value.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const pinning = value.find((d) => d.key === pinningKey) ?? null;

  return (
    <View>
      {value.map((draft, i) => (
        <View key={draft.key} style={styles.card}>
          <View style={styles.cardHeader}>
            {/* Venue #1 is the event's own location, so extras start at 2. */}
            <Text style={styles.cardTitle}>Location {i + 2}</Text>
            <TouchableOpacity
              onPress={() => onChange(value.filter((d) => d.key !== draft.key))}
              hitSlop={10}
              accessibilityLabel={`Remove location ${i + 2}`}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Address, e.g. 221B Baker Street, London"
            placeholderTextColor={colors.textGhost}
            value={draft.address}
            onChangeText={(address) => update(draft.key, { address })}
          />

          <LocationPicker
            value={draft.selection ?? undefined}
            onChange={(selection) => update(draft.key, { selection })}
            label="Location"
            required
          />

          <TouchableOpacity
            style={styles.pinRow}
            onPress={() => setPinningKey(draft.key)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={draft.pin ? "location" : "location-outline"}
              size={17}
              color={draft.pin ? colors.primaryLight : colors.textDim}
            />
            <Text style={styles.pinRowText}>
              {draft.pin ? "Map pin set" : "Pin the exact spot on a map"}
            </Text>
            <Text style={styles.pinRowAction}>{draft.pin ? "Change" : "Optional"}</Text>
          </TouchableOpacity>
        </View>
      ))}

      {value.length < MAX_ADDITIONAL && (
        <TouchableOpacity
          style={styles.addRow}
          onPress={() =>
            onChange([...value, { key: newKey(), address: "", selection: null, pin: null }])
          }
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primaryLight} />
          <Text style={styles.addText}>
            {value.length ? "Add another location" : "Also happening somewhere else? Add a location"}
          </Text>
        </TouchableOpacity>
      )}

      <LocationPinPicker
        visible={!!pinning}
        onClose={() => setPinningKey(null)}
        onConfirm={(pin) => pinning && update(pinning.key, { pin })}
        initial={pinning?.pin}
        searchText={[
          pinning?.address.trim(),
          pinning?.selection?.city,
          pinning?.selection?.state,
          pinning?.selection?.country,
        ]
          .filter(Boolean)
          .join(", ")}
      />
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      marginTop: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: c.glassStroke,
      borderRadius: 14,
      backgroundColor: c.glassFillSubtle,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    cardTitle: {
      fontSize: scaleFontSize(13),
      fontFamily: Fonts.semiBold,
      color: c.textDim,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    input: {
      borderWidth: 1,
      borderColor: c.glassStroke,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: scaleFontSize(16),
      fontFamily: Fonts.regular,
      color: c.textBright,
      backgroundColor: c.glassFillSubtle,
      marginBottom: 12,
    },
    pinRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor: c.glassStroke,
      borderRadius: 12,
    },
    pinRowText: {
      flex: 1,
      fontFamily: Fonts.medium,
      fontSize: scaleFontSize(14),
      color: c.textBright,
    },
    pinRowAction: {
      fontFamily: Fonts.semiBold,
      fontSize: scaleFontSize(12.5),
      color: c.textDim,
    },
    addRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 12,
      paddingVertical: 10,
    },
    addText: {
      fontFamily: Fonts.semiBold,
      fontSize: scaleFontSize(14),
      color: c.primaryLight,
    },
  });
