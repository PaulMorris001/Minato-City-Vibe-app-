import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { Colors } from "@/constants/colors";

/**
 * QR scanner. Scans a NightVibe event/guide link and opens it in the app.
 * Uses the camera permission (justifies NSCameraUsageDescription).
 */
export default function ScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    const value = (data || "").trim();

    // Match a NightVibe event/guide link, e.g.
    // https://night-vibe.onrender.com/event/<id>  or  /guide/<id>
    const eventMatch = value.match(/\/event\/([^/?#\s]+)/i);
    const guideMatch = value.match(/\/guide\/([^/?#\s]+)/i);

    if (eventMatch) {
      router.replace({ pathname: "/event/[id]", params: { id: eventMatch[1] } });
      return;
    }
    if (guideMatch) {
      router.replace({ pathname: "/guide/[id]", params: { id: guideMatch[1] } });
      return;
    }

    // Not a NightVibe code — offer to open a plain URL, else say so.
    if (/^https?:\/\//i.test(value)) {
      Alert.alert("Open link?", value, [
        { text: "Cancel", style: "cancel", onPress: () => setScanned(false) },
        { text: "Open", onPress: () => Linking.openURL(value).catch(() => {}) },
      ]);
    } else {
      Alert.alert(
        "Not a CityVibe code",
        "This QR code isn't a CityVibe event or guide.",
        [{ text: "Scan again", onPress: () => setScanned(false) }]
      );
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Scan QR</Text>
          <View style={{ width: 40 }} />
        </View>

        {!permission ? (
          <View style={styles.center} />
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Ionicons name="qr-code-outline" size={56} color={Colors.primary} />
            <Text style={styles.permTitle}>Camera access needed</Text>
            <Text style={styles.permText}>
              CityVibe uses the camera to scan event and guide QR codes.
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
              onBarcodeScanned={scanned ? undefined : handleScanned}
            />
            <View style={styles.overlay}>
              <View style={styles.frame} />
              <Text style={styles.hint}>
                Point at a CityVibe event or guide QR code
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  safe: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: { width: 40 },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontFamily: Fonts.bold, color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  permTitle: { fontSize: 20, fontFamily: Fonts.bold, color: "#fff", marginTop: 8 },
  permText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
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
  permBtnText: { fontSize: 15, fontFamily: Fonts.semiBold, color: "#fff" },
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
    color: "#fff",
    textAlign: "center",
    paddingHorizontal: 40,
  },
});
