import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { Colors } from "@/constants/colors";
import { BASE_URL } from "@/constants/constants";

import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import GlassBackButton from "@/components/shared/GlassBackButton";
type ScanResult =
  | { kind: "success"; name: string; type: string; already: boolean }
  | { kind: "error"; message: string };

/**
 * Organizer-facing attendance scanner. Opened for a specific event; scans an
 * attendee's OurCityvibe pass QR and checks them in via POST /events/:id/check-in.
 */
export default function CheckInScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const handleScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (busy || result) return;
      const value = (data || "").trim();

      // Only react to OurCityvibe pass QRs; ignore event/guide links etc.
      const isPass =
        value.startsWith("cityvibe-pass:") || /^[a-f0-9]{32,}$/i.test(value);
      if (!isPass) {
        setResult({
          kind: "error",
          message: "That's not a OurCityvibe pass QR code.",
        });
        return;
      }

      setBusy(true);
      try {
        const token = await SecureStore.getItemAsync("token");
        const res = await axios.post(
          `${BASE_URL}/events/${eventId}/check-in`,
          { code: value },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const d = res.data;
        setResult({
          kind: "success",
          name: d.attendee?.username || "Guest",
          type: d.attendee?.type === "ticket" ? "Ticket" : "RSVP",
          already: !!d.alreadyCheckedIn,
        });
      } catch (err: any) {
        setResult({
          kind: "error",
          message:
            err?.response?.data?.message || "Couldn't check this guest in.",
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, result, eventId]
  );

  const scanAgain = () => setResult(null);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <GlassBackButton style={styles.backBtn} />
          <Text style={styles.title}>Check in guests</Text>
          <View style={{ width: 40 }} />
        </View>

        {!permission ? (
          <View style={styles.center} />
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Ionicons name="qr-code-outline" size={56} color={Colors.primary} />
            <Text style={styles.permTitle}>Camera access needed</Text>
            <Text style={styles.permText}>
              OurCityvibe uses the camera to scan attendee passes at the door.
            </Text>
            {permission.canAskAgain ? (
              <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                <Text style={styles.permBtnText}>Allow camera</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.permBtn}
                onPress={() => Linking.openSettings()}
              >
                <Text style={styles.permBtnText}>Open Settings</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={busy || result ? undefined : handleScanned}
            />
            <View style={styles.overlay}>
              <View style={styles.frame} />
              <Text style={styles.hint}>
                Point at an attendee's OurCityvibe pass QR
              </Text>
            </View>

            {/* Result / busy sheet */}
            {(busy || result) && (
              <View style={styles.resultSheet}>
                {busy ? (
                  <ActivityIndicator size="large" color={Colors.primary} />
                ) : result?.kind === "success" ? (
                  <>
                    <Ionicons
                      name={result.already ? "alert-circle" : "checkmark-circle"}
                      size={56}
                      color={result.already ? "#FCD34D" : colors.successLight}
                    />
                    <Text style={styles.resultName}>{result.name}</Text>
                    <Text style={styles.resultMsg}>
                      {result.already
                        ? `Already checked in · ${result.type}`
                        : `Checked in · ${result.type}`}
                    </Text>
                    <TouchableOpacity style={styles.againBtn} onPress={scanAgain}>
                      <Text style={styles.againBtnText}>Scan next guest</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Ionicons name="close-circle" size={56} color={colors.errorLight} />
                    <Text style={styles.resultMsg}>{result?.message}</Text>
                    <TouchableOpacity style={styles.againBtn} onPress={scanAgain}>
                      <Text style={styles.againBtnText}>Try again</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: { width: 40 },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontFamily: Fonts.bold, color: c.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  permTitle: { fontSize: 20, fontFamily: Fonts.bold, color: c.text, marginTop: 8 },
  permText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  permBtn: {
    marginTop: 12,
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.white },
  cameraWrap: { flex: 1, overflow: "hidden" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: Colors.primary,
    borderRadius: 24,
    backgroundColor: "transparent",
  },
  hint: {
    marginTop: 24,
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: c.text,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  resultSheet: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 40,
    backgroundColor: "rgba(15,10,30,0.96)",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: c.glassStroke,
  },
  resultName: { fontSize: 22, fontFamily: Fonts.bold, color: c.text, marginTop: 4 },
  resultMsg: { fontSize: 14, fontFamily: Fonts.medium, color: "#cbd5e1", textAlign: "center" },
  againBtn: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
  },
  againBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.white },
});
