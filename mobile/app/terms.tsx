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

import type { ThemeColors } from "@/constants/theme";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import GlassBackButton from "@/components/shared/GlassBackButton";
const sections = [
  {
    title: "1. Acceptance of Terms",
    body: "By creating an account or using OurCityvibe, you agree to these Terms of Service (\"Terms\") and our Privacy Policy. If you do not agree, do not use the app. You must be at least 13 years old to use OurCityvibe.",
  },
  {
    title: "2. Zero Tolerance for Objectionable Content",
    body: "OurCityvibe has zero tolerance for objectionable content or abusive users. Objectionable content includes — but is not limited to — hate speech, harassment, threats, sexual or pornographic material, graphic violence, illegal activity, spam, and content that infringes on the rights of others.\n\nUsers who post such content will have their content removed and their accounts may be permanently suspended.",
  },
  {
    title: "3. Zero Tolerance for Abusive Users",
    body: "Harassment, bullying, impersonation, doxxing, or any behavior that targets, threatens, or harms other users is strictly prohibited. Repeat offenders will be permanently banned from OurCityvibe.",
  },
  {
    title: "4. Reporting & Blocking",
    body: "You can report any user, event, guide, or chat message that violates these Terms using the in-app Report option. You can also block users to remove their content from your experience.\n\nWe review every objectionable-content report and act on confirmed violations within 24 hours — by removing the offending content and ejecting the user who provided it.",
  },
  {
    title: "5. User Content & Conduct",
    body: "You are solely responsible for any content you post, including events, guides, profile information, and messages. By posting content, you grant OurCityvibe a non-exclusive license to display and distribute it within the app. You agree not to:\n\n• Post content that violates these Terms\n• Use OurCityvibe for any unlawful purpose\n• Attempt to circumvent moderation or safety features\n• Create multiple or fake accounts\n• Scrape, harvest, or misuse other users' data",
  },
  {
    title: "6. Content Removal & Account Termination",
    body: "OurCityvibe reserves the right to remove any content and suspend or terminate any account at our sole discretion, with or without notice, for any violation of these Terms.",
  },
  {
    title: "7. Payments",
    body: "Paid events and guides are processed by Stripe. Tickets and purchases are subject to the policies of the event creator. OurCityvibe is not responsible for the conduct of third-party sellers.",
  },
  {
    title: "8. Disclaimer & Limitation of Liability",
    body: "OurCityvibe is provided \"as is\" without warranties of any kind. We are not responsible for user-generated content or for events organized by users. To the maximum extent permitted by law, OurCityvibe shall not be liable for any indirect, incidental, or consequential damages arising from your use of the app.",
  },
  {
    title: "9. Changes to These Terms",
    body: "We may update these Terms from time to time. Continued use of OurCityvibe after changes are posted constitutes your acceptance of the updated Terms.",
  },
  {
    title: "10. Contact",
    body: "Questions about these Terms? Email us at Support@nvibez.com.",
  },
];

export default function TermsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <LinearGradient colors={[colors.background, colors.backgroundSecondary, colors.backgroundTertiary]} style={styles.header}>
        <GlassBackButton style={styles.backButton} />
        <View>
          <Text style={styles.headerTitle}>Terms of Service</Text>
          <Text style={styles.headerSubtitle}>Last updated May 2026</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          These Terms govern your use of OurCityvibe. They explain what's
          expected of you on the platform and how we keep the community safe.
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

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
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
    color: c.text,
  },
  headerSubtitle: {
    fontSize: scaleFontSize(13),
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginTop: 2,
  },
  content: {
    padding: getResponsivePadding(),
    paddingBottom: 40,
  },
  intro: {
    fontSize: scaleFontSize(15),
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  section: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: c.border,
  },
  sectionTitle: {
    fontSize: scaleFontSize(16),
    fontFamily: Fonts.semiBold,
    color: c.text,
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: scaleFontSize(14),
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    lineHeight: 21,
  },
  bottomPad: { height: 20 },
});
