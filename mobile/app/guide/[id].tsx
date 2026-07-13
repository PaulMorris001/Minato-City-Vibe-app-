import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { showError, showSuccess } from "@/utils/toast";
import { Image } from "expo-image";
import { createGuideShareLink } from "@/utils/shareLinks";
import { formatLocation } from "@/utils/location";
import { toggleGuideSave } from "@/libs/api";
import { useRouter, useLocalSearchParams } from "expo-router";
import { goBack } from "@/utils/navigation";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import { Guide } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { useStripePayment } from "@/hooks/useStripePayment";
import { currencyPrefix } from "@/constants/payments";
import GuideCardSkeleton from "@/components/skeletons/GuideCardSkeleton";
import ReportBlockSheet from "@/components/shared/ReportBlockSheet";
import ShareSheet, { ShareTarget } from "@/components/shared/ShareSheet";
import { Avatar } from "@/components/shared/Avatar";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
export default function GuideDetailPage() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  // Sanitize: useLocalSearchParams can hand back `string | string[]` for
  // malformed deep links — narrow to a single string we can rely on.
  const rawParams = useLocalSearchParams();
  const id =
    typeof rawParams.id === "string"
      ? rawParams.id
      : Array.isArray(rawParams.id)
        ? rawParams.id[0]
        : undefined;
  const formatPrice = useFormatPrice();
  const { payForGuide } = useStripePayment();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [shareSheetVisible, setShareSheetVisible] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);

  useEffect(() => {
    SecureStore.getItemAsync("user").then((u) => {
      if (u) {
        try {
          const parsed = JSON.parse(u);
          setCurrentUserId(parsed.id || parsed._id);
        } catch {}
      }
    });
  }, []);

  useEffect(() => {
    fetchGuide();
  }, [id]);

  const fetchGuide = async () => {
    if (!id) {
      setLoading(false);
      Alert.alert(
        "Invalid link",
        "This guide link doesn't look right.",
        [{ text: "OK", onPress: () => router.replace("/(tabs)/home") }]
      );
      return;
    }
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("token");

      const response = await fetch(`${BASE_URL}/guides/${id}`, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
            }
          : {},
      });
      const data = await response.json();

      if (response.ok) {
        setGuide(data.guide);
        setHasPurchased(data.hasPurchased || false);
        setIsOwner(data.isOwner || false);
        setIsSaved(data.isSaved || false);
      } else {
        // If the user cold-started from a shared link, there's no back stack
        // to pop to — fall through to home if `router.back()` would no-op.
        const title = response.status === 404 ? "Not Found" : "Unavailable";
        const fallback =
          response.status === 404
            ? "We couldn't find this guide. The link may be incorrect."
            : "This guide is no longer available.";
        Alert.alert(title, data.message || fallback, [
          {
            text: "OK",
            onPress: () => {
              if (router.canGoBack()) router.back();
              else router.replace("/(tabs)/home");
            },
          },
        ]);
      }
    } catch (error) {
      console.error("Failed to fetch guide:", error);
      Alert.alert("Error", "Failed to load guide", [
        {
          text: "OK",
          onPress: () => {
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/home");
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSave = async () => {
    if (savingToggle || !id) return;
    setSavingToggle(true);
    const next = !isSaved;
    setIsSaved(next); // optimistic
    try {
      const res = await toggleGuideSave(id);
      if (typeof res?.saved === "boolean") setIsSaved(res.saved);
    } catch {
      setIsSaved(!next); // revert on failure
    } finally {
      setSavingToggle(false);
    }
  };

  const shareTarget: ShareTarget | null = guide && id
    ? {
        kind: "guide",
        guideId: id,
        title: guide.title,
        externalUrl: createGuideShareLink(id),
      }
    : null;

  const handlePurchase = async () => {
    if (!id) return;
    const token = await SecureStore.getItemAsync("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setPurchasing(true);
    try {
      // The hook runs the provider checkout AND confirms server-side (granting
      // access) before returning, so success here means the guide is unlocked.
      const result = await payForGuide(id);
      if (!result.success) {
        if (result.error) showError(result.error, "Payment Failed");
        return;
      }

      showSuccess("Guide unlocked! Enjoy reading.");
      // Notify guide author that their guide was sold (in-app feed entry).
      fetch(`${BASE_URL}/notifications/sold`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "guide", id }),
      }).catch(() => {});
      setHasPurchased(true);
      fetchGuide();
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <GuideCardSkeleton count={1} />
      </View>
    );
  }

  if (!guide) {
    return null;
  }

  const canViewContent = isOwner || hasPurchased || guide.price === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton onPress={() => {
            // Warm-start deep links have no back stack — fall through to
            // home so the user isn't stranded on the guide screen.
            if (router.canGoBack()) router.back();
            else router.replace("/(tabs)/home");
          }} style={styles.backButton} />
        <Text style={styles.headerTitle} numberOfLines={1}>
          Guide
        </Text>
        <View style={styles.headerActions}>
          {!isOwner && (
            <TouchableOpacity
              style={styles.shareButton}
              onPress={handleToggleSave}
              accessibilityLabel={isSaved ? "Unsave guide" : "Save guide"}
            >
              <Ionicons
                name={isSaved ? "bookmark" : "bookmark-outline"}
                size={22}
                color={colors.primary}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.shareButton}
            onPress={() => setShareSheetVisible(true)}
            accessibilityLabel="Share guide"
          >
            <Ionicons name="share-social" size={22} color={colors.primary} />
          </TouchableOpacity>
          {!isOwner ? (
            <TouchableOpacity
              style={styles.shareButton}
              onPress={() => setReportSheetVisible(true)}
              accessibilityLabel="Report guide or block author"
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {!!guide.coverImage && (
          <Image source={{ uri: guide.coverImage }} style={styles.coverImage} contentFit="cover" />
        )}

        <View style={styles.titleSection}>
          <Text style={styles.title}>{guide.title}</Text>
          <TouchableOpacity
            style={styles.authorRow}
            activeOpacity={0.7}
            disabled={!guide.author?._id}
            onPress={() => {
              if (guide.author?._id) {
                router.push({
                  pathname: "/user-profile",
                  params: { userId: guide.author._id },
                } as any);
              }
            }}
            accessibilityLabel={`View ${guide.authorName}'s profile`}
          >
            <Avatar
              uri={guide.author?.profilePicture}
              name={guide.author?.username || guide.authorName}
              size={24}
            />
            <Text style={styles.authorText}>by {guide.authorName}</Text>
            {!!guide.author?._id && (
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            )}
          </TouchableOpacity>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Ionicons name="location" size={16} color={colors.primary} />
              <Text style={styles.metaText}>
                {formatLocation({ city: guide.city, state: guide.cityState, country: guide.country })}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="pricetag" size={16} color={colors.primary} />
              <Text style={styles.metaText}>{guide.topic}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="eye-outline" size={16} color={colors.primary} />
              <Text style={styles.metaText}>{guide.views} views</Text>
            </View>
          </View>
        </View>

        <View style={styles.priceSection}>
          <View style={styles.priceContent}>
            <View>
              <Text style={styles.priceLabel}>Price</Text>
              {guide.price === 0 ? (
                <View style={styles.freeBadge}>
                  <Text style={styles.freeBadgeText}>FREE</Text>
                </View>
              ) : (
                <Text style={styles.priceValue}>{currencyPrefix(guide.currency)}{formatPrice(guide.price)}</Text>
              )}
            </View>
            <View style={styles.sectionCountChip}>
              <Ionicons name="list" size={14} color={colors.primary} />
              <Text style={styles.sectionCountText}>{guide.sections.length} section{guide.sections.length !== 1 ? "s" : ""}</Text>
            </View>
          </View>
          {!canViewContent && (
            <TouchableOpacity
              style={styles.purchaseButton}
              onPress={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="lock-open-outline" size={20} color="#fff" />
                  <Text style={styles.purchaseButtonText}>Unlock Guide · {currencyPrefix(guide.currency)}{formatPrice(guide.price)}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {isOwner && (
            <View style={styles.ownerBadge}>
              <Ionicons name="star" size={16} color={colors.warningLight} />
              <Text style={styles.ownerBadgeText}>Your Guide</Text>
            </View>
          )}
          {hasPurchased && !isOwner && (
            <View style={styles.purchasedBadge}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={styles.purchasedBadgeText}>Purchased</Text>
            </View>
          )}
        </View>

        <View style={styles.descriptionSection}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{guide.description}</Text>
        </View>

        {canViewContent ? (
          <View style={styles.sectionsContainer}>
            <Text style={styles.sectionTitle}>
              Guide Sections ({guide.sections.length})
            </Text>
            {guide.sections
              .sort((a, b) => a.rank - b.rank)
              .map((section, index) => (
                <View key={index} style={styles.sectionCard}>
                  <View style={styles.sectionHeader}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>#{section.rank}</Text>
                    </View>
                    {/* flex:1 + numberOfLines so a long title wraps/truncates
                        inside the card instead of overflowing past its edge. */}
                    <Text
                      style={[styles.sectionTitle, { flex: 1, marginBottom: 0 }]}
                      numberOfLines={2}
                    >
                      {section.title}
                    </Text>
                  </View>
                  {!!section.image && (
                    <Image source={{ uri: section.image }} style={styles.sectionImage} contentFit="cover" />
                  )}
                  <Text style={styles.sectionDescription}>
                    {section.description}
                  </Text>
                </View>
              ))}
          </View>
        ) : (
          <View style={styles.lockedSection}>
            <View style={styles.lockedIconWrap}>
              <Ionicons name="lock-closed" size={28} color={colors.primary} />
            </View>
            <Text style={styles.lockedTitle}>Unlock Full Guide</Text>
            <Text style={styles.lockedText}>
              Get access to all {guide.sections.length} section{guide.sections.length !== 1 ? "s" : ""} with insider tips, photos, and recommendations.
            </Text>
            <TouchableOpacity
              style={[styles.purchaseButton, { marginTop: 20, alignSelf: "stretch" }]}
              onPress={handlePurchase}
              disabled={purchasing}
            >
              {purchasing ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="lock-open-outline" size={18} color="#fff" />
                  <Text style={styles.purchaseButtonText}>Unlock Guide · {currencyPrefix(guide.currency)}{formatPrice(guide.price)}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {guide && !isOwner ? (
        <ReportBlockSheet
          visible={reportSheetVisible}
          onClose={() => setReportSheetVisible(false)}
          targetType="guide"
          targetId={guide._id}
          targetUserId={guide.author?._id}
          targetUsername={guide.author?.username || guide.authorName}
          currentUserId={currentUserId}
          onBlocked={() => goBack()}
        />
      ) : null}

      <ShareSheet
        visible={shareSheetVisible}
        onClose={() => setShareSheetVisible(false)}
        target={shareTarget}
      />
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  backButton: {
    marginRight: 16,
  },
  shareButton: {
    padding: 4,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: c.text,
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: c.background,
  },
  coverImage: {
    width: "100%",
    height: 200,
    borderRadius: 16,
    marginBottom: 16,
  },
  sectionImage: {
    width: "100%",
    height: 160,
    borderRadius: 12,
    marginBottom: 12,
  },
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontFamily: Fonts.bold,
    color: c.text,
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
    color: c.textSecondary,
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
    color: c.textTertiary,
  },
  priceSection: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: c.border,
  },
  priceContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  priceLabel: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  priceValue: {
    fontSize: 32,
    fontFamily: Fonts.bold,
    color: c.primary,
  },
  freeBadge: {
    backgroundColor: "rgba(34,197,94,0.15)",
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.4)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  freeBadgeText: {
    fontSize: 16,
    fontFamily: Fonts.bold,
    color: "#22c55e",
    letterSpacing: 1,
  },
  sectionCountChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: c.primaryFaded,
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.25)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sectionCountText: {
    fontSize: 13,
    fontFamily: Fonts.medium,
    color: c.primary,
  },
  purchaseButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.primary,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  purchaseButtonText: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: c.white,
  },
  ownerBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  ownerBadgeText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.warningLight,
  },
  purchasedBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  purchasedBadgeText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: c.success,
  },
  descriptionSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: c.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: c.textTertiary,
    lineHeight: 24,
  },
  sectionsContainer: {
    marginTop: 20,
  },
  sectionCard: {
    backgroundColor: c.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  rankBadge: {
    backgroundColor: c.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rankText: {
    fontSize: 14,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textTertiary,
    lineHeight: 22,
  },
  lockedSection: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: "rgba(168,85,247,0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.primaryFadedStrong,
    marginTop: 8,
  },
  lockedIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.primaryFaded,
    borderWidth: 1,
    borderColor: c.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: c.text,
    marginTop: 14,
    marginBottom: 6,
  },
  lockedText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
});
