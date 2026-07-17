import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  StatusBar,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Tabs, useRouter, useSegments } from "expo-router";
import { NativeTabs, Icon, Label } from "expo-router/unstable-native-tabs";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import * as SecureStore from "expo-secure-store";
import { unregisterForPushNotifications } from "@/utils/pushNotifications";
import axios, { AxiosError } from "axios";
import { capitalize } from "@/libs/helpers";
import { remoteLog } from "@/utils/remoteLog";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { useAccount } from "@/contexts/AccountContext";
import { useUnread } from "@/contexts/UnreadContext";
import socketService from "@/services/socket.service";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/shared/Avatar";
import { getCircularAvatarUrl } from "@/utils/imageUpload";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
// Circular navbar action surface. On iOS 26 this is real Liquid Glass;
// everywhere else it keeps the original gradient fill.
function PillSurface({
  glass,
  tintColor,
  gradientColors,
  children,
}: {
  glass: boolean;
  tintColor?: string;
  gradientColors: [string, string];
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(createStyles);
  if (glass) {
    return (
      <GlassView style={styles.pillGlass} tintColor={tintColor} isInteractive>
        {children}
      </GlassView>
    );
  }
  return (
    <LinearGradient colors={gradientColors} style={styles.pillGradient}>
      {children}
    </LinearGradient>
  );
}

export default function TabsLayout() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { activeAccount } = useAccount();
  const { totalUnread, notifUnread } = useUnread();
  const isGlassAvailable = Platform.OS === "ios" && isLiquidGlassAvailable();
  const isIpad = Platform.OS === "ios" && Platform.isPad;
  // The profile modal sits on a translucent surface on any iOS (real glass on
  // 26+, blur below), so the brighter text palette applies to both. Android
  // keeps the solid card.
  const isTranslucentModal = Platform.OS === "ios";
  const segments = useSegments();
  const currentTab = segments[1]; // Gets the current tab name (home, vendors, bests, etc.)
  const insets = useSafeAreaInsets();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

  const [user, setUser] = useState<{
    id: string;
    username: string;
    email: string;
    profilePicture?: string;
    isVendor?: boolean;
  }>({
    id: "",
    username: "",
    email: "",
    profilePicture: "",
    isVendor: false,
  });
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const router = useRouter();

  // Check auth on mount. Guests are allowed in (full guest browsing) — we just
  // flag them so the profile button routes to login instead of opening the
  // account modal.
  useEffect(() => {
    const checkAuth = async () => {
      const token = await SecureStore.getItemAsync("token");
      setIsGuest(!token);
      setIsCheckingAuth(false);
      // The root layout only connects the socket on cold start; after a fresh
      // login there was no token yet, so (re)connect now that we have one.
      if (token) {
        socketService.connect();
      }
    };
    checkAuth();
  }, []);

  const fetchUserProfile = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      if (token) {
        const res = await axios.get(`${BASE_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const userData = res.data.user;
        setUser({
          id: userData._id,
          username: userData.username,
          email: userData.email,
          profilePicture: userData.profilePicture || "",
          isVendor: userData.isVendor || false,
        });
      } else {
        // Guest — nothing to fetch, leave the empty user state in place.
        return;
      }
    } catch (error) {
      const status = (error as AxiosError)?.response?.status;
      // Only a genuine auth failure (the token was rejected) should end the
      // session. Network blips, timeouts and 5xx must NOT delete the token —
      // doing so bounces the user to /login, where they re-auth, hit the same
      // transient error, and loop. Keep the session and fall back to the
      // cached user instead.
      if (status === 401 || status === 403) {
        await SecureStore.deleteItemAsync("token");
        socketService.disconnect();
        router.replace("/login");
        return;
      }

      remoteLog("warn", "profile.fetch.failed", {
        status,
        message: (error as Error)?.message,
      });

      try {
        const cached = await SecureStore.getItemAsync("user");
        if (cached) {
          const u = JSON.parse(cached);
          setUser({
            id: u.id || u._id || "",
            username: u.username || "",
            email: u.email || "",
            profilePicture: u.profilePicture || "",
            isVendor: u.isVendor || false,
          });
        }
      } catch (e) {
        console.error("Failed to hydrate cached user:", e);
      }
    }
  };

  useEffect(() => {
    if (!isCheckingAuth) {
      fetchUserProfile();
    }
  }, [isCheckingAuth]);

  // Check if we should redirect to vendor dashboard only on mount and account changes
  useEffect(() => {
    if (!isCheckingAuth && user.id) {
      if (activeAccount === "vendor" && user.isVendor) {
        router.replace("/(vendor)/dashboard");
      }
    }
  }, [activeAccount, user.isVendor, user.id, router, isCheckingAuth]);

  // Show loading while checking auth
  if (isCheckingAuth) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Circular bitmap for the iOS native profile tab icon (27pt @3x = 81px);
  // null when the host can't bake a circle, which falls back to the SF symbol.
  const tabAvatarUrl = user.profilePicture
    ? getCircularAvatarUrl(user.profilePicture, 81)
    : null;

  const handleProfilePress = () => {
    if (isGuest) {
      router.push("/login");
      return;
    }
    setIsProfileModalVisible(true);
  };

  const handleLogout = async () => {
    try {
      await unregisterForPushNotifications();
      await SecureStore.deleteItemAsync("user");
      await SecureStore.deleteItemAsync("token");
      await SecureStore.deleteItemAsync("activeAccount");
      socketService.disconnect();
      router.replace("/login");
      setIsProfileModalVisible(false);
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const renderModalContent = () => (
    <>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => setIsProfileModalVisible(false)}
      >
        <Ionicons
          name="close"
          size={24}
          color={isTranslucentModal ? colors.text : colors.textSecondary}
        />
      </TouchableOpacity>

      <View style={styles.profileHeader}>
        <Avatar uri={user.profilePicture} name={user.username} size={80} />
        <Text style={[styles.usernameText, isTranslucentModal && styles.glassText]}>
          {capitalize(user.username)}
        </Text>
        <Text style={[styles.emailText, isTranslucentModal && styles.glassTextSecondary]}>
          {user.email}
        </Text>
        <LinearGradient
          colors={[colors.info, "#1d4ed8"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accountTypeBadge}
        >
          <Ionicons name="person" size={14} color="#fff" />
          <Text style={styles.accountTypeText}>
            Client Account
            {user.isVendor && (
              <Text style={styles.accountTypeSubtext}> • Has Vendor</Text>
            )}
          </Text>
        </LinearGradient>
      </View>

      <View style={[styles.divider, isTranslucentModal && styles.glassDivider]} />

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => {
          setIsProfileModalVisible(false);
          router.push("/notifications" as any);
        }}
      >
        <View style={styles.menuIconContainer}>
          <Ionicons name="notifications-outline" size={20} color={colors.primary} />
        </View>
        <Text style={[styles.menuItemText, isTranslucentModal && styles.glassText]}>
          Notifications
        </Text>
        {notifUnread > 0 && (
          <View style={styles.menuBadge}>
            <Text style={styles.menuBadgeText}>
              {notifUnread > 99 ? "99+" : notifUnread}
            </Text>
          </View>
        )}
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? colors.text : colors.borderMuted}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => {
          setIsProfileModalVisible(false);
          router.push("/passes" as any);
        }}
      >
        <View style={styles.menuIconContainer}>
          <Ionicons name="qr-code-outline" size={20} color={colors.primary} />
        </View>
        <Text style={[styles.menuItemText, isTranslucentModal && styles.glassText]}>
          My Passes
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? colors.text : colors.borderMuted}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => {
          setIsProfileModalVisible(false);
          router.push("/favorites" as any);
        }}
      >
        <View style={styles.menuIconContainer}>
          <Ionicons name="heart-outline" size={20} color={colors.primary} />
        </View>
        <Text style={[styles.menuItemText, isTranslucentModal && styles.glassText]}>
          Favorites
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? colors.text : colors.borderMuted}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => {
          setIsProfileModalVisible(false);
          router.push("/settings");
        }}
      >
        <View style={styles.menuIconContainer}>
          <Ionicons name="settings-outline" size={20} color={colors.primary} />
        </View>
        <Text style={[styles.menuItemText, isTranslucentModal && styles.glassText]}>
          Settings
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? colors.text : colors.borderMuted}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => {
          setIsProfileModalVisible(false);
          Alert.alert(
            "Help & Support",
            "Need help? Reach us at:\n\nSupport@nvibez.com",
            [{ text: "Got it" }]
          );
        }}
      >
        <View style={styles.menuIconContainer}>
          <Ionicons name="help-circle-outline" size={20} color={colors.primary} />
        </View>
        <Text style={[styles.menuItemText, isTranslucentModal && styles.glassText]}>
          Help & Support
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? colors.text : colors.borderMuted}
        />
      </TouchableOpacity>

      <View style={[styles.divider, isTranslucentModal && styles.glassDivider]} />

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Ionicons name="log-out-outline" size={20} color={colors.error} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      {currentTab === "home" && (
        // On iPad the native tab bar renders as a capsule centered at the TOP
        // of the screen, in this same row. The navbar goes transparent there —
        // logo left, actions right, capsule in the middle — and box-none lets
        // touches in the middle reach the native bar underneath.
        <View
          pointerEvents={isIpad ? "box-none" : "auto"}
          style={[
            styles.navbar,
            Platform.OS === "ios" && styles.navbarOverlay,
            isIpad && [styles.navbarIpad, { paddingTop: insets.top + 10 }],
          ]}
        >
          <Text style={styles.logoText}>OurCityvibe</Text>
          <View style={styles.navbarActions}>
            {isGuest ? (
              <TouchableOpacity
                onPress={() => router.push("/login")}
                style={styles.loginPill}
                activeOpacity={0.85}
              >
                <Ionicons name="log-in-outline" size={16} color="#fff" />
                <Text style={styles.loginPillText}>Log in</Text>
              </TouchableOpacity>
            ) : (
              <>
            <TouchableOpacity
              onPress={() => router.push("/messages" as any)}
              style={styles.chatButton}
              activeOpacity={0.7}
            >
              <PillSurface
                glass={isGlassAvailable}
                tintColor={colors.primary}
                gradientColors={[colors.primary, colors.primaryDark]}
              >
                <Ionicons name="chatbubbles" size={20} color="#fff" />
              </PillSurface>
              {totalUnread > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {totalUnread > 99 ? "99+" : totalUnread}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleProfilePress}
              style={styles.profileButton}
              activeOpacity={0.7}
            >
              <Avatar uri={user.profilePicture} name={user.username} size={36} />
              {notifUnread > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {notifUnread > 99 ? "99+" : notifUnread}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      <Modal
        visible={isProfileModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsProfileModalVisible(false)}
      >
        <View
          style={[
            styles.modalOverlay,
            !isDark && { backgroundColor: "rgba(17, 12, 26, 0.25)" },
          ]}
        >
          {isGlassAvailable ? (
            <GlassView
              tintColor={isDark ? undefined : "rgba(255, 255, 255, 0.72)"}
              style={[styles.modalContent, styles.glassModalContent]}
            >
              {renderModalContent()}
            </GlassView>
          ) : Platform.OS === "ios" ? (
            <BlurView
              intensity={80}
              tint={isDark ? "dark" : "light"}
              style={[styles.modalContent, styles.glassModalContent]}
            >
              {renderModalContent()}
            </BlurView>
          ) : (
            <View style={styles.modalContent}>{renderModalContent()}</View>
          )}
        </View>
      </Modal>

      {Platform.OS === "ios" ? (
        // Real UITabBarController tab bar. The bar is deliberately left
        // unstyled — no background, height or border — so iOS 26 renders the
        // floating Liquid Glass capsule (older iOS gets the standard system
        // bar). Route names match the old <Tabs.Screen> entries exactly.
        <NativeTabs tintColor={colors.primary} minimizeBehavior="onScrollDown">
          <NativeTabs.Trigger name="home">
            <Label>Home</Label>
            <Icon sf={{ default: "house", selected: "house.fill" }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="vendors">
            <Label>Vendors</Label>
            <Icon sf={{ default: "safari", selected: "safari.fill" }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="bests">
            <Label>Best Of Lists</Label>
            <Icon sf={{ default: "trophy", selected: "trophy.fill" }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="events">
            <Label>Events</Label>
            <Icon sf="calendar" />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger
            name="profile"
            // With a profile picture, the icon is a circular render of the
            // photo (UIKit won't mask tab images, so the circle is baked into
            // the bitmap by the image host), passed through our expo-router
            // patch (`original: true`) so UIKit shows it untinted instead of
            // as a template silhouette. 27pt @3x. When the host can't bake a
            // circle, tabAvatarUrl is null and the SF symbol renders instead.
            options={
              tabAvatarUrl
                ? ({
                    icon: {
                      src: { uri: tabAvatarUrl, width: 27, height: 27, scale: 3 },
                      original: true,
                    },
                  } as any)
                : undefined
            }
          >
            <Label>Profile</Label>
            {!tabAvatarUrl && (
              <Icon sf={{ default: "person", selected: "person.fill" }} />
            )}
          </NativeTabs.Trigger>
        </NativeTabs>
      ) : (
        // Android keeps the existing JS tab bar (dark surface, purple tint) so
        // nothing regresses there.
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarStyle: {
              backgroundColor: colors.card,
              paddingBottom: insets.bottom + 8,
              paddingTop: 8,
              borderTopWidth: 0.5,
              borderTopColor: "rgba(168, 85, 247, 0.2)",
              height: 60 + insets.bottom + 8,
              elevation: 5,
            },
            tabBarLabelStyle: {
              fontSize: 11,
              fontFamily: Fonts.semiBold,
            },
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: "Home",
              tabBarIcon: ({ focused, color }) => (
                <Ionicons
                  name={focused ? "home" : "home-outline"}
                  size={20}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="vendors"
            options={{
              title: "Vendors",
              tabBarIcon: ({ focused, color }) => (
                <Ionicons
                  name={focused ? "compass" : "compass-outline"}
                  size={20}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="bests"
            options={{
              title: "Best Of Lists",
              tabBarIcon: ({ focused, color }) => (
                <Ionicons
                  name={focused ? "trophy" : "trophy-outline"}
                  size={20}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="events"
            options={{
              title: "Events",
              tabBarIcon: ({ focused, color }) => (
                <Ionicons
                  name={focused ? "calendar" : "calendar-outline"}
                  size={20}
                  color={color}
                />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: "Profile",
              tabBarIcon: ({ focused, color }) =>
                user.profilePicture ? (
                  <Image
                    source={{ uri: user.profilePicture }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: focused ? 1.5 : 0,
                      borderColor: color,
                    }}
                    contentFit="cover"
                  />
                ) : (
                  <Ionicons
                    name={focused ? "person" : "person-outline"}
                    size={20}
                    color={color}
                  />
                ),
            }}
          />
        </Tabs>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.backgroundDeep,
  },
  navbar: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight! + 10 : 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: c.backgroundDeep,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: c.card,
  },
  // Matches the vendor navbar logo (app/(vendor)/_layout.tsx) — no glow.
  logoText: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 22,
    color: c.primaryLight,
    letterSpacing: -0.6,
  },
  // iPad: the native tab bar capsule is centered in this same top row, so the
  // navbar keeps only its left/right content and lets the capsule show
  // through. paddingTop is set inline (insets.top + 10) to vertically center
  // the 40pt action row on the 40pt capsule.
  navbarIpad: {
    backgroundColor: "transparent",
    borderBottomWidth: 0,
  },
  // iOS only: the navbar must float over the native tab host instead of
  // sitting above it in the flex column — if the host is pushed down by a
  // sibling, iOS 26 refuses to render the floating Liquid Glass tab bar.
  // Home compensates with matching top padding on its scroll content.
  navbarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  navbarActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  loginPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    height: 38,
    borderRadius: 19,
    backgroundColor: c.primary,
  },
  loginPillText: {
    color: c.white,
    fontFamily: Fonts.bold,
    fontSize: 13.5,
  },
  chatButton: {
    // No overflow clipping — the pill surfaces round themselves so the
    // unread badge can hang over the top-right edge (same as profileButton).
    borderRadius: 20,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  pillGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  // Same footprint as pillGradient; the radius lives on the glass view so
  // the material itself is circular, not just clipped by the wrapper.
  pillGlass: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  profileButton: {
    // No overflow clipping here — the Avatar rounds itself, and the unread
    // badge hangs over the top-right edge.
    borderRadius: 20,
    shadowColor: c.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  profileGradient: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: c.modalOverlay,
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    backgroundColor: c.card,
    borderRadius: 24,
    padding: 24,
    position: "relative",
    borderWidth: 1,
    borderColor: c.border,
  },
  glassModalContent: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: c.glassStroke,
    overflow: "hidden",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 16,
    padding: 4,
    zIndex: 10,
  },
  profileHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 16,
  },
  usernameText: {
    fontSize: 24,
    fontFamily: Fonts.bold,
    color: c.text,
    marginBottom: 4,
  },
  emailText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginBottom: 12,
  },
  glassText: {
    color: c.text,
  },
  glassTextSecondary: {
    color: c.textDim,
  },
  accountTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  accountTypeText: {
    fontSize: 13,
    fontFamily: Fonts.semiBold,
    color: c.text,
  },
  accountTypeSubtext: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: c.textDim,
  },
  divider: {
    height: 1,
    backgroundColor: c.border,
    marginVertical: 16,
  },
  glassDivider: {
    backgroundColor: c.glassStroke,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: c.primaryFaded,
    justifyContent: "center",
    alignItems: "center",
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: c.textBody,
    fontFamily: Fonts.medium,
  },
  menuBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.accentPink,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 5,
  },
  menuBadgeText: {
    color: c.white,
    fontSize: 10,
    fontFamily: Fonts.bold,
    lineHeight: 12,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  logoutText: {
    color: c.error,
    fontSize: 16,
    fontFamily: Fonts.semiBold,
  },
  unreadBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: c.accentPink,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: c.cardAlt,
  },
  unreadBadgeText: {
    color: c.white,
    fontSize: 9,
    fontFamily: Fonts.bold,
    lineHeight: 11,
  },
});
