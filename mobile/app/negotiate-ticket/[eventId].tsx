import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
import EventCardSkeleton from "@/components/skeletons/EventCardSkeleton";
import VenuePicker, { needsVenuePick, eventVenues } from "@/components/shared/VenuePicker";
import { currencyPrefix } from "@/constants/payments";
import { ticketOfferRequest, NegotiationOptions } from "@/services/ticketOffer.service";

export default function NegotiateTicket() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [event, setEvent] = useState<NegotiationOptions | null>(null);
  const [selection, setSelection] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [venue, setVenue] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = () => {
    setLoading(true);
    setError("");
    ticketOfferRequest<{ event: NegotiationOptions }>(`/events/${eventId}/negotiation`)
      .then(({ event }) => setEvent(event))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, [eventId]);
  const options = event?.stops.flatMap((stop) => (stop.ticketTiers.length ? stop.ticketTiers : [{ _id: "", name: "General admission", price: stop.ticketPrice, soldOut: stop.soldOut }]).map((tier) => ({
    key: `${stop.id || "main"}:${tier._id}`, stop, tier,
  }))) || [];
  const selected = options.find((option) => option.key === selection) || (options.length === 1 ? options[0] : null);
  const prefix = currencyPrefix(event?.currency);
  const unavailable = (option: typeof options[number]) => option.stop.salesClosed || option.stop.soldOut || option.tier.soldOut;
  const send = async () => {
    if (!selected || !event || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await ticketOfferRequest<{ chatId: string }>(`/events/${eventId}/offers`, "POST", {
        subEvent: selected.stop.id, tierId: selected.tier._id || undefined,
        offeredPrice: Number(price), quantity: Number(quantity), locationIndex: venue, note,
      });
      router.replace(`/chat/${result.chatId}` as any);
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  const proposedTotal = Number(price) * Number(quantity);
  const canSend =
    !!selected && !unavailable(selected) && !!Number(price) && !!Number(quantity) &&
    !(event && needsVenuePick(event) && venue === null);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Negotiate tickets</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <EventCardSkeleton />
        ) : event ? (
          <>
            <View style={styles.eventRow}>
              <View style={styles.eventAvatar}>
                <Ionicons name="pricetags-outline" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.eventLabel}>Making an offer on</Text>
                <Text style={styles.eventName} numberOfLines={2}>{event.title}</Text>
              </View>
            </View>

            <Text style={styles.disclaimer}>
              Send your offer, discuss it in chat, then review the organizer&apos;s final
              invoice before paying. Any standard price shown is only a guide — some
              organizers publish none at all. An offer does not reserve tickets.
            </Text>

            <Text style={styles.sectionLabel}>What you want</Text>
            <View style={styles.card}>
              {options.map((option, idx) => {
                const isSelected = selected?.key === option.key;
                const off = !!unavailable(option);
                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.optionRow, idx > 0 && styles.optionRowBorder, off && styles.optionOff]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: isSelected, disabled: off }}
                    disabled={off}
                    activeOpacity={0.8}
                    onPress={() => setSelection(option.key)}
                  >
                    <Ionicons
                      name={isSelected ? "radio-button-on" : "radio-button-off"}
                      size={20}
                      color={isSelected ? colors.primary : colors.textMuted}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.optionName} numberOfLines={1}>
                        {option.stop.title} · {option.tier.name}
                      </Text>
                      <Text style={styles.optionMeta} numberOfLines={1}>
                        {off
                          ? "Tickets unavailable"
                          : option.tier.price > 0
                            ? `Standard ${prefix}${option.tier.price.toLocaleString()} per ticket`
                            : "No standard price — name yours"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {needsVenuePick(event) && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.sectionLabel}>Which venue</Text>
                <VenuePicker venues={eventVenues(event)} value={venue} onChange={setVenue} />
              </View>
            )}

            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Your offer</Text>
            <View style={[styles.card, styles.formCard]}>
              <Text style={styles.fieldLabel}>Price per ticket ({event.currency})</Text>
              <TextInput
                accessibilityLabel="Your price per ticket"
                style={styles.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.textGhost}
              />

              <Text style={styles.fieldLabel}>Number of tickets (1–20)</Text>
              <TextInput
                accessibilityLabel="Number of tickets"
                style={styles.input}
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="number-pad"
                placeholderTextColor={colors.textGhost}
              />

              <Text style={styles.fieldLabel}>Message to the organizer (optional)</Text>
              <TextInput
                accessibilityLabel="Message to the organizer"
                style={[styles.input, styles.inputMultiline]}
                value={note}
                onChangeText={setNote}
                maxLength={1000}
                multiline
                placeholderTextColor={colors.textGhost}
              />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Your proposed total</Text>
                <Text style={styles.totalValue}>
                  {Number.isFinite(proposedTotal) ? `${prefix}${proposedTotal.toLocaleString()}` : "—"}
                </Text>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
            <Text style={styles.errorText}>{error || "Couldn't load this event"}</Text>
            <TouchableOpacity style={styles.doneButton} onPress={load}>
              <Text style={styles.doneButtonText}>Try again</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/login")}>
              <Text style={styles.linkText}>Log in to negotiate</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!error && !!event && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>

      {!!event && !loading && (
        <View style={styles.footer}>
          <TouchableOpacity activeOpacity={0.9} onPress={send} disabled={busy || !canSend}>
            <LinearGradient
              colors={
                canSend && !busy
                  ? [colors.primary, colors.primaryDark]
                  : [colors.borderMuted, colors.borderMuted]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.payButton}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                  <Text style={styles.payButtonText}>Send offer to organizer</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: { alignItems: "center", gap: 12, paddingVertical: 48 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 60,
      paddingBottom: 16,
      paddingHorizontal: 16,
      backgroundColor: c.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: c.text },
    content: { padding: 16, paddingBottom: 24 },

    eventRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
    eventAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
    },
    eventLabel: { fontSize: 12, fontFamily: Fonts.regular, color: c.textSecondary },
    eventName: { fontSize: 18, fontFamily: Fonts.bold, color: c.text, marginTop: 2 },

    sectionLabel: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textSecondary,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
    },
    formCard: { paddingVertical: 16 },

    optionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
    optionRowBorder: { borderTopWidth: 1, borderTopColor: c.border },
    optionOff: { opacity: 0.45 },
    optionName: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.text },
    optionMeta: { fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary, marginTop: 3 },

    fieldLabel: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textSecondary,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      color: c.text,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: 12,
      fontSize: 16,
      fontFamily: Fonts.regular,
      backgroundColor: c.background,
    },
    inputMultiline: { minHeight: 90, textAlignVertical: "top" },

    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 18,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 10,
    },
    totalLabel: { fontSize: 16, fontFamily: Fonts.bold, color: c.text },
    totalValue: { flexShrink: 0, fontSize: 20, fontFamily: Fonts.bold, color: c.primary },

    disclaimer: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      lineHeight: 18,
      marginBottom: 20,
    },
    errorText: {
      fontSize: 14,
      fontFamily: Fonts.medium,
      color: c.error,
      textAlign: "center",
      marginTop: 12,
    },
    linkText: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.primary },

    footer: {
      padding: 16,
      paddingBottom: Platform.OS === "ios" ? 32 : 20,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.backgroundSecondary,
    },
    payButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      borderRadius: 14,
    },
    payButtonText: { fontSize: 16, fontFamily: Fonts.bold, color: "#fff" },
    doneButton: {
      paddingVertical: 14,
      paddingHorizontal: 28,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    doneButtonText: { fontSize: 15, fontFamily: Fonts.bold, color: c.text },
  });
