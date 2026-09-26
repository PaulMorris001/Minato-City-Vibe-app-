import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import DateTimeDropdown from "@/components/shared/DateTimeDropdown";
import InfoTip from "@/components/shared/InfoTip";
import LocationPicker from "@/components/shared/LocationPicker";
import LocationPinPicker, { PinnedCoordinates } from "@/components/shared/LocationPinPicker";
import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { EventSubEvent, LocationSelection } from "@/libs/interfaces";
import { formatLocation } from "@/utils/location";
import { scaleFontSize } from "@/utils/responsive";

// Mirrors MAX_SUB_EVENTS in server/src/utils/subEvents.js.
const MAX_SUB_EVENTS = 9;
const MAX_TIERS = 10;

interface TierDraft {
  name: string;
  price: string;
  quantity: string;
}

export interface SubEventDraft {
  /**
   * Stable row identity, same reason as LocationDraft.key: LocationPicker and
   * DateTimeDropdown both copy `value` into their own state on mount, so keying
   * rows by index hands one stop's dropdowns to the next the moment an earlier
   * row is removed.
   */
  key: string;
  /**
   * The server `_id`, sent back on an edit so the stop keeps its identity.
   * Absent on a row the organizer has just added. Without this, updateEvent
   * replacing the array would renumber every stop and move attendees between
   * them.
   */
  id?: string;
  title: string;
  description: string;
  address: string;
  selection: LocationSelection | null;
  pin: PinnedCoordinates | null;
  /** ISO strings, straight from DateTimeDropdown. */
  date: string;
  endDate: string;
  /** Flat price, used only while `tiers` is empty. */
  price: string;
  tiers: TierDraft[];
  maxGuests: string;
}

const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const emptyDraft = (): SubEventDraft => ({
  key: newKey(),
  title: "",
  description: "",
  address: "",
  selection: null,
  pin: null,
  date: "",
  endDate: "",
  price: "",
  tiers: [],
  maxGuests: "",
});

/** Seed editor rows from a saved event's subEvents. */
export function draftsFromSubEvents(subEvents?: EventSubEvent[] | null): SubEventDraft[] {
  return (subEvents || []).map((s) => {
    const coords = s.geo?.coordinates;
    return {
      key: newKey(),
      id: s._id,
      title: s.title || "",
      description: s.description || "",
      address: s.address || "",
      selection: s.city
        ? { country: s.country || "United States", state: s.state || "", city: s.city }
        : null,
      pin:
        Array.isArray(coords) && coords.length === 2
          ? { latitude: coords[1], longitude: coords[0] }
          : null,
      date: s.date || "",
      endDate: s.endDate || "",
      // A tiered stop mirrors its cheapest band into ticketPrice, so showing
      // that as the flat price too would look like a third, separate price.
      price: s.ticketTiers?.length ? "" : s.ticketPrice ? String(s.ticketPrice) : "",
      tiers: (s.ticketTiers || []).map((t) => ({
        name: t.name || "",
        price: t.price != null ? String(t.price) : "",
        quantity: t.quantity != null ? String(t.quantity) : "",
      })),
      maxGuests: s.maxGuests ? String(s.maxGuests) : "",
    };
  });
}

/**
 * The first reason a row can't be saved, or null. Returns a message rather than
 * a boolean because a programme row has several ways to be incomplete and
 * "something's wrong somewhere" is useless to the organizer.
 */
export function subEventDraftError(drafts: SubEventDraft[]): string | null {
  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    const label = d.title.trim() ? `"${d.title.trim()}"` : `Sub-event ${i + 1}`;
    if (!d.title.trim()) return `Sub-event ${i + 1} needs a name.`;
    if (!d.date) return `${label} needs a start date and time.`;
    if (!d.selection?.city || !d.selection?.state) {
      return `${label} needs a country, state and city — or remove it.`;
    }
    if (d.tiers.length) {
      if (d.tiers.some((t) => !t.name.trim())) return `Every price band on ${label} needs a name.`;
      if (d.tiers.some((t) => !(Number(t.price) > 0))) {
        return `Every price band on ${label} needs a price above zero.`;
      }
      const withQty = d.tiers.filter((t) => t.quantity.trim()).length;
      if (withQty !== 0 && withQty !== d.tiers.length) {
        return `Set a quantity for every price band on ${label}, or leave them all blank.`;
      }
    } else if (d.price.trim() && !(Number(d.price) >= 0)) {
      return `${label} has an invalid price.`;
    }
  }
  return null;
}

