import React, { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
import EventCardSkeleton from "@/components/skeletons/EventCardSkeleton";
import VenuePicker, { needsVenuePick, eventVenues } from "@/components/shared/VenuePicker";
import { currencyPrefix } from "@/constants/payments";
import { ticketOfferRequest, NegotiationOptions } from "@/services/ticketOffer.service";

export default function NegotiateTicket() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
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
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <GlassBackButton onPress={() => router.back()} />
        <Text style={styles.title}>Negotiate tickets</Text>
        {loading ? <EventCardSkeleton /> : event ? <>
          <Text style={styles.heading}>{event.title}</Text>
          <Text style={styles.text}>Send your offer, discuss it in chat, then review the organizer’s final invoice before paying. Any standard price shown is only a guide — some organizers publish none at all. An offer does not reserve tickets.</Text>
          {options.map((option) => <TouchableOpacity
            key={option.key} style={[styles.card, selected?.key === option.key && styles.selected]}
            accessibilityRole="radio" accessibilityState={{ checked: selected?.key === option.key, disabled: !!unavailable(option) }}
            disabled={!!unavailable(option)} onPress={() => setSelection(option.key)}>
            <Text style={styles.heading}>{option.stop.title} · {option.tier.name}</Text>
            <Text style={styles.text}>{unavailable(option) ? "Tickets unavailable" : option.tier.price > 0 ? `Standard price: ${prefix}${option.tier.price.toLocaleString()} per ticket` : "No standard price — name yours"}</Text>
          </TouchableOpacity>)}
          {needsVenuePick(event) && <VenuePicker venues={eventVenues(event)} value={venue} onChange={setVenue} />}
          <Text style={styles.heading}>Your price per ticket ({event.currency})</Text>
          <TextInput accessibilityLabel="Your price per ticket" style={styles.input} value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
          <Text style={styles.heading}>Number of tickets (1–20)</Text>
          <TextInput accessibilityLabel="Number of tickets" style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
          <Text style={styles.heading}>Message to the organizer (optional)</Text>
          <TextInput accessibilityLabel="Message to the organizer" style={styles.input} value={note} onChangeText={setNote} maxLength={1000} multiline />
          <Text style={styles.text}>Your proposed total: {prefix}{Number.isFinite(Number(price) * Number(quantity)) ? (Number(price) * Number(quantity)).toLocaleString() : "—"}</Text>
          <TouchableOpacity style={styles.button} onPress={send} disabled={busy || !selected || unavailable(selected) || !Number(price) || !Number(quantity) || (needsVenuePick(event) && venue === null)}>
            <Text style={styles.buttonText}>{busy ? "Sending…" : "Send offer to organizer’s chat"}</Text>
          </TouchableOpacity>
        </> : <><TouchableOpacity onPress={load}><Text style={styles.text}>Try again</Text></TouchableOpacity><TouchableOpacity onPress={() => router.push("/login")}><Text style={styles.text}>Log in to negotiate</Text></TouchableOpacity></>}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: 20, gap: 16 },
  title: { color: c.textBright, fontSize: 28, fontWeight: "700" },
  heading: { color: c.textBright, fontSize: 16, fontWeight: "600" },
  text: { color: c.textMuted, fontSize: 15, lineHeight: 23 },
  card: { padding: 16, borderWidth: 1, borderColor: c.borderMuted, borderRadius: 14, gap: 8 },
  selected: { borderColor: c.primary },
  input: { color: c.textBright, padding: 14, borderWidth: 1, borderColor: c.borderMuted, borderRadius: 12, fontSize: 17 },
  button: { backgroundColor: c.primary, padding: 16, borderRadius: 14, alignItems: "center" },
  buttonText: { color: c.textBright, fontSize: 16, fontWeight: "700" },
  error: { color: c.error },
});
