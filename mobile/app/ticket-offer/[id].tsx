import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import GlassBackButton from "@/components/shared/GlassBackButton";
import InvoiceSummary from "@/components/shared/InvoiceSummary";
import { currencyPrefix } from "@/constants/payments";
import { usePayment } from "@/hooks/usePayment";
import { ticketOfferRequest, TicketOffer } from "@/services/ticketOffer.service";

/**
 * The negotiated ticket invoice, the ticket-side twin of
 * `order-confirm/[orderId]`: same header, same counterparty row, same
 * InvoiceSummary body, same sticky action bar. The two screens are the same
 * transaction from the buyer's point of view and should not look like
 * different products.
 *
 * Amounts are always re-derived from the server's copy of the offer — the
 * price the buyer pays is fixed when the organizer sends the invoice, never
 * from anything held on this screen.
 */
export default function TicketInvoice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { payForProgramme } = usePayment();

  const [offer, setOffer] = useState<TicketOffer | null>(null);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { offer } = await ticketOfferRequest<{ offer: TicketOffer }>(`/ticket-offers/${id}`);
      setOffer(offer);
      setPrice(String(offer.finalPrice ?? offer.offeredPrice));
      setError("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const respond = async (action: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await ticketOfferRequest(`/ticket-offers/${id}`, "PATCH", { action, finalPrice: Number(price) });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!offer || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await payForProgramme(offer.event, [], undefined, offer._id);
      if (result.error) setError(result.error);
      if (result.success) {
        await load();
        Alert.alert("Payment complete", "Your tickets are available in Passes.");
      }
    } catch {
      setError("Couldn't complete checkout. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const money = (amount: number) =>
    `${currencyPrefix(offer?.currency)}${(amount || 0).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const quoted = offer?.status === "quoted";
  const closed = !!offer && ["declined", "cancelled"].includes(offer.status);
  const isOrganizer = !!offer?.isOrganizer;
  // While the organizer is still drafting, the total follows the input so they
  // can see what they're about to commit to before they send it.
  const unitPrice = quoted ? offer!.finalPrice! : Number(price) || 0;
  const lineTotal = offer ? unitPrice * offer.quantity : 0;

  const headerTitle = quoted ? "Ticket invoice" : closed ? "Ticket request" : "Ticket request";

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <GlassBackButton />
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </View>
    );
  }

  if (!offer) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <GlassBackButton />
          <Text style={styles.headerTitle}>{headerTitle}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={styles.errorText}>{error || "Invoice not found"}</Text>
        </View>
      </View>
    );
  }

  const statusBanner = offer.paid ? (
    <View style={[styles.banner, styles.bannerPaid]}>
      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
      <Text style={[styles.bannerText, { color: colors.success }]}>
        Paid · your tickets have been issued.
      </Text>
    </View>
  ) : closed ? (
    <View style={[styles.banner, styles.bannerClosed]}>
      <Ionicons name="close-circle" size={18} color={colors.error} />
      <Text style={[styles.bannerText, { color: colors.error }]}>
        This request was {offer.status}. You can start a new offer from the event.
      </Text>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton />
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Counterparty row — the event stands in for order-confirm's vendor. */}
        <View style={styles.eventRow}>
          <View style={styles.eventAvatar}>
            <Ionicons name="ticket-outline" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.eventLabel}>{isOrganizer ? "Request for" : "Tickets for"}</Text>
            <Text style={styles.eventName} numberOfLines={2}>
              {offer.eventTitle}
            </Text>
          </View>
        </View>

        {statusBanner}

        <InvoiceSummary
          itemsLabel={quoted ? "Invoice" : "Request"}
          items={[
            {
              name: offer.ticketName,
              meta: [
                `${money(unitPrice)} × ${offer.quantity} ticket${offer.quantity === 1 ? "" : "s"}`,
                offer.eventDate ? new Date(offer.eventDate).toLocaleString() : "",
                [offer.locationName, offer.locationCity].filter(Boolean).join(" · "),
              ]
                .filter(Boolean)
                .join("\n"),
              amount: money(lineTotal),
            },
          ]}
          rows={[
            ...(offer.standardPrice > 0
              ? [{ label: "Standard price (per ticket)", value: money(offer.standardPrice) }]
              : []),
            { label: "Attendee's offer (per ticket)", value: money(offer.offeredPrice) },
            ...(quoted ? [{ label: "Final price (per ticket)", value: money(offer.finalPrice!) }] : []),
          ]}
          total={quoted ? { label: "Total", value: money(lineTotal) } : null}
        />

        {!!offer.note && (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>Attendee's note</Text>
            <Text style={styles.noteText}>{offer.note}</Text>
          </View>
        )}

        {/* Organizer, still drafting: set the price the invoice will fix. */}
        {offer.status === "requested" && isOrganizer && (
          <View style={styles.priceCard}>
            <Text style={styles.priceLabel}>Final price per ticket ({offer.currency})</Text>
            <TextInput
              accessibilityLabel="Final price per ticket"
              style={styles.input}
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
              placeholderTextColor={colors.textGhost}
            />
            <View style={styles.priceTotalRow}>
              <Text style={styles.priceTotalLabel}>Invoice total</Text>
              <Text style={styles.priceTotalValue}>{money(lineTotal)}</Text>
            </View>
          </View>
        )}

        <Text style={styles.disclaimer}>
          {offer.status === "requested" && isOrganizer
            ? "Discuss any changes in chat first. Sending the final invoice fixes its price; the attendee must review and pay it."
            : offer.status === "requested"
              ? "Waiting for the organizer's final invoice. You can keep discussing your offer in chat."
              : quoted && !offer.paid && !isOrganizer
                ? `You'll be charged ${money(lineTotal)} in ${offer.currency}. Availability is checked at checkout and all tickets are issued to your account.`
                : quoted && isOrganizer && !offer.paid
                  ? "Invoice sent · awaiting payment."
                  : ""}
        </Text>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={styles.chatLink}
          activeOpacity={0.8}
          onPress={() => router.push(`/chat/${offer.chat}` as any)}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.primary} />
          <Text style={styles.chatLinkText}>Open conversation</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Sticky action bar — mirrors order-confirm's pay bar exactly. */}
      <View style={styles.footer}>
        {offer.status === "requested" && isOrganizer ? (
          <>
            <TouchableOpacity
              activeOpacity={0.9}
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  "Send final invoice?",
                  `${offer.quantity} ticket${offer.quantity === 1 ? "" : "s"} for ${money(lineTotal)} in total.`,
                  [
                    { text: "Keep editing", style: "cancel" },
                    { text: "Send invoice", onPress: () => respond("quote") },
                  ]
                )
              }
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.payButton}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="receipt-outline" size={16} color="#fff" />
                    <Text style={styles.payButtonText}>Send final invoice</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryAction}
              disabled={busy}
              onPress={() => respond("decline")}
            >
              <Text style={styles.declineText}>Decline request</Text>
            </TouchableOpacity>
          </>
        ) : offer.status === "requested" ? (
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.doneButton}
            disabled={busy}
            onPress={() => respond("cancel")}
          >
            <Text style={styles.doneButtonText}>Cancel request</Text>
          </TouchableOpacity>
        ) : quoted && !offer.paid && !isOrganizer ? (
          <TouchableOpacity activeOpacity={0.9} disabled={busy} onPress={pay}>
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.payButton}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="lock-closed" size={16} color="#fff" />
                  <Text style={styles.payButtonText}>Confirm &amp; Pay {money(lineTotal)}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : offer.paid && !isOrganizer ? (
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.doneButton}
            onPress={() => router.push("/passes" as any)}
          >
            <Text style={styles.doneButtonText}>View your passes</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.doneButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/messages"))}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 },
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

    eventRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
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

    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    bannerPaid: { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.3)" },
    bannerClosed: { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.3)" },
    bannerText: { flex: 1, fontSize: 13, fontFamily: Fonts.medium },

    noteCard: {
      marginTop: 16,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    noteLabel: { fontSize: 12, fontFamily: Fonts.semiBold, color: c.textSecondary, marginBottom: 4 },
    noteText: { fontSize: 14, fontFamily: Fonts.regular, color: c.textBody, lineHeight: 20 },

    priceCard: {
      marginTop: 16,
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
    },
    priceLabel: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.textSecondary, marginBottom: 8 },
    input: {
      color: c.text,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: c.borderMuted,
      borderRadius: 12,
      fontSize: 18,
      fontFamily: Fonts.semiBold,
      backgroundColor: c.background,
    },
    priceTotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: c.border,
      gap: 10,
    },
    priceTotalLabel: { fontSize: 16, fontFamily: Fonts.bold, color: c.text },
    priceTotalValue: { flexShrink: 0, fontSize: 20, fontFamily: Fonts.bold, color: c.primary },

    disclaimer: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      lineHeight: 18,
      marginTop: 16,
      textAlign: "center",
      paddingHorizontal: 8,
    },
    errorText: {
      fontSize: 14,
      fontFamily: Fonts.medium,
      color: c.error,
      textAlign: "center",
      marginTop: 12,
    },

    chatLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
    },
    chatLinkText: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.primary },

    footer: {
      padding: 16,
      paddingBottom: Platform.OS === "ios" ? 32 : 20,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.backgroundSecondary,
      gap: 8,
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
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    doneButtonText: { fontSize: 16, fontFamily: Fonts.bold, color: c.text },
    secondaryAction: { alignItems: "center", paddingVertical: 8 },
    declineText: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.error },
  });