/** The `subEvents` payload. Call after subEventDraftError returns null. */
export function subEventsFromDrafts(drafts: SubEventDraft[]) {
  return drafts.map((d) => ({
    ...(d.id ? { _id: d.id } : {}),
    title: d.title.trim(),
    description: d.description.trim(),
    location: formatLocation(d.selection!),
    address: d.address.trim(),
    city: d.selection!.city,
    state: d.selection!.state,
    country: d.selection!.country,
    date: d.date,
    ...(d.endDate ? { endDate: d.endDate } : {}),
    ...(d.tiers.length
      ? {
          ticketTiers: d.tiers.map((t) => ({
            name: t.name.trim(),
            price: Number(t.price),
            ...(t.quantity.trim() ? { quantity: Number(t.quantity) } : {}),
          })),
        }
      : { ticketPrice: d.price.trim() ? Number(d.price) : 0 }),
    maxGuests: d.maxGuests.trim() ? Number(d.maxGuests) : 0,
    ...(d.pin ?? {}),
  }));
}

interface SubEventsEditorProps {
  value: SubEventDraft[];
  onChange: (drafts: SubEventDraft[]) => void;
  /** The event's own currency symbol/code, shown beside each price field. */
  currency?: string;
  /** Disabled with an explanation when the event already has extra venues. */
  disabledReason?: string | null;
  /**
   * The umbrella event's own start/end (ISO strings) — no stop can be scheduled
   * before it opens or after it closes. `eventEnd` is optional, same as the
   * event's own: a single-moment event has no upper bound on its stops either.
   */
  eventStart: string;
  eventEnd?: string;
}

/**
 * The programme of an event — the distinct things happening under one
 * invitation, each with its own venue, time, price and guest limit. Guests say
 * yes to whichever stops they want.
 *
 * Follows AdditionalLocationsEditor's contract exactly (controlled value/onChange,
 * stable row keys, one shared pin picker, pure hydrate/validate/serialise
 * helpers) so both editors behave identically in the create and edit forms.
 * Carries no horizontal margin; the parent form sets the gutter.
 */
