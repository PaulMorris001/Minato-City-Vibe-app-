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
  priceOnRequest?: boolean;
  ticketPrice?: number;
  ticketTiers?: EventSubEvent["ticketTiers"];
  soldOut?: boolean;
  remaining?: number;
  salesClosed?: boolean;
}

/** `tierChoices`/checkout-item keys can't use `null` — this is the one place
 *  that turns a stop id into a stable object/map key (the main event's own
 *  `id` is `null`). */
export const stopKey = (id: string | null): string => id ?? "main";

/**
 * Every stop of an event's programme, main event first — the id of each entry
 * is exactly what the server expects back (`subEvents: (string|null)[]` on
 * RSVP, `subEvent` per item on checkout). Mirrors allStops() on the server.
 */
export function eventStops(event: {
  title: string;
  priceOnRequest?: boolean;
  hidePrice?: boolean;
  isPaid?: boolean;
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
      // `isPaid` carries the main stop on its own because a hidden-price event
      // can sell with no asking price at all, and the organizer's own copy of
      // the event is never redacted, so `priceOnRequest` is absent there.
      priceOnRequest:
        event.priceOnRequest || (event.hidePrice && ((event.ticketPrice ?? 0) > 0 || !!event.isPaid)),
      ticketPrice: event.ticketPrice,
      ticketTiers: event.ticketTiers,
      soldOut: event.soldOut,
      remaining: event.ticketsRemaining,
      salesClosed: event.salesClosed,
    },
    ...(event.subEvents ?? []).map((s) => ({
      id: s._id,
      title: s.title,
      priceOnRequest: s.priceOnRequest || (event.hidePrice && (s.ticketPrice ?? 0) > 0),
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

/** The price actually charged for one stop — the chosen tier's price when the
 *  guest has picked one, else the stop's cheapest (its "From" price). */
function effectivePrice(stop: Stop, tierChoices: Record<string, string>): number {
  const tiers = stop.ticketTiers ?? [];
  if (!tiers.length) return stop.ticketPrice ?? 0;
  const chosen = tiers.find((t) => t._id && t._id === tierChoices[stopKey(stop.id)]);
  return chosen ? chosen.price : stopFacePrice(stop);
}

/** The sum of whatever's ticked — what a mixed selection actually costs.
 *  Reflects each stop's CHOSEN tier when one was picked, not just its
 *  cheapest, so the total matches what checkout will actually charge. */
export function selectionTotal(
  stops: Stop[],
  selected: (string | null)[],
  tierChoices: Record<string, string> = {}
): number {
  const keys = new Set(selected);
  return stops
    .filter((s) => keys.has(s.id))
    .reduce((sum, s) => sum + effectivePrice(s, tierChoices), 0);
}

interface StopPickerProps {
  stops: Stop[];
  value: (string | null)[];
  onChange: (stops: (string | null)[]) => void;
  /** Which tier is picked for each checked stop that has more than one —
   *  keyed by stopKey(stop.id). A stop with 0 or 1 tier needs no entry. */
  tierChoices: Record<string, string>;
  onTierChange: (key: string, tierId: string) => void;
  currency?: string;
}

/**
 * Which stops of a programme the guest is going to. Checkboxes, not radios —
 * unlike a venue pick (one body, one door), a guest can say yes to brunch AND
 * the after-party, and one checkout (or one free RSVP, if nothing ticked costs
 * anything) covers whatever's checked at once.
 *
 * A checked stop with more than one price band expands to show every tier —
 * checking it alone used to silently charge the cheapest one with no way to
 * pick anything else.
 */
export default function StopPicker({
  stops,
  value,
  onChange,
  tierChoices,
  onTierChange,
  currency,
}: StopPickerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const toggle = (stop: Stop) => {
    if (stop.soldOut || stop.salesClosed) return;
    const key = stopKey(stop.id);
    if (value.includes(stop.id)) {
      onChange(value.filter((v) => v !== stop.id));
      return;
    }
    onChange([...value, stop.id]);
    // Default a freshly-checked multi-tier stop to its cheapest band — the
    // tier rows below let the guest change their mind, same as leaving a
    // radio group on its first option rather than nothing selected.
    const tiers = stop.ticketTiers ?? [];
    if (tiers.length > 1 && !tierChoices[key]) {
      const cheapest = tiers.reduce((min, t) => (t.price < min.price ? t : min), tiers[0]);
      if (cheapest._id) onTierChange(key, cheapest._id);
    }
  };

  return (
    <View>
      {stops.map((stop) => {
        const checked = value.includes(stop.id);
        const disabled = !!stop.soldOut || !!stop.salesClosed;
        const tiers = stop.ticketTiers ?? [];
        const hasMultipleTiers = tiers.length > 1;
        const price = effectivePrice(stop, tierChoices);
        const priceLabel = stop.priceOnRequest ? "Price on request" : !price
          ? "Free"
          : `${!checked && hasMultipleTiers ? "From " : ""}${currencyPrefix(currency)}${price.toLocaleString()}`;
        const key = stopKey(stop.id);
        return (
          <View key={key} style={styles.stopWrap}>
            <TouchableOpacity
              style={[styles.row, checked && styles.rowChecked, disabled && styles.rowDisabled]}
              onPress={() => toggle(stop)}
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

            {checked && hasMultipleTiers && !stop.priceOnRequest && (
              <View style={styles.tierGroup}>
                {tiers.map((tier) => {
                  const tierChosen = !!tier._id && tierChoices[key] === tier._id;
                  const tierSoldOut = !!tier.soldOut;
                  return (
                    <TouchableOpacity
                      key={tier._id ?? tier.name}
                      style={[
                        styles.tierChip,
                        tierChosen && styles.tierChipActive,
                        tierSoldOut && styles.rowDisabled,
                      ]}
                      onPress={() => tier._id && !tierSoldOut && onTierChange(key, tier._id)}
                      disabled={tierSoldOut || !tier._id}
                      activeOpacity={0.75}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: tierChosen, disabled: tierSoldOut }}
                    >
                      <Ionicons
                        name={tierChosen ? "radio-button-on" : "radio-button-off"}
                        size={16}
                        color={tierChosen ? colors.primaryLight : colors.textMuted}
                      />
                      <Text style={[styles.tierChipText, tierChosen && styles.tierChipTextActive]} numberOfLines={1}>
                        {tier.name}
                      </Text>
                      <Text style={[styles.tierChipPrice, tierChosen && styles.tierChipTextActive]}>
                        {currencyPrefix(currency)}{tier.price.toLocaleString()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    stopWrap: { marginBottom: 8 },
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
    tierGroup: {
      gap: 6,
      marginTop: 6,
      marginLeft: 16,
      paddingLeft: 17,
      borderLeftWidth: 1,
      borderLeftColor: c.glassStroke,
    },
    tierChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.glassStroke,
      backgroundColor: c.glassFillSubtle,
    },
    tierChipActive: {
      borderColor: c.primaryBorder,
      backgroundColor: c.primaryFaded,
    },
    tierChipText: {
      flex: 1,
      fontSize: 13,
      fontFamily: Fonts.medium,
      color: c.textDim,
    },
    tierChipTextActive: { color: c.textBright },
    tierChipPrice: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textDim,
    },
  });
