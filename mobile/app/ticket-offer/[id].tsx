import React, { useCallback, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
import EventCardSkeleton from "@/components/skeletons/EventCardSkeleton";
import { currencyPrefix } from "@/constants/payments";
import { usePayment } from "@/hooks/usePayment";
import { ticketOfferRequest, TicketOffer } from "@/services/ticketOffer.service";

export default function TicketInvoice() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const respond = async (action: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await ticketOfferRequest(`/ticket-offers/${id}`, "PATCH", { action, finalPrice: Number(price) });
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };
  const pay = async () => {
    if (!offer || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await payForProgramme(offer.event, [], undefined, offer._id);
      if (result.error) setError(result.error);
      if (result.success) { await load(); Alert.alert("Payment complete", "Your tickets are available in Passes."); }
    } catch { setError("Couldn't complete checkout. Please try again."); }
    finally { setBusy(false); }
  };
  const money = (amount: number) => `${currencyPrefix(offer?.currency)}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <SafeAreaView style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <GlassBackButton onPress={() => router.back()} />
      <Text style={styles.title}>{offer?.status === "quoted" ? "Ticket invoice" : "Ticket request"}</Text>
      {loading ? <EventCardSkeleton /> : offer ? <>
        <Text style={styles.heading}>{offer.eventTitle}</Text>
        <Text style={styles.text}>{offer.ticketName} · {offer.quantity} ticket{offer.quantity === 1 ? "" : "s"}</Text>
        {offer.eventDate && <Text style={styles.text}>{new Date(offer.eventDate).toLocaleString()}</Text>}
        {offer.locationName && <Text style={styles.text}>{[offer.locationName, offer.locationCity].filter(Boolean).join(" · ")}</Text>}
        {offer.standardPrice > 0 && <Text style={styles.text}>Standard price: {money(offer.standardPrice)} per ticket</Text>}
        <Text style={styles.text}>Attendee’s offer: {money(offer.offeredPrice)} per ticket</Text>
        {!!offer.note && <Text style={styles.text}>{offer.note}</Text>}
        {offer.status === "requested" && offer.isOrganizer && <>
          <Text style={styles.heading}>Final price per ticket ({offer.currency})</Text>
          <TextInput accessibilityLabel="Final price per ticket" style={styles.input} keyboardType="decimal-pad" value={price} onChangeText={setPrice} />
          <Text style={styles.text}>Invoice total: {money((Number(price) || 0) * offer.quantity)}</Text>
          <Text style={styles.text}>Discuss any changes in chat first. Sending the final invoice fixes its price; the attendee must review and pay it.</Text>
          <TouchableOpacity disabled={busy} style={styles.button} onPress={() => Alert.alert("Send final invoice?", `${offer.quantity} tickets for ${money((Number(price) || 0) * offer.quantity)} in total.`, [{ text: "Keep editing", style: "cancel" }, { text: "Send invoice", onPress: () => respond("quote") }])}><Text style={styles.buttonText}>Send final invoice</Text></TouchableOpacity>
          <TouchableOpacity disabled={busy} onPress={() => respond("decline")}><Text style={styles.error}>Decline request</Text></TouchableOpacity>
        </>}
        {offer.status === "requested" && !offer.isOrganizer && <>
          <Text style={styles.text}>Waiting for the organizer’s final invoice. You can discuss your offer in chat.</Text>
          <TouchableOpacity disabled={busy} onPress={() => respond("cancel")}><Text style={styles.text}>Cancel request</Text></TouchableOpacity>
        </>}
        {offer.status === "quoted" && <>
          <Text style={styles.heading}>Final price: {money(offer.finalPrice!)} per ticket</Text>
          <Text style={styles.title}>Total: {money(offer.finalPrice! * offer.quantity)}</Text>
          <Text style={styles.text}>{offer.paid ? "Paid · your tickets have been issued" : offer.isOrganizer ? "Invoice sent · awaiting payment" : "Review the ticket selection, quantity and final total above. All tickets will be issued to your account. Availability is checked at checkout."}</Text>
          {!offer.paid && !offer.isOrganizer && <TouchableOpacity disabled={busy} onPress={pay} style={styles.button}><Text style={styles.buttonText}>{busy ? "Opening checkout…" : `Pay ${money(offer.finalPrice! * offer.quantity)}`}</Text></TouchableOpacity>}
          {offer.paid && !offer.isOrganizer && <TouchableOpacity onPress={() => router.push("/passes" as any)}><Text style={styles.text}>View your passes</Text></TouchableOpacity>}
        </>}
        {["declined", "cancelled"].includes(offer.status) && <Text style={styles.text}>This request was {offer.status}. You can start a new offer from the event.</Text>}
        <TouchableOpacity onPress={() => router.push(`/chat/${offer.chat}` as any)}><Text style={styles.text}>Open conversation →</Text></TouchableOpacity>
      </> : null}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!loading && <TouchableOpacity disabled={busy} onPress={load}><Text style={styles.text}>Refresh invoice</Text></TouchableOpacity>}
    </ScrollView>
  </SafeAreaView>;
}
const createStyles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: 20, gap: 18 },
  title: { color: c.textBright, fontSize: 27, fontWeight: "700" },
  heading: { color: c.textBright, fontSize: 17, fontWeight: "600" },
  text: { color: c.textMuted, fontSize: 15, lineHeight: 23 },
  input: { color: c.textBright, padding: 14, borderWidth: 1, borderColor: c.borderMuted, borderRadius: 12, fontSize: 18 },
  button: { backgroundColor: c.primary, padding: 16, borderRadius: 14, alignItems: "center" },
  buttonText: { color: c.textBright, fontSize: 16, fontWeight: "700" },
  error: { color: c.error },
});
