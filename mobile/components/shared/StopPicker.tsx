import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Fonts } from "@/constants/fonts";
import { currencyPrefix } from "@/constants/payments";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { EventSubEvent } from "@/libs/interfaces";

/** One stop a guest can say yes to — the main event, or one of its sub-events. */
export interface Stop {
  id: string | null;
  title: string;
  ticketPrice?: number;
  ticketTiers?: EventSubEvent["ticketTiers"];
  soldOut?: boolean;
  remaining?: number;
  salesClosed?: boolean;
}

/**
 * Every stop of an event's programme, main event first — the id of each entry
 * is exactly what the server expects back (`subEvents: (string|null)[]` on
 * RSVP, `subEvent` per item on checkout). Mirrors allStops() on the server.
 */
export function eventStops(event: {
  title: string;
  ticketPrice?: number;
  ticketTiers?: EventSubEvent["ticketTiers"];
  soldOut?: boolean;
  ticketsRemaining?: number;
  salesClosed?: boolean;
  subEvents?: EventSubEvent[] | null;
}): Stop[] {
  return [
    {
      id: null,
      title: event.title,
      ticketPrice: event.ticketPrice,
      ticketTiers: event.ticketTiers,
      soldOut: event.soldOut,
      remaining: event.ticketsRemaining,
      salesClosed: event.salesClosed,
    },
    ...(event.subEvents ?? []).map((s) => ({
      id: s._id,
      title: s.title,
      ticketPrice: s.ticketPrice,
      ticketTiers: s.ticketTiers,
      soldOut: s.soldOut,
      remaining: s.remaining,
      salesClosed: s.salesClosed,
    })),
  ];
}

/** The cheapest price a stop can be had for — 0 means free. */
export function stopFacePrice(stop: Stop): number {
  const tiers = stop.ticketTiers ?? [];
  if (tiers.length) return Math.min(...tiers.map((t) => t.price));
  return stop.ticketPrice ?? 0;
}

/** The sum of whatever's ticked — what a mixed selection actually costs. */
export function selectionTotal(stops: Stop[], selected: (string | null)[]): number {
  const keys = new Set(selected);
  return stops.filter((s) => keys.has(s.id)).reduce((sum, s) => sum + stopFacePrice(s), 0);
}

interface StopPickerProps {
  stops: Stop[];
  value: (string | null)[];
  onChange: (stops: (string | null)[]) => void;
  currency?: string;
}

/**
 * Which stops of a programme the guest is going to. Checkboxes, not radios —
 * unlike a venue pick (one body, one door), a guest can say yes to brunch AND
 * the after-party, and one checkout (or one free RSVP, if nothing ticked costs
 * anything) covers whatever's checked at once.
 */
export default function StopPicker({ stops, value, onChange, currency }: StopPickerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const toggle = (id: string | null, disabled: boolean) => {
    if (disabled) return;
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <View>
      {stops.map((stop) => {
        const checked = value.includes(stop.id);
        const disabled = !!stop.soldOut || !!stop.salesClosed;
        const price = stopFacePrice(stop);
        const priceLabel = !price
          ? "Free"
          : `${(stop.ticketTiers?.length ?? 0) > 1 ? "From " : ""}${currencyPrefix(currency)}${price.toLocaleString()}`;
        return (
          <TouchableOpacity
            key={stop.id ?? "main"}
            style={[styles.row, checked && styles.rowChecked, disabled && styles.rowDisabled]}
            onPress={() => toggle(stop.id, disabled)}
            activeOpacity={disabled ? 1 : 0.75}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityState={{ checked, disabled }}
          >
            <Ionicons
              name={checked ? "checkbox" : "square-outline"}
              size={21}
              color={disabled ? colors.textGhost : checked ? colors.primaryLight : colors.textMuted}
            />
            <View style={styles.rowText}>
              <Text style={styles.title} numberOfLines={1}>
                {stop.title}
              </Text>
              {disabled ? (
                <Text style={styles.subtext}>{stop.soldOut ? "Sold out" : "Sales closed"}</Text>
              ) : stop.remaining !== undefined ? (
                <Text style={styles.subtext}>{stop.remaining} left</Text>
              ) : null}
            </View>
            <Text style={styles.price}>{priceLabel}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
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
    rowChecked: {
      borderColor: c.primaryBorder,
      backgroundColor: c.primaryFaded,
    },
    rowDisabled: { opacity: 0.45 },
    rowText: { flex: 1 },
    title: {
      fontSize: 14.5,
      fontFamily: Fonts.semiBold,
      color: c.textBright,
    },
    subtext: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textDim,
      marginTop: 2,
    },
    price: {
      fontSize: 14,
      fontFamily: Fonts.bold,
      color: c.primaryLight,
    },
  });