export default function SubEventsEditor({
  value,
  onChange,
  currency = "",
  disabledReason = null,
  eventStart,
  eventEnd,
}: SubEventsEditorProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [pinningKey, setPinningKey] = useState<string | null>(null);

  const minStart = eventStart ? new Date(eventStart) : new Date();
  const maxEnd = eventEnd ? new Date(eventEnd) : undefined;

  const update = (key: string, patch: Partial<SubEventDraft>) =>
    onChange(value.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const updateTier = (key: string, idx: number, patch: Partial<TierDraft>) =>
    onChange(
      value.map((d) =>
        d.key === key
          ? { ...d, tiers: d.tiers.map((t, i) => (i === idx ? { ...t, ...patch } : t)) }
          : d
      )
    );

  const pinning = value.find((d) => d.key === pinningKey) ?? null;

  const tip = (
    <InfoTip label="WHAT'S A SUB-EVENT?" style={styles.infoTip} labelStyle={styles.infoTipLabel}>
      A programme of separate stops under one invitation — brunch, then dinner, then
      the after-party. Each stop carries its own time, place, price and guest limit,
      and guests say yes to whichever ones they want: a free stop is an RSVP, a priced
      one has to be paid for. Ticket sales open and close per stop, so finishing one
      leaves the rest on sale. An event can have a programme or extra locations, never
      both.
    </InfoTip>
  );

  if (disabledReason) {
    return (
      <View>
        {tip}
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={17} color={colors.textDim} />
          <Text style={styles.noticeText}>{disabledReason}</Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      {tip}
      {value.map((draft, i) => (
        <View key={draft.key} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Sub-event {i + 1}</Text>
            <TouchableOpacity
              onPress={() => onChange(value.filter((d) => d.key !== draft.key))}
              hitSlop={10}
              accessibilityLabel={`Remove sub-event ${i + 1}`}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="What's happening? e.g. Brunch at Four Guys"
            placeholderTextColor={colors.textGhost}
            value={draft.title}
            maxLength={80}
            onChangeText={(title) => update(draft.key, { title })}
          />

          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Anything guests should know (optional)"
            placeholderTextColor={colors.textGhost}
            value={draft.description}
            onChangeText={(description) => update(draft.key, { description })}
            multiline
          />

          <Text style={styles.fieldLabel}>Starts</Text>
          <DateTimeDropdown
            value={draft.date ? new Date(draft.date) : null}
            onChange={(d) => update(draft.key, { date: d.toISOString() })}
            minimumDate={minStart}
            maximumDate={maxEnd}
            defaultHour={18}
          />

          {!!draft.date && (
            <>
              <Text style={styles.fieldLabel}>Ends (optional)</Text>
              <DateTimeDropdown
                value={draft.endDate ? new Date(draft.endDate) : null}
                onChange={(d) => update(draft.key, { endDate: d.toISOString() })}
                minimumDate={new Date(draft.date)}
                maximumDate={maxEnd}
              />
              {!!draft.endDate && (
                <TouchableOpacity
                  onPress={() => update(draft.key, { endDate: "" })}
                  style={styles.clearRow}
                >
                  <Text style={styles.clearText}>Clear end time</Text>
                </TouchableOpacity>
              )}
            </>
          )}

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

          {/* Price. A stop with no price is free, which is the common case for
              one stop of a paid programme — so this stays optional. */}
          {draft.tiers.length === 0 ? (
            <>
              <Text style={styles.fieldLabel}>
                Price{currency ? ` (${currency})` : ""} — leave blank if free
              </Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={colors.textGhost}
                value={draft.price}
                onChangeText={(price) => update(draft.key, { price })}
                keyboardType="decimal-pad"
              />
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Price bands{currency ? ` (${currency})` : ""}</Text>
              {draft.tiers.map((tier, idx) => (
                <View key={idx} style={styles.tierBlock}>
                  <View style={styles.tierRow}>
                    <TextInput
                      style={[styles.input, styles.tierName]}
                      placeholder={`Band ${idx + 1} name`}
                      placeholderTextColor={colors.textGhost}
                      value={tier.name}
                      maxLength={40}
                      onChangeText={(name) => updateTier(draft.key, idx, { name })}
                    />
                    <TouchableOpacity
                      onPress={() =>
                        update(draft.key, { tiers: draft.tiers.filter((_, n) => n !== idx) })
                      }
                      hitSlop={8}
                      accessibilityLabel={`Remove price band ${idx + 1}`}
                    >
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.tierRow}>
                    <TextInput
                      style={[styles.input, styles.tierFlex]}
                      placeholder="Price"
                      placeholderTextColor={colors.textGhost}
                      value={tier.price}
                      onChangeText={(price) => updateTier(draft.key, idx, { price })}
                      keyboardType="decimal-pad"
                    />
                    <TextInput
                      style={[styles.input, styles.tierFlex]}
                      placeholder="Qty (optional)"
                      placeholderTextColor={colors.textGhost}
                      value={tier.quantity}
                      onChangeText={(quantity) => updateTier(draft.key, idx, { quantity })}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
              ))}
            </>
          )}

          {draft.tiers.length < MAX_TIERS && (
            <TouchableOpacity
              style={styles.addRowInline}
              onPress={() =>
                update(draft.key, {
                  tiers: draft.tiers.length
                    ? [...draft.tiers, { name: "", price: "", quantity: "" }]
                    : // Seed from the flat price so nothing typed is lost.
                      [
                        { name: "Standard", price: draft.price || "", quantity: "" },
                        { name: "", price: "", quantity: "" },
                      ],
                  ...(draft.tiers.length ? {} : { price: "" }),
                })
              }
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={17} color={colors.primaryLight} />
              <Text style={styles.addTextInline}>
                {draft.tiers.length
                  ? `Add another band (${draft.tiers.length}/${MAX_TIERS})`
                  : "Add price bands (Standard, VIP, …)"}
              </Text>
            </TouchableOpacity>
          )}

          {/* This stop's own cap, enforced independently of the event's. */}
          <Text style={styles.fieldLabel}>Guest limit for this sub-event — blank for no limit</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 10"
            placeholderTextColor={colors.textGhost}
            value={draft.maxGuests}
            onChangeText={(maxGuests) => update(draft.key, { maxGuests })}
            keyboardType="number-pad"
          />
        </View>
      ))}

      {value.length < MAX_SUB_EVENTS && (
        <TouchableOpacity
          style={styles.addRow}
          onPress={() => onChange([...value, emptyDraft()])}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.primaryLight} />
          <Text style={styles.addText}>
            {value.length
              ? `Add another sub-event (${value.length}/${MAX_SUB_EVENTS})`
              : "Running a programme? Add a sub-event"}
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
    fieldLabel: {
      fontSize: scaleFontSize(12.5),
      fontFamily: Fonts.semiBold,
      color: c.textSecondary,
      marginBottom: 6,
      marginTop: 2,
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
    inputMultiline: {
      minHeight: 72,
      textAlignVertical: "top",
    },
    clearRow: { paddingVertical: 6, marginBottom: 8 },
    clearText: {
      fontFamily: Fonts.semiBold,
      fontSize: scaleFontSize(13),
      color: c.textDim,
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
      marginBottom: 12,
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
    tierBlock: { marginBottom: 2 },
    tierRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    tierName: { flex: 1 },
    tierFlex: { flex: 1 },
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
    addRowInline: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      marginBottom: 6,
    },
    addTextInline: {
      fontFamily: Fonts.semiBold,
      fontSize: scaleFontSize(13),
      color: c.primaryLight,
    },
    infoTip: { marginBottom: 8 },
    infoTipLabel: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textDim,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    notice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginTop: 14,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.glassFillSubtle,
    },
    noticeText: {
      flex: 1,
      fontFamily: Fonts.regular,
      fontSize: scaleFontSize(13),
      color: c.textDim,
      lineHeight: 19,
    },
  });
