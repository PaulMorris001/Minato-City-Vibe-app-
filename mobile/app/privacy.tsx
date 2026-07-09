import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  Platform,
  TouchableOpacity,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";

const sections = [
  {
    title: "Information We Collect",
    body: "We collect information you provide when creating an account, such as your name, email address, and profile photo. We also collect data about events you create, attend, or interact with on the platform.",
  },
  {
    title: "How We Use Your Information",
    body: "Your information is used to provide and improve OurCityvibe's services, personalise your experience, send you relevant notifications about events and ticket sales, and process payments securely through Stripe.",
  },
  {
    title: "Sharing Your Information",
    body: "We do not sell your personal data. Event details you make public are visible to other users. Vendor profiles and service listings are visible to all users browsing the platform.",
  },
  {
    title: "Payments & Financial Data",
    body: "All payment processing is handled by Stripe. OurCityvibe does not store your card details. For payout setup, Stripe collects and verifies your banking information in accordance with their privacy policy.",
  },
  {
    title: "Push Notifications",
    body: "With your permission, we send push notifications for ticket sales, event updates, and invites. You can manage notification preferences in your device settings at any time.",
  },
  {
    title: "Data Retention",
    body: "We retain your account data for as long as your account is active. You may request deletion of your account and associated data by contacting Support@nvibez.com.",
  },
  {
    title: "Your Rights",
    body: "You have the right to access, correct, or delete your personal data. To exercise these rights, contact us at Support@nvibez.com.",
  },
  {
    title: "Contact Us",
    body: "For any privacy-related questions or concerns, reach out to:\n\nSupport@nvibez.com",
  },
];

export default function PrivacyScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={["#0f0f1a", "#1a1a2e", "#16213e"]} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => goBack()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Privacy Policy</Text>
          <Text style={styles.headerSubtitle}>Last updated March 2026</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          At OurCityvibe, we take your privacy seriously. This policy explains what data we collect, how we use it, and your rights.
        </Text>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.bottomPad} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0f0f1a" },
  header: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight! + 16 : 60,
    paddingBottom: 20,
    paddingHorizontal: getResponsivePadding(),
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  backButton: { padding: 4, marginBottom: 2 },
  headerTitle: {
    fontSize: scaleFontSize(26),
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  headerSubtitle: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    marginTop: 2,
  },
  content: {
    padding: getResponsivePadding(),
    paddingBottom: 40,
  },
  intro: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    lineHeight: 22,
    marginBottom: 24,
  },
  section: {
    backgroundColor: "#1f1f2e",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#374151",
  },
  sectionTitle: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.semiBold,
    color: "#fff",
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: "#9ca3af",
    lineHeight: 21,
  },
  bottomPad: { height: 20 },
});
