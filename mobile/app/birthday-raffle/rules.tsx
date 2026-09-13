import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "@/constants/fonts";
import { scaleFontSize, getResponsivePadding } from "@/utils/responsive";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

/**
 * Official Birthday Raffle rules.
 *
 * App Store guideline 5.3.2 requires the official rules of any promotion to be
 * present in the app, available at all times, and to state that Apple is not a
 * sponsor. "At all times" is why every word here is bundled rather than fetched:
 * the screen has to render with no network, no session, and no active campaign.
 * Nothing on it may depend on an API call.
 *
 * Per-campaign specifics (dates, prize values) are deliberately described by
 * reference — "the campaign period shown in the app" — so that ending one
 * campaign and starting another can never leave these rules stating something
 * untrue without an app release.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Fill these in with the real promoter details before shipping. They are the
// one thing in this file that cannot be derived from the app.
// Matches the address used in terms.tsx / privacy.tsx.
const SUPPORT_EMAIL = "support@ourcityvibe.com";
const SPONSOR_NAME = "OurCityvibe";
const SPONSOR_ADDRESS = "Obito Ventures Inc. 1327 Laloma Avenue Berkeley, California 94708, United States";
// ─────────────────────────────────────────────────────────────────────────────

const LAST_UPDATED = "September 2026";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "1. No purchase necessary",
    body: "NO PURCHASE OR PAYMENT OF ANY KIND IS NECESSARY TO ENTER OR WIN. Making a purchase in the app does not improve your chance of winning. Creating a birthday event on OurCityvibe is free.",
  },
  {
    title: "2. Sponsor",
    body: `This promotion (the "Birthday Raffle") is sponsored and administered by ${SPONSOR_NAME}, ${SPONSOR_ADDRESS} (the "Sponsor"). The Sponsor is solely responsible for the promotion, including the selection of winners and the awarding of prizes.`,
  },
  {
    title: "3. Apple is not involved",
    body: "Apple Inc. is not a sponsor of this promotion and is not involved with it in any manner. Apple does not administer, endorse, or provide any prize for the Birthday Raffle, and has no responsibility or liability of any kind in connection with it. Any questions, comments, complaints or claims regarding the Birthday Raffle must be directed to the Sponsor, not to Apple.",
  },
  {
    title: "4. Eligibility",
    body: "Entry is open worldwide to individuals who are 18 years of age or older at the time of entry and who hold a valid OurCityvibe account. Void where prohibited or restricted by law. Employees of the Sponsor, their immediate families and anyone living in the same household are not eligible. It is your responsibility to check that entering is lawful where you live; if it is not, you must not enter.",
  },
  {
    title: "5. Entry period",
    body: "Each campaign runs for the period shown on the Birthday Raffle screen in the app, which displays the current campaign's closing date and a live countdown. Only qualifying events created during an open campaign period are entered into that campaign. Entries received after a campaign closes are not eligible for it.",
  },
  {
    title: "6. How to enter",
    body: "Create a birthday event on OurCityvibe during an open campaign period using the \"Create Birthday Event & Enter\" option. Doing so enters that event into the current campaign automatically. You may create and enter more than one qualifying event.",
  },
  {
    title: "7. Entries and odds of winning",
    body: "Each qualifying birthday event receives one (1) entry into the random draw, plus one (1) additional entry for each unique verified RSVP that event receives from a distinct OurCityvibe account. An event showing a score of 8 in the app therefore holds 8 entries in the draw. Duplicate, fraudulent, automated or incentivised RSVPs do not count and may disqualify the entry entirely. The odds of winning depend on the total number of entries received across all participants during the campaign period.",
  },
  {
    title: "8. Winner selection",
    body: "After the campaign closes, winners are selected by a random draw conducted by the Sponsor from all eligible entries received during that campaign period. Because each verified RSVP adds an additional entry, collecting more RSVPs increases the number of chances an entry holds in the draw, but does not guarantee a win. The draw is final. One prize per entrant; a single entrant cannot win more than one prize tier in the same campaign.",
  },
  {
    title: "9. Prizes",
    body: "The prizes for the current campaign, including the number of prize tiers and the value of each, are displayed on the Birthday Raffle screen in the app. Prizes are not transferable and no cash alternative is offered except at the Sponsor's sole discretion. The Sponsor may substitute a prize of equal or greater value where a prize becomes unavailable. Where a cash prize is stated in Nigerian Naira (₦), payment is made in Naira; winners outside Nigeria may receive the equivalent value by a method determined by the Sponsor.",
  },
  {
    title: "10. Winner notification and claim",
    body: "Winners are notified in the app and by the email address registered to their OurCityvibe account. A winner must respond and provide any information reasonably required to verify eligibility and deliver the prize within fourteen (14) days of first notification. If a winner cannot be contacted, does not respond within that period, is found to be ineligible, or declines the prize, the Sponsor may forfeit that prize and draw an alternate winner.",
  },
  {
    title: "11. Taxes and costs",
    body: "Winners are solely responsible for any taxes, levies, bank charges or other costs arising from accepting a prize, and for any expenses not expressly stated as included in the prize.",
  },
  {
    title: "12. Disqualification",
    body: "The Sponsor may disqualify any entry, and may remove or ban any account, where it reasonably believes there has been fraud, manipulation of RSVPs, use of fake or duplicate accounts, automated entry, or any breach of these rules or of the OurCityvibe Terms of Service.",
  },
  {
    title: "13. Publicity",
    body: "By accepting a prize, a winner agrees that the Sponsor may publish their username and the name of their winning event in the app and on the Sponsor's channels to announce the result, unless prohibited by law. No other personal information is published without separate consent.",
  },
  {
    title: "14. Privacy",
    body: "Information submitted in connection with the Birthday Raffle is handled in accordance with the OurCityvibe Privacy Policy, available in the app. It is used to administer the promotion, verify eligibility and deliver prizes.",
  },
  {
    title: "15. Limitation of liability",
    body: "To the fullest extent permitted by law, the Sponsor is not liable for any loss or damage arising from participation in the Birthday Raffle or from acceptance or use of a prize, nor for entries that are lost, delayed or not recorded due to network, device or technical failure. Nothing in these rules limits liability that cannot be limited by law.",
  },
  {
    title: "16. Changes and cancellation",
    body: "The Sponsor may amend these rules, or suspend, modify or cancel a campaign, where it is necessary to do so for legal or operational reasons or where the promotion cannot be run as planned. Any change will be reflected in these rules in the app. Continuing to participate after a change means you accept it.",
  },
  {
    title: "17. Contact",
    body: `Questions about the Birthday Raffle, or a request for the name of a winner after a campaign has closed, can be sent to ${SUPPORT_EMAIL}, or through Contact Support in the app's Settings.`,
  },
];

export default function BirthdayRaffleRulesScreen() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <LinearGradient
        colors={[colors.background, colors.backgroundSecondary, colors.backgroundTertiary]}
        style={styles.header}
      >
        <GlassBackButton style={styles.backButton} />
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Official Rules</Text>
          <Text style={styles.headerSubtitle}>Birthday Raffle · {LAST_UPDATED}</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Apple's requirement is that this is unmissable, not merely present —
            so it leads the screen as well as appearing as section 3. */}
        <View style={styles.appleNotice}>
          <Text style={styles.appleNoticeText}>
            Apple is not a sponsor of this promotion and is not involved with it in any manner.
          </Text>
        </View>

        <Text style={styles.intro}>
          These are the official rules of the OurCityvibe Birthday Raffle. Read them before
          entering — by entering, you accept them.
        </Text>

        {SECTIONS.map((section) => (
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
    headerText: { flex: 1, minWidth: 0 },
    headerTitle: { fontSize: scaleFontSize(26), fontFamily: Fonts.bold, color: c.text },
    headerSubtitle: {
      fontSize: scaleFontSize(13),
      fontFamily: Fonts.regular,
      color: c.textSecondary,
      marginTop: 2,
    },
    content: { padding: getResponsivePadding(), paddingBottom: 40 },
    appleNotice: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      padding: 14,
      marginBottom: 18,
    },
    appleNoticeText: {
      fontSize: scaleFontSize(13),
      fontFamily: Fonts.semiBold,
      color: c.textBody,
      lineHeight: 19,
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
