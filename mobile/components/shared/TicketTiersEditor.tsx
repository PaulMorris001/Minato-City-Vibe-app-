import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import InfoTip from "@/components/shared/InfoTip";
import { Fonts } from "@/constants/fonts";
import { currencyPrefix } from "@/constants/payments";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";

const MAX_TIERS = 10;

export interface TierDraft {
  name: string;
  price: string;
  quantity: string;
}

/**
 * The first reason a tier list can't be saved, or null. Ported verbatim from
 * CreateEventModal's inline checks — no new rules, just extracted so the
 * create-event flow's basics screen can call it the same way it calls
 * `hasIncompleteDraft`/`subEventDraftError`.
 */
export function tierDraftError(tiers: TierDraft[]): string | null {
  if (tiers.some((t) => !t.name.trim())) return "Every ticket tier needs a name";
  const names = new Set(tiers.map((t) => t.name.trim().toLowerCase()));
  if (names.size !== tiers.length) return "Tier names must be unique";
  if (tiers.some((t) => !t.price || parseFloat(t.price) <= 0)) {
    return "Every ticket tier needs a price greater than 0";
  }
  // Per-tier quantity is all-or-nothing: either every tier has one (and
  // capacity = their sum) or none do (and the shared Max Guests governs).
  const withQty = tiers.filter((t) => t.quantity.trim() !== "");
  if (withQty.length > 0) {
    if (withQty.length !== tiers.length) {
      return "Set a quantity for every tier, or leave them all blank";
    }
    if (tiers.some((t) => !/^\d+$/.test(t.quantity.trim()) || parseInt(t.quantity) <= 0)) {
      return "Every tier quantity must be a whole number greater than 0";
    }
  }
  return null;
}

/** True when every tier carries a quantity — capacity is then their sum. */
export function tiersHaveQuantities(tiers: TierDraft[]): boolean {
  return tiers.length > 0 && tiers.every((t) => t.quantity.trim() !== "");
}

interface TicketTiersEditorProps {
  value: TierDraft[];
  onChange: (drafts: TierDraft[]) => void;
  currency: string;
  /** The basics screen's flat price, so the first tier seeds from it and
   *  nothing typed there is lost when the organizer switches to tiers. */
  seedPrice?: string;
}

/**
 * Named ticket tiers (Basic, VIP, …), each with its own price and an optional
 * per-tier quantity. Extracted from CreateEventModal, which had this inline
 * while `AdditionalLocationsEditor`/`SubEventsEditor` were already their own
 * components — this brings it in line with those two. No new validation.
 */
export default function TicketTiersEditor({
  value,
  onChange,
  currency,
  seedPrice = "",
}: TicketTiersEditorProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const updateTier = (idx: number, patch: Partial<TierDraft>) =>
    onChange(value.map((t, i) => (i === idx ? { ...t, ...patch } : t)));

  return (
    <View>
      <InfoTip label="HOW TIER QUANTITIES WORK" style={styles.infoTip} labelStyle={styles.infoTipLabel}>
        Quantities are all or nothing. Give every tier one and your capacity becomes
        their total, with each tier selling out on its own. Leave them all blank and
        a single Max Guests number covers the whole event. A mix of the two is
        rejected.
      </InfoTip>

      {value.map((tier, idx) => (
        <View key={idx} style={styles.tierBlock}>
          <View style={styles.tierRow}>
            <TextInput
              style={[styles.input, styles.tierName]}
              placeholder={`Tier ${idx + 1} name`}
              placeholderTextColor={colors.textGhost}
              maxLength={40}
              value={tier.name}
              onChangeText={(name) => updateTier(idx, { name })}
            />
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => onChange(value.filter((_, i) => i !== idx))}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={22} color={colors.error} />
            </TouchableOpacity>
          </View>
          <View style={styles.tierRow}>
            <TextInput
              style={[styles.input, styles.tierFlex]}
              placeholder={currency === "NGN" ? "Price 15000" : "Price 25.00"}
              placeholderTextColor={colors.textGhost}
              keyboardType="decimal-pad"
              value={tier.price}
              onChangeText={(price) => updateTier(idx, { price })}
            />
            <TextInput
              style={[styles.input, styles.tierFlex]}
              placeholder="Qty (optional)"
              placeholderTextColor={colors.textGhost}
              keyboardType="number-pad"
              value={tier.quantity}
              onChangeText={(quantity) => updateTier(idx, { quantity })}
            />
          </View>
        </View>
      ))}

      {value.length < MAX_TIERS && (
        <TouchableOpacity
          style={styles.addRow}
          onPress={() =>
            onChange(
              value.length === 0
                ? [
                    // Seed from the flat price so nothing typed is lost.
                    { name: "General", price: seedPrice, quantity: "" },
                    { name: "", price: "", quantity: "" },
                  ]
                : [...value, { name: "", price: "", quantity: "" }]
            )
          }
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.addText}>
            {value.length === 0
              ? "Add ticket tiers (Basic, VIP, …)"
              : `Add another tier (${value.length}/${MAX_TIERS})`}
          </Text>
        </TouchableOpacity>
      )}

      {tiersHaveQuantities(value) && (
        <>
          <Text style={styles.capacityLabel}>Total Capacity</Text>
          <Text style={styles.hint}>
            {value.reduce((sum, t) => sum + (parseInt(t.quantity) || 0), 0)} tickets — the
            sum of your tier quantities.
          </Text>
        </>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    infoTip: { marginBottom: 8 },
    infoTipLabel: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textDim,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    tierBlock: { marginBottom: 10 },
    tierRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: c.glassStroke,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 16,
      fontFamily: Fonts.regular,
      color: c.textBright,
      backgroundColor: c.glassFillSubtle,
    },
    tierName: { flex: 1 },
    tierFlex: { flex: 1 },
    removeBtn: { padding: 2 },
    addRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10 },
    addText: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.primary,
    },
    capacityLabel: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textDim,
      marginBottom: 4,
      marginTop: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    hint: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textDim,
      lineHeight: 16,
    },
  });
