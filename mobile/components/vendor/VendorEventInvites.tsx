import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { BASE_URL } from "@/constants/constants";
import { VN, VNF } from "./vendorTheme";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface EventInvite {
  eventId: string;
  title: string;
  date: string;
  location?: string;
  image?: string;
  createdBy?: { _id: string; username: string; profilePicture?: string };
}

/**
 * Pending event invitations for the logged-in vendor's account. Self-fetches
 * and renders nothing until there's at least one invite, so it can be dropped
 * into the dashboard without reserving space.
 */
export default function VendorEventInvites() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [invites, setInvites] = useState<EventInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await axios.get(`${BASE_URL}/vendor/event-invites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setInvites(res.data?.invites || []);
    } catch {
      // Non-critical surface — leave the section hidden on failure.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvites();
  }, [fetchInvites]);

  const respond = async (eventId: string, status: "accepted" | "declined") => {
    setActing(eventId);
    try {
      const token = await SecureStore.getItemAsync("token");
      await axios.post(
        `${BASE_URL}/events/${eventId}/vendor-invite/respond`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInvites((prev) => prev.filter((i) => i.eventId !== eventId));
    } catch {
      Alert.alert("Error", "Couldn't respond to the invite. Please try again.");
    } finally {
      setActing(null);
    }
  };

  if (loading || invites.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Event invites</Text>
      <View style={{ gap: 10 }}>
        {invites.map((inv) => (
          <View key={inv.eventId} style={styles.card}>
            <TouchableOpacity
              style={styles.head}
              activeOpacity={0.85}
              onPress={() => router.push(`/event/${inv.eventId}` as any)}
            >
              {inv.image ? (
                <Image source={{ uri: inv.image }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={styles.thumbFallback}>
                  <Ionicons name="calendar-outline" size={20} color={VN.purpleSoft} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.eventTitle} numberOfLines={1}>
                  {inv.title}
                </Text>
                <Text style={styles.eventMeta} numberOfLines={1}>
                  {new Date(inv.date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  {inv.location ? ` · ${inv.location}` : ""}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.decline]}
                disabled={acting === inv.eventId}
                onPress={() => respond(inv.eventId, "declined")}
                activeOpacity={0.8}
              >
                <Text style={styles.declineText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.accept]}
                disabled={acting === inv.eventId}
                onPress={() => respond(inv.eventId, "accepted")}
                activeOpacity={0.85}
              >
                {acting === inv.eventId ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.acceptText}>Accept</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  wrap: { paddingHorizontal: 18, paddingBottom: 18 },
  title: {
    fontFamily: VNF.heading,
    fontSize: 18,
    color: VN.text,
    letterSpacing: -0.4,
    marginBottom: 12,
  },
  card: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: VN.surface,
    borderWidth: 1,
    borderColor: VN.strokeHi,
    gap: 12,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: 10 },
  thumbFallback: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: c.primaryFaded,
    alignItems: "center",
    justifyContent: "center",
  },
  eventTitle: { fontFamily: VNF.sub, fontSize: 14.5, color: VN.text },
  eventMeta: { fontFamily: VNF.medium, fontSize: 11.5, color: VN.textDim, marginTop: 3 },
  actions: { flexDirection: "row", gap: 8 },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  decline: {
    backgroundColor: c.glassFillSubtle,
    borderWidth: 1,
    borderColor: VN.strokeHi,
  },
  declineText: { fontFamily: VNF.bold, fontSize: 13, color: VN.textDim },
  accept: { backgroundColor: VN.purple },
  acceptText: { fontFamily: VNF.bold, fontSize: 13, color: c.text },
});
