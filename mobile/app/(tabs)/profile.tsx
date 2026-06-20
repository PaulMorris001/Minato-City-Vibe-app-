import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Animated,
  Easing,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import * as SecureStore from "expo-secure-store";
import axios from "axios";

import { Avatar } from "@/components/shared/Avatar";
import GuestGate from "@/components/shared/GuestGate";
import { AU } from "@/components/auth/tokens";
import { BASE_URL } from "@/constants/constants";
import { Fonts } from "@/constants/fonts";
import { heroEmojiFor } from "@/utils/eventDetails";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { Guide } from "@/libs/interfaces";

interface UserProfile {
  _id: string;
  username: string;
  profilePicture?: string;
  bio?: string;
  isVendor?: boolean;
  verified?: boolean;
  followersCount: number;
  followingCount: number;
}

interface UserEvent {
  _id: string;
  title: string;
  date: string;
  location: string;
  image?: string;
  userStatus: "creator" | "accepted" | "pending" | "none";
  invitedUsers: unknown[];
}

type TabKey = "hosted" | "attended";

export default function ProfileScreen() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TabKey>("hosted");
  const [isGuest, setIsGuest] = useState(false);

  const fetchProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await axios.get(`${BASE_URL}/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const u = res.data.user;
      setUser({
        _id: u._id,
        username: u.username,
        profilePicture: u.profilePicture || "",
        bio: u.bio || "",
        isVendor: u.isVendor,
        verified: u.verified || false,
        followersCount: u.followersCount || 0,
        followingCount: u.followingCount || 0,
      });
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  const fetchEvents = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await axios.get(`${BASE_URL}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const all: UserEvent[] = res.data.events || [];
      setEvents(
        all.filter((e) => e.userStatus === "creator" || e.userStatus === "accepted")
      );
    } catch (err) {
      console.error("Error fetching events:", err);
    }
  };

  const fetchGuides = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (!token) return;
      const res = await axios.get(`${BASE_URL}/guides/my-guides`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGuides(res.data.guides || []);
    } catch (err) {
      console.error("Error fetching guides:", err);
    }
  };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    const token = await SecureStore.getItemAsync("token");
    setIsGuest(!token);
    await Promise.all([fetchProfile(), fetchEvents(), fetchGuides()]);
    if (!silent) setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData(true);
    }, [])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, []);

  const hosted = useMemo(
    () => events.filter((e) => e.userStatus === "creator"),
    [events]
  );
  const attended = useMemo(
    () => events.filter((e) => e.userStatus === "accepted"),
    [events]
  );
  const visibleEvents = tab === "hosted" ? hosted : attended;

  if (isGuest) return <GuestGate />;

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <FlatList
          data={visibleEvents}
          renderItem={({ item }) => <EventRow event={item} />}
          keyExtractor={(item) => item._id}
          ListHeaderComponent={
            <Header
              user={user}
              eventsTotal={events.length}
              guidesTotal={guides.length}
              tab={tab}
              setTab={setTab}
              loading={loading}
            />
          }
          ListEmptyComponent={
            loading ? null : <EmptyState tab={tab} />
          }
          ListFooterComponent={
            loading ? null : <GuidesSection guides={guides} />
          }
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={AU.purple}
              colors={[AU.purple]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </View>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────────
function Header({
  user,
  eventsTotal,
  guidesTotal,
  tab,
  setTab,
  loading,
}: {
  user: UserProfile | null;
  eventsTotal: number;
  guidesTotal: number;
  tab: TabKey;
  setTab: (t: TabKey) => void;
  loading: boolean;
}) {
  return (
    <View>
      {/* Top row */}
      <View style={styles.topRow}>
        <Text style={styles.kicker}>PROFILE</Text>
        <TouchableOpacity
          onPress={() => router.push("/settings")}
          activeOpacity={0.7}
          style={styles.settingsBtn}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={16} color={AU.text} />
        </TouchableOpacity>
      </View>

      {/* Hero (avatar + name) */}
      <View style={styles.heroBlock}>
        <View style={styles.heroRow}>
          <Avatar
            uri={user?.profilePicture}
            name={user?.username}
            size={68}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {user?.username || (loading ? "" : "—")}
              </Text>
              {user?.verified && (
                <Ionicons name="checkmark-circle" size={20} color="#3b82f6" />
              )}
            </View>
            <Text style={styles.handle} numberOfLines={1}>
              @{(user?.username || "").toLowerCase()}
              {user?.isVendor && (
                <Text style={styles.handleVendor}> · Vendor</Text>
              )}
            </Text>
          </View>
        </View>

        {!!user?.bio && <Text style={styles.bio}>{user.bio}</Text>}

        {/* Stats row */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() =>
              user &&
              router.push({
                pathname: "/followers",
                params: { userId: user._id },
              } as any)
            }
            style={styles.stat}
          >
            <Text style={styles.statValue}>{user?.followersCount ?? 0}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() =>
              user &&
              router.push({
                pathname: "/following",
                params: { userId: user._id },
              } as any)
            }
            style={styles.stat}
          >
            <Text style={styles.statValue}>{user?.followingCount ?? 0}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{eventsTotal}</Text>
            <Text style={styles.statLabel}>Events</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{guidesTotal}</Text>
            <Text style={styles.statLabel}>Guides</Text>
          </View>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TouchableOpacity
          style={styles.searchField}
          onPress={() => router.push("/search-users" as any)}
          activeOpacity={0.7}
        >
          <Ionicons name="search" size={14} color={AU.textMute} />
          <Text style={styles.searchPlaceholder}>Search users…</Text>
        </TouchableOpacity>
      </View>

      {/* Events section header + tabs */}
      <View style={styles.eventsHeader}>
        <Text style={styles.sectionTitle}>Events</Text>
        <TabsRow tab={tab} setTab={setTab} />
      </View>
    </View>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────────
function TabsRow({
  tab,
  setTab,
}: {
  tab: TabKey;
  setTab: (t: TabKey) => void;
}) {
  // Underline x-position is interpolated between the two tab anchors.
  const anim = React.useRef(new Animated.Value(tab === "hosted" ? 0 : 1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: tab === "hosted" ? 0 : 1,
      duration: 200,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();
  }, [tab, anim]);

  // Tab widths roughly match the text run; gap from layout is 14.
  const HOSTED_W = 46;
  const ATTENDED_W = 60;
  const GAP = 14;
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, HOSTED_W + GAP],
  });
  const width = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [HOSTED_W, ATTENDED_W],
  });

  return (
    <View style={styles.tabsRow}>
      <TouchableOpacity onPress={() => setTab("hosted")} activeOpacity={0.7}>
        <Text
          style={[
            styles.tabLabel,
            tab === "hosted" ? styles.tabLabelActive : styles.tabLabelInactive,
            { width: HOSTED_W },
          ]}
        >
          Hosted
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setTab("attended")} activeOpacity={0.7}>
        <Text
          style={[
            styles.tabLabel,
            tab === "attended" ? styles.tabLabelActive : styles.tabLabelInactive,
            { width: ATTENDED_W },
          ]}
        >
          Attended
        </Text>
      </TouchableOpacity>
      <Animated.View style={[styles.tabUnderlineWrap, { transform: [{ translateX }], width }]}>
        <LinearGradient
          colors={[AU.purple, AU.pink]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.tabUnderline}
        />
      </Animated.View>
    </View>
  );
}

