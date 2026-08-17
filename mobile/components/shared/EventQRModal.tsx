import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { showError, showInfo, showSuccess } from "@/utils/toast";
import { shareEventQr } from "@/utils/qrShare";
import { saveBase64ImageToGallery, saveWithFeedback } from "@/utils/saveToGallery";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface EventQRModalProps {
  visible: boolean;
  onClose: () => void;
  eventId: string;
  title: string;
  /**
   * Share URL already known to the caller. Shown immediately so the link and
   * the Copy/Share actions work while the QR image is still loading; the
   * server's canonical URL replaces it once the code arrives (they only differ
   * for legacy events whose shareToken is minted on the fly).
   */
  fallbackUrl: string;
}

/**
 * Full-screen QR code for an event.
 *
 * The code encodes the event's universal share link, so scanning it with any
 * camera opens the event in the app when it's installed and falls back to the
 * web landing page when it isn't — exactly what sharing the link does.
 *
 * The PNG is rendered server-side (`GET /events/:id/qr`) rather than in JS:
 * the app has no QR renderer, adding one means a native `react-native-svg`
 * dependency and a store build, and the server already generates the pass QRs
 * on `/passes` the same way.
 */
export default function EventQRModal({
  visible,
  onClose,
  eventId,
  title,
  fallbackUrl,
}: EventQRModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [qr, setQr] = useState<string | null>(null);
  const [url, setUrl] = useState(fallbackUrl);
  const [failed, setFailed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Codes are immutable per event — once fetched, keep it across reopens.
    if (qr) return;

    let cancelled = false;
    (async () => {
      setFailed(false);
      try {
        const token = await SecureStore.getItemAsync("token");
        const res = await axios.get(`${BASE_URL}/events/${eventId}/qr`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        setQr(res.data?.qr ?? null);
        if (res.data?.url) setUrl(res.data.url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, eventId, qr]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(url);
    showSuccess("Link copied to clipboard.");
  };

  // Shares the PNG itself, not the link — otherwise "Save to Files" writes out
  // the message text instead of the code. See utils/qrShare.
  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const res = await shareEventQr({ dataUrl: qr, title, url });
      if (!res.ok) {
        showError("Couldn't open the share sheet.");
      } else if (res.mode === "link") {
        // No way to attach the image on this build — say so rather than
        // letting them think they shared a code.
        showInfo(
          "Shared the event link. Sharing the QR image needs the next app update.",
        );
      }
    } finally {
      setSharing(false);
    }
  };

  // Writes the code straight into the photo library. Saving is only offered
  // once `qr` has loaded — there's nothing to write before then.
  const handleSave = async () => {
    if (!qr || saving) return;
    setSaving(true);
    try {
      await saveWithFeedback(
        () => saveBase64ImageToGallery(qr, title),
        "QR code saved to your photos."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <SafeAreaView style={styles.wrap} pointerEvents="box-none">
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.headerLabel}>EVENT QR CODE</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={colors.textDim} />
            </TouchableOpacity>
          </View>

          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>

          {/* The code sits on a fixed white plate in both themes — QR contrast
              is a scanning requirement, not a styling choice. */}
          <View style={styles.qrPlate}>
            {qr ? (
              <Image source={{ uri: qr }} style={styles.qrImage} resizeMode="contain" />
            ) : failed ? (
              <View style={styles.qrPlaceholder}>
                <Ionicons name="cloud-offline-outline" size={26} color="#6b7280" />
                <Text style={styles.qrPlaceholderText}>
                  Couldn&apos;t load the code. Check your connection and reopen this.
                </Text>
              </View>
            ) : (
              <View style={styles.qrPlaceholder}>
                <ActivityIndicator color="#7c3aed" />
              </View>
            )}
          </View>

          <Text style={styles.hint}>
            Scan to open this event in OurCityvibe — or on the web if the app
            isn&apos;t installed.
          </Text>

          <Text style={styles.url} numberOfLines={1}>
            {url}
          </Text>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.action, styles.actionGhost]}
              onPress={handleCopy}
              activeOpacity={0.8}
            >
              <Ionicons name="copy-outline" size={17} color={colors.textBright} />
              <Text style={styles.actionGhostText}>Copy link</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.action,
                styles.actionGhost,
                (!qr || saving) && styles.actionDisabled,
              ]}
              onPress={handleSave}
              disabled={!qr || saving}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color={colors.textBright} />
              ) : (
                <Ionicons name="download-outline" size={17} color={colors.textBright} />
              )}
              <Text style={styles.actionGhostText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.action,
                styles.actionPrimary,
                (!qr || sharing) && styles.actionDisabled,
              ]}
              onPress={handleShare}
              activeOpacity={0.8}
              // Nothing to attach until the code has loaded.
              disabled={!qr || sharing}
            >
              {sharing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="share-outline" size={17} color="#fff" />
                  <Text style={styles.actionPrimaryText}>Share QR</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,0.65)",
    },
    wrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 22,
    },
    card: {
      width: "100%",
      maxWidth: 380,
      backgroundColor: c.backgroundDeep,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.glassStrokeStrong,
      padding: 18,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerLabel: {
      fontFamily: Fonts.semiBold,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      color: c.textFaint,
    },
    title: {
      fontFamily: Fonts.bold,
      fontSize: 19,
      color: c.textBright,
      marginTop: 6,
      marginBottom: 16,
    },
    qrPlate: {
      alignSelf: "center",
      width: "100%",
      aspectRatio: 1,
      maxWidth: 288,
      backgroundColor: "#ffffff",
      borderRadius: 18,
      padding: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    qrImage: { width: "100%", height: "100%" },
    qrPlaceholder: {
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingHorizontal: 24,
    },
    qrPlaceholderText: {
      fontFamily: Fonts.regular,
      fontSize: 12.5,
      lineHeight: 18,
      color: "#6b7280",
      textAlign: "center",
    },
    hint: {
      fontFamily: Fonts.regular,
      fontSize: 12.5,
      lineHeight: 18,
      color: c.textDim,
      textAlign: "center",
      marginTop: 16,
    },
    url: {
      fontFamily: Fonts.medium,
      fontSize: 12,
      color: c.textFaint,
      textAlign: "center",
      marginTop: 8,
    },
    actionRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 18,
    },
    action: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 13,
      borderRadius: 14,
    },
    actionGhost: {
      backgroundColor: c.glassFillSubtle,
      borderWidth: 1,
      borderColor: c.glassStroke,
    },
    actionGhostText: {
      fontFamily: Fonts.semiBold,
      fontSize: 14.5,
      color: c.textBright,
    },
    actionPrimary: { backgroundColor: c.primary },
    actionDisabled: { opacity: 0.5 },
    actionPrimaryText: {
      fontFamily: Fonts.semiBold,
      fontSize: 14.5,
      color: "#fff",
    },
  });
