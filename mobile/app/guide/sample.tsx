import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";

export default function SampleGuidePage() {
  const router = useRouter();

  const sampleGuide = {
    title: "Top 10 Pizza Spots in New York City from a Taxi Driver",
    author: "Mike the NYC Cabbie",
    city: "New York City",
    state: "New York",
    topic: "Food and Restaurants",
    description:
      "After 20 years driving a cab in NYC, I've eaten pizza from almost every corner of this city. This guide shares my personal favorites - the hidden gems and classics that locals actually go to. These aren't just tourist traps; these are the spots where you'll find real New Yorkers grabbing a slice at 2 AM.",
    price: 4.99,
    sections: [
      {
        rank: 1,
        title: "Joe's Pizza, Greenwich Village",
        description:
          "If there's one place that defines NYC pizza, it's Joe's. Located in the heart of Greenwich Village, this spot has been serving perfect slices since 1975. The crust is thin and crispy, the sauce is perfectly balanced, and the cheese... chef's kiss. I've probably taken hundreds of tourists here, and I still grab a slice myself every Friday. The line moves fast, and you can fold your slice while walking - the true NYC way. Best time to go: After 10 PM when the late-night crowd rolls in.",
      },
      {
        rank: 2,
        title: "Di Fara Pizza, Midwood Brooklyn",
        description:
          "This is where pizza becomes art. Dom DeMarco (now his family continues the tradition) makes each pie individually, and yes, you'll wait 45 minutes. But trust me, it's worth it. The square slices are incredible - the crust has this perfect char, and they use imported ingredients from Italy. I discovered this place in my second year of driving, when an old Italian guy insisted I take him there. Changed my life. Pro tip: Go on a weekday afternoon to avoid the massive weekend crowds.",
      },
      {
        rank: 3,
        title: "Prince Street Pizza, Nolita",
        description:
          "Famous for their spicy pepperoni square slice, and for good reason. The pepperoni cups up and gets crispy, creating these little pools of spicy oil (sounds weird, tastes amazing). It's a tiny spot, so be prepared to eat standing up or take it to go. I like to park nearby around lunchtime and grab a slice between fares. The regular slice is also fantastic if you're not into spicy food. Cash only, so come prepared!",
      },
      {
        rank: 4,
        title: "L&B Spumoni Gardens, Bensonhurst",
        description:
          "This is old-school Brooklyn at its finest. Their Sicilian slice is legendary - they put the sauce on TOP of the cheese, which sounds backwards but creates this amazing flavor combination. It's been family-run since 1939. The place is huge with indoor and outdoor seating, and they also serve amazing Italian ice (spumoni). Perfect spot for a family outing. I took my kids here for their birthdays. Sunday afternoons can get crazy busy, so plan accordingly.",
      },
      {
        rank: 5,
        title: "Artichoke Basille's Pizza, Multiple Locations",
        description:
          "This place is famous for their artichoke slice - basically a thick slice covered in a creamy artichoke and spinach dip. It's heavy, it's rich, and it's incredible after a night out. Multiple locations across the city, but the original on 14th Street has the best vibe. I've driven so many drunk passengers to this place at 3 AM that I know the menu by heart. Also try their crab slice if you're feeling adventurous. Not traditional NYC pizza, but absolutely delicious.",
      },
      {
        rank: 6,
        title: "Roberta's, Bushwick Brooklyn",
        description:
          "This is the hipster pizza spot, but don't let that turn you off - the pizza is genuinely fantastic. They use a wood-fired oven and make everything from scratch, including their mozzarella. The atmosphere is super cool, with an outdoor garden and a younger crowd. I started going here when I picked up one of the chefs after his shift, and he convinced me to try it. The Bee Sting pizza (spicy honey on pepperoni) is a must-try. Reservations recommended on weekends.",
      },
      {
        rank: 7,
        title: "John's of Bleecker Street, Greenwich Village",
        description:
          "Coal-oven pizza that's been perfecting their craft since 1929. This place has so much history - you can feel it in the worn booths and the walls covered in photos and signatures. They only serve whole pies, no slices, and they don't allow modifications. But you don't need modifications when the pizza is this good. Cash only. The atmosphere is dark and cozy, perfect for a date night or family dinner. I proposed to my wife at the table near the back.",
      },
      {
        rank: 8,
        title: "Lucali, Carroll Gardens Brooklyn",
        description:
          "No phone, no reservations, cash only - you just show up and wait. And people do, for hours. Mark Iacono makes each pie individually in a brick oven using a marble rolling pin. It's an experience as much as it's dinner. The crust is thin and charred, and they'll bring you garlic knots while you wait. Bring cash and patience, but the pizza is absolutely worth it. I've waited 2 hours here and didn't regret a minute. BYOB too!",
      },
      {
        rank: 9,
        title: "Patsy's Pizzeria, East Harlem",
        description:
          "The original location since 1933, and they're still using the same coal oven. Frank Sinatra used to eat here! The pizza is classic NYC thin crust, and everything tastes like it did 80 years ago (in the best way). It's a bit off the beaten path in East Harlem, so you get a more local vibe. The marinara sauce is simple and perfect. I love bringing first-time visitors here because it feels like stepping back in time.",
      },
      {
        rank: 10,
        title: "Scarr's Pizza, Lower East Side",
        description:
          "This is the new kid on the block (opened 2016), but they're doing everything right. They mill their own flour daily, use organic ingredients, and the pizza tastes clean and fresh. It's also surprisingly affordable for the quality. The owner, Scarr, is usually there and super passionate about pizza. Great spot for lunch between sightseeing. The plain slice is perfect - sometimes simple is best. Also, they deliver late which has saved me many times during long night shifts.",
      },
    ],
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sample Guide</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.banner}>
          <Ionicons name="information-circle" size={24} color="#a855f7" />
          <Text style={styles.bannerText}>
            This is an example of what a completed guide looks like
          </Text>
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.title}>{sampleGuide.title}</Text>
          <View style={styles.authorRow}>
            <Ionicons name="person-circle-outline" size={20} color="#9ca3af" />
            <Text style={styles.authorText}>by {sampleGuide.author}</Text>
          </View>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="location" size={16} color="#a855f7" />
              <Text style={styles.metaText}>
                {sampleGuide.city}, {sampleGuide.state}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="pricetag" size={16} color="#a855f7" />
              <Text style={styles.metaText}>{sampleGuide.topic}</Text>
            </View>
          </View>
        </View>

        <View style={styles.priceSection}>
          <View style={styles.priceContent}>
            <Text style={styles.priceLabel}>Price</Text>
            <Text style={styles.priceValue}>
              ${sampleGuide.price.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{sampleGuide.description}</Text>
        </View>

        <View style={styles.sectionsContainer}>
          <Text style={styles.sectionTitle}>
            Guide Sections ({sampleGuide.sections.length})
          </Text>
          {sampleGuide.sections.map((section, index) => (
            <View key={index} style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>#{section.rank}</Text>
                </View>
                <Text style={styles.sectionTitleText}>{section.title}</Text>
              </View>
              <Text style={styles.sectionDescription}>
                {section.description}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.ctaSection}>
          <Text style={styles.ctaTitle}>Ready to create your own guide?</Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push("/guide/create" as any)}
          >
            <Ionicons name="create" size={20} color="#fff" />
            <Text style={styles.ctaButtonText}>Create Guide</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  backButton: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: "#a855f7",
  },
  bannerText: {
    flex: 1,
    fontSize: 14,
    fontFamily: Fonts.medium,
    color: "#d1d5db",
    lineHeight: 20,
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 12,
    lineHeight: 36,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  authorText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: "#d1d5db",
  },
  priceSection: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#374151",
  },
  priceContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceLabel: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
  },
  priceValue: {
    fontSize: 32,
    fontFamily: Fonts.bold,
    color: "#a855f7",
  },
  descriptionSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#d1d5db",
    lineHeight: 24,
  },
  sectionsContainer: {
    marginTop: 20,
  },
  sectionCard: {
    backgroundColor: "#1f1f2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#374151",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  rankBadge: {
    backgroundColor: "#a855f7",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rankText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  sectionTitleText: {
    flex: 1,
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#d1d5db",
    lineHeight: 22,
  },
  ctaSection: {
    marginTop: 40,
    alignItems: "center",
    paddingVertical: 30,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  ctaTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: 20,
    textAlign: "center",
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#a855f7",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  ctaButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#fff",
  },
});
