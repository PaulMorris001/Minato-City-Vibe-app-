import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Platform,
  StatusBar,
  Image,
} from "react-native";
import { Tabs, useRouter, useFocusEffect } from "expo-router";
import { NativeTabs, Icon, Label, Badge } from "expo-router/unstable-native-tabs";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as SecureStore from "expo-secure-store";
import { unregisterForPushNotifications } from "@/utils/pushNotifications";
import axios from "axios";
import { capitalize } from "@/libs/helpers";
import { Fonts } from "@/constants/fonts";
import { BASE_URL } from "@/constants/constants";
import { useAccount } from "@/contexts/AccountContext";
import socketService from "@/services/socket.service";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
export const unstable_settings = {
  initialRouteName: "dashboard",
};

export default function VendorLayout() {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { setActiveAccount } = useAccount();
  const isGlassAvailable = Platform.OS === "ios" && isLiquidGlassAvailable();
  const isIpad = Platform.OS === "ios" && Platform.isPad;
  // The profile modal sits on a translucent surface on any iOS (real glass on
  // 26+, blur below), so the brighter chrome applies to both. Android keeps
  // the solid card.
  const isTranslucentModal = Platform.OS === "ios";
  const insets = useSafeAreaInsets();
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
  const [pendingBookingsCount, setPendingBookingsCount] = useState(0);
  const router = useRouter();

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

        // If user is not a vendor, redirect to client tabs
        if (!userData.isVendor) {
          setActiveAccount("client");
          router.replace("/(tabs)/home" as any);
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  // Pending-bookings count for the Bookings tab badge (moved here from the
  // old single-screen dashboard so the native tab bar can render it).
  const fetchPendingCount = async () => {
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/bookings/vendor?status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPendingBookingsCount(Array.isArray(data) ? data.length : 0);
      }
    } catch {}
  };

  // Entry into the vendor layout always happens *after* the caller has already
  // set the active account to "vendor" (login role picker, become-vendor,
  // settings switch, or the tabs launch-restore redirect). So we no longer set
  // it here — doing so was a side effect that raced with switching away.
  useEffect(() => {
    fetchUserProfile();
    fetchPendingCount();
    // Post-login entry point for vendor accounts — the root layout only
    // connects the socket on cold start, before a fresh login has a token.
    socketService.connect();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      fetchUserProfile();
      fetchPendingCount();
    }, [])
  );

  // NOTE: the old "redirect to /(tabs)/home when activeAccount === client"
  // effect was removed. Switching to client now does a full navigation reset
  // (see settings.tsx → resetToAccount), which unmounts this layout entirely.
  // Keeping a reactive redirect here caused the lingering vendor layout to
  // re-fire router.replace and break the client tab navigator.

  const handleProfilePress = () => {
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

  const pendingBadgeLabel =
    pendingBookingsCount > 99 ? "99+" : String(pendingBookingsCount);

  const renderModalContent = () => (
    <>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={() => setIsProfileModalVisible(false)}
      >
        <Ionicons
          name="close"
          size={24}
          color={isTranslucentModal ? "#fff" : colors.textSecondary}
        />
      </TouchableOpacity>

      <View style={styles.profileHeader}>
        {user.profilePicture ? (
          <Image
            source={{ uri: user.profilePicture }}
            style={styles.avatarImage}
          />
        ) : (
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.avatarGradient}
          >
            <Ionicons name="person" size={40} color="#fff" />
          </LinearGradient>
        )}
        <Text style={styles.usernameText}>
          {capitalize(user.username)}
        </Text>
        <Text style={styles.emailText}>{user.email}</Text>
        <LinearGradient
          colors={["#22c55e", "#16a34a"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.accountTypeBadge}
        >
          <Ionicons name="briefcase" size={14} color="#fff" />
          <Text style={styles.accountTypeText}>Vendor Account</Text>
        </LinearGradient>
      </View>

      <View style={[styles.divider, isTranslucentModal && styles.glassDivider]} />

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => {
          setIsProfileModalVisible(false);
          // Navigate to dashboard
        }}
      >
        <View style={styles.menuIconContainer}>
          <Ionicons name="grid-outline" size={20} color={colors.primary} />
        </View>
        <Text style={styles.menuItemText}>Dashboard</Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? "#fff" : colors.borderMuted}
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
        <Text style={styles.menuItemText}>Settings</Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? "#fff" : colors.borderMuted}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() =>
          Alert.alert("Help & Support", "Need help? Reach us at:\n\nSupport@nvibez.com", [{ text: "Got it" }])
        }
      >
        <View style={styles.menuIconContainer}>
          <Ionicons
            name="help-circle-outline"
            size={20}
            color={colors.primary}
          />
        </View>
        <Text style={styles.menuItemText}>Help & Support</Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? "#fff" : colors.borderMuted}
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
      {/* On iOS the navbar floats over the native tab host: a flex sibling
          would shrink the host and iOS 26 then refuses to render the floating
          Liquid Glass tab bar. Each tab screen pads its top to compensate
          (see VENDOR_NAVBAR_HEIGHT). */}
      {/* On iPad the native tab bar renders as a capsule centered at the TOP
          of the screen, in this same row. The navbar goes transparent there —
          logo left, actions right, capsule in the middle — and box-none lets
          touches in the middle reach the native bar underneath. */}
      <View
        pointerEvents={isIpad ? "box-none" : "auto"}
        style={[
          styles.navbar,
          Platform.OS === "ios" && styles.navbarOverlay,
          isIpad && [styles.navbarIpad, { paddingTop: insets.top + 10 }],
        ]}
      >
        <View style={styles.navLeft}>
          <Text style={styles.logoText}>OurCityvibe</Text>
          <View style={styles.badge}>
            <Ionicons name="briefcase" size={11} color={colors.primaryLight} />
            <Text style={styles.badgeText}>VENDOR</Text>
          </View>
        </View>
        <View style={styles.navRight}>
          <TouchableOpacity
            style={styles.iconButton}
            activeOpacity={0.7}
            onPress={() => router.push("/notifications" as any)}
          >
            <Ionicons name="notifications-outline" size={17} color={colors.textBright} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleProfilePress}
            style={styles.profileButton}
            activeOpacity={0.7}
          >
            {user.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.profileImage} />
            ) : (
              <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.profileGradient}>
                <Ionicons name="person" size={18} color="#fff" />
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={isProfileModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsProfileModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          {isGlassAvailable ? (
            <GlassView style={[styles.modalContent, styles.glassModalContent]}>
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
        // Real UITabBarController tab bar — left unstyled so iOS 26 renders
        // the floating Liquid Glass capsule (older iOS gets the standard
        // system bar).
        <NativeTabs
          tintColor={colors.primary}
          badgeBackgroundColor={colors.accentPink}
          minimizeBehavior="onScrollDown"
        >
          <NativeTabs.Trigger name="dashboard">
            <Label>Dashboard</Label>
            <Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="services">
            <Label>Services</Label>
            <Icon sf={{ default: "briefcase", selected: "briefcase.fill" }} />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="bookings">
            <Label>Bookings</Label>
            <Icon sf="calendar" />
            {pendingBookingsCount > 0 && <Badge>{pendingBadgeLabel}</Badge>}
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="chats">
            <Label>Chats</Label>
            <Icon
              sf={{
                default: "bubble.left.and.bubble.right",
                selected: "bubble.left.and.bubble.right.fill",
              }}
            />
          </NativeTabs.Trigger>
          <NativeTabs.Trigger name="account">
            <Label>Account</Label>
            <Icon sf={{ default: "person", selected: "person.fill" }} />
          </NativeTabs.Trigger>
        </NativeTabs>
      ) : (
        // Android keeps a JS tab bar styled like the old custom vendor bar.
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.textFaint,
            tabBarStyle: {
              backgroundColor: colors.backgroundDeep,
              paddingBottom: insets.bottom + 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: colors.glassFill,
              height: 60 + insets.bottom + 8,
              elevation: 5,
            },
            tabBarLabelStyle: {
              fontSize: 10.5,
              fontFamily: Fonts.medium,
            },
          }}
        >
          <Tabs.Screen
            name="dashboard"
            options={{
              title: "Dashboard",
              tabBarIcon: ({ focused, color }) => (
                <Ionicons name={focused ? "grid" : "grid-outline"} size={20} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="services"
            options={{
              title: "Services",
              tabBarIcon: ({ focused, color }) => (
                <Ionicons name={focused ? "briefcase" : "briefcase-outline"} size={20} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="bookings"
            options={{
              title: "Bookings",
              tabBarBadge: pendingBookingsCount > 0 ? pendingBadgeLabel : undefined,
              tabBarBadgeStyle: { backgroundColor: colors.accentPink, color: "#fff", fontSize: 10 },
              tabBarIcon: ({ focused, color }) => (
                <Ionicons name={focused ? "calendar" : "calendar-outline"} size={20} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="chats"
            options={{
              title: "Chats",
              tabBarIcon: ({ focused, color }) => (
                <Ionicons name={focused ? "chatbubbles" : "chatbubbles-outline"} size={20} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="account"
            options={{
              title: "Account",
              tabBarIcon: ({ focused, color }) => (
                <Ionicons name={focused ? "person" : "person-outline"} size={20} color={color} />
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
    paddingBottom: 14,
    paddingHorizontal: 18,
    backgroundColor: c.backgroundDeep,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: c.glassFill,
  },
  // iPad: the native tab bar capsule is centered in this same top row, so the
  // navbar keeps only its left/right content and lets the capsule show
  // through. paddingTop is set inline (insets.top + 10) to vertically center
  // the 40pt action row on the 40pt capsule.
  navbarIpad: {
    backgroundColor: "transparent",
    borderBottomWidth: 0,
  },
  // iOS only: keep the navbar out of the flex column so the native tab host
  // stays full-screen (required for the Liquid Glass bar to render).
  navbarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  navLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.glassFillSubtle,
    borderWidth: 1,
    borderColor: c.glassFill,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 22,
    color: c.primaryLight,
    letterSpacing: -0.6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: c.primaryFadedStrong,
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.35)",
  },
  badgeText: {
    color: c.primaryLight,
    fontSize: 10.5,
    fontFamily: Fonts.bold,
    letterSpacing: 0.8,
  },
  profileButton: {
    borderRadius: 20,
    overflow: "hidden",
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
});