// ─── Event row ──────────────────────────────────────────────────────────────
function EventRow({ event }: { event: UserEvent }) {
  const created = event.userStatus === "creator";
  const date = useMemo(() => {
    const d = new Date(event.date);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }, [event.date]);
  const emoji = useMemo(() => heroEmojiFor(event.title), [event.title]);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() =>
        router.push({ pathname: "/event/[id]", params: { id: event._id } })
      }
      style={styles.eventRow}
    >
      <View style={styles.thumbWrap}>
        {event.image ? (
          <Image source={{ uri: event.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={["#22D3EE", "#7C3AED", "#EC4899"]}
            locations={[0, 0.5, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <Text style={styles.thumbEmoji}>{emoji}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.eventTitle} numberOfLines={1}>
          {event.title}
        </Text>
        <View style={styles.subRow}>
          <Text style={styles.subText} numberOfLines={1}>
            {date}
          </Text>
          <View style={styles.subDot} />
          <Text style={styles.subText} numberOfLines={1}>
            {event.location}
          </Text>
        </View>
      </View>
      <View style={styles.roleIndicator}>
        <View
          style={[
            styles.roleDot,
            created ? styles.roleDotCreated : styles.roleDotAttended,
          ]}
        />
        <Text
          style={[
            styles.roleLabel,
            { color: created ? AU.purpleSoft : AU.textMute },
          ]}
        >
          {created ? "CREATED" : "ATTENDED"}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Guides section ───────────────────────────────────────────────────────────
function GuidesSection({ guides }: { guides: Guide[] }) {
  return (
    <View style={styles.guidesSection}>
      <View style={styles.guidesHeader}>
        <Text style={styles.sectionTitle}>Guides</Text>
        <TouchableOpacity
          onPress={() => router.push("/my-guides" as any)}
          activeOpacity={0.7}
          style={styles.manageBtn}
        >
          <Ionicons name="add" size={14} color={AU.purpleSoft} />
          <Text style={styles.manageText}>Manage</Text>
        </TouchableOpacity>
      </View>

      {guides.length === 0 ? (
        <TouchableOpacity
          onPress={() => router.push("/guide/create" as any)}
          activeOpacity={0.85}
          style={styles.guidesEmpty}
        >
          <Ionicons name="book-outline" size={18} color={AU.textMute} />
          <Text style={styles.guidesEmptyText}>
            Share your local knowledge — create a guide
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={{ gap: 8 }}>
          {guides.map((guide) => (
            <GuideRow key={guide._id} guide={guide} />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Guide row ──────────────────────────────────────────────────────────────
function GuideRow({ guide }: { guide: Guide }) {
  const formatPrice = useFormatPrice();
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() =>
        router.push({ pathname: "/guide/[id]", params: { id: guide._id } })
      }
      style={styles.eventRow}
    >
      <View style={styles.thumbWrap}>
        {guide.coverImage ? (
          <Image
            source={{ uri: guide.coverImage }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
        ) : (
          <LinearGradient
            colors={["#7C3AED", "#EC4899"]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <Ionicons
          name="book"
          size={20}
          color="rgba(255,255,255,0.85)"
          style={styles.guideThumbIcon}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.eventTitle} numberOfLines={1}>
          {guide.title}
        </Text>
        <View style={styles.subRow}>
          <Text style={styles.subText} numberOfLines={1}>
            {guide.city}
            {guide.cityState ? `, ${guide.cityState}` : ""}
          </Text>
          <View style={styles.subDot} />
          <Text style={styles.subText} numberOfLines={1}>
            {guide.price === 0 ? "FREE" : `$${formatPrice(guide.price)}`}
          </Text>
        </View>
      </View>
      {guide.isDraft ? (
        <View style={styles.draftBadge}>
          <Text style={styles.draftBadgeText}>DRAFT</Text>
        </View>
      ) : (
        <View style={styles.roleIndicator}>
          <Ionicons name="eye-outline" size={13} color={AU.textMute} />
          <Text style={[styles.roleLabel, { color: AU.textMute }]}>
            {guide.views}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Empty states ───────────────────────────────────────────────────────────
function EmptyState({ tab }: { tab: TabKey }) {
  if (tab === "hosted") {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>You haven't hosted yet</Text>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/events" as any)}
          activeOpacity={0.85}
          style={styles.ctaPrimaryWrap}
        >
          <LinearGradient
            colors={[AU.purple, AU.purpleDeep, AU.pink]}
            locations={[0, 0.5, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.ctaPrimaryText}>Create event</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Nothing yet — pick a night.</Text>
      <TouchableOpacity
        onPress={() => router.push("/(tabs)/events" as any)}
        activeOpacity={0.85}
        style={styles.ctaSecondary}
      >
        <Text style={styles.ctaSecondaryText}>Browse events</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AU.bg },
  listContent: { paddingBottom: 40, flexGrow: 1 },

  // Top row
  topRow: {
    paddingTop: 8,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kicker: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 13,
    color: AU.textDim,
    letterSpacing: 2.34,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: AU.stroke,
    alignItems: "center",
    justifyContent: "center",
  },

  // Hero
  heroBlock: {
    paddingTop: 20,
    paddingHorizontal: 22,
    position: "relative",
  },
  heroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    zIndex: 1,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: {
    flex: 1,
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 26,
    letterSpacing: -0.78,
    color: AU.text,
    lineHeight: 26 * 1.05,
  },
  handle: {
    color: AU.textDim,
    fontFamily: Fonts.medium,
    fontSize: 12.5,
    marginTop: 3,
  },
  handleVendor: { color: AU.purpleSoft, fontFamily: Fonts.bold },
  bio: {
    color: AU.text,
    fontFamily: Fonts.regular,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 14,
  },

  // Stats row
  statsRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 22,
    marginTop: 18,
  },
  stat: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  statValue: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 20,
    letterSpacing: -0.4,
    color: AU.text,
    lineHeight: 20,
  },
  statLabel: {
    fontFamily: Fonts.medium,
    fontSize: 11.5,
    color: AU.textDim,
  },

  // Search
  searchWrap: { paddingTop: 20, paddingHorizontal: 22 },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: AU.stroke,
  },
  searchPlaceholder: {
    color: AU.textMute,
    fontFamily: Fonts.medium,
    fontSize: 13,
  },

  // Events header + tabs
  eventsHeader: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 20,
    letterSpacing: -0.4,
    color: AU.text,
  },
  tabsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 14,
    position: "relative",
    paddingBottom: 4,
  },
  tabLabel: {
    fontFamily: Fonts.bold,
    fontSize: 12,
    paddingBottom: 4,
  },
  tabLabelActive: { color: AU.text },
  tabLabelInactive: { color: AU.textMute },
  tabUnderlineWrap: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 2,
    overflow: "hidden",
  },
  tabUnderline: { ...StyleSheet.absoluteFillObject, borderRadius: 2 },

  // Event row
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(26,16,48,0.7)",
    borderWidth: 1,
    borderColor: AU.stroke,
    marginHorizontal: 22,
  },
  thumbWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: AU.strokeHi,
    backgroundColor: AU.surface,
  },
  thumbEmoji: {
    position: "absolute",
    right: -6,
    bottom: -10,
    fontSize: 38,
    opacity: 0.45,
    transform: [{ rotate: "-8deg" }],
    color: "#fff",
  },
  eventTitle: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 14.5,
    letterSpacing: -0.145,
    color: AU.text,
  },
  subRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  subText: {
    fontFamily: Fonts.medium,
    fontSize: 11.5,
    color: AU.textDim,
  },
  subDot: {
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: AU.textMute,
  },
  roleIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  roleDot: { width: 6, height: 6, borderRadius: 3 },
  roleDotCreated: {
    backgroundColor: AU.purple,
    shadowColor: AU.purple,
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  roleDotAttended: { backgroundColor: "rgba(255,255,255,0.35)" },
  roleLabel: {
    fontFamily: Fonts.bold,
    fontSize: 10.5,
    letterSpacing: 0.5,
  },

  // Guides section
  guidesSection: {
    paddingTop: 28,
  },
  guidesHeader: {
    paddingHorizontal: 22,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  manageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AU.strokeHi,
  },
  manageText: {
    color: AU.purpleSoft,
    fontFamily: Fonts.bold,
    fontSize: 12,
  },
  guidesEmpty: {
    marginHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: AU.stroke,
    borderStyle: "dashed",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  guidesEmptyText: {
    flex: 1,
    color: AU.textDim,
    fontFamily: Fonts.medium,
    fontSize: 13,
  },
  guideThumbIcon: {
    position: "absolute",
    right: 4,
    bottom: 4,
  },
  draftBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: "rgba(251,191,36,0.15)",
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.4)",
  },
  draftBadgeText: {
    color: "#fbbf24",
    fontFamily: Fonts.bold,
    fontSize: 9.5,
    letterSpacing: 0.5,
  },

  // Empty states
  empty: {
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 14,
  },
  emptyTitle: {
    fontFamily: "BricolageGrotesque_700Bold",
    fontSize: 14,
    color: AU.textDim,
  },
  ctaPrimaryWrap: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: AU.purple,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  ctaPrimaryText: {
    color: "#fff",
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 14,
  },
  ctaSecondary: {
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: AU.strokeHi,
  },
  ctaSecondaryText: {
    color: AU.text,
    fontFamily: Fonts.bold,
    fontSize: 13,
  },
});
