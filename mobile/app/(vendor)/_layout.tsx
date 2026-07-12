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

export const unstable_settings = {
  initialRouteName: "dashboard",
};

export default function VendorLayout() {
  const { setActiveAccount } = useAccount();
  const isGlassAvailable = Platform.OS === "ios" && isLiquidGlassAvailable();
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
          color={isTranslucentModal ? "#fff" : "#9ca3af"}
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
            colors={["#a855f7", "#7c3aed"]}
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
          <Ionicons name="grid-outline" size={20} color="#a855f7" />
        </View>
        <Text style={styles.menuItemText}>Dashboard</Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? "#fff" : "#4b5563"}
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
          <Ionicons name="settings-outline" size={20} color="#a855f7" />
        </View>
        <Text style={styles.menuItemText}>Settings</Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? "#fff" : "#4b5563"}
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
            color="#a855f7"
          />
        </View>
        <Text style={styles.menuItemText}>Help & Support</Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isTranslucentModal ? "#fff" : "#4b5563"}
        />
      </TouchableOpacity>

      <View style={[styles.divider, isTranslucentModal && styles.glassDivider]} />

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
        activeOpacity={0.8}
      >
        <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      {/* On iOS the navbar floats over the native tab host: a flex sibling
          would shrink the host and iOS 26 then refuses to render the floating
          Liquid Glass tab bar. Each tab screen pads its top to compensate
          (see VENDOR_NAVBAR_HEIGHT). */}
      <View style={[styles.navbar, Platform.OS === "ios" && styles.navbarOverlay]}>
        <View style={styles.navLeft}>
          <Text style={styles.logoText}>OurCityvibe</Text>
          <View style={styles.badge}>
            <Ionicons name="briefcase" size={11} color="#C084FC" />
            <Text style={styles.badgeText}>VENDOR</Text>
          </View>
        </View>
        <View style={styles.navRight}>
          <TouchableOpacity
            style={styles.iconButton}
            activeOpacity={0.7}
            onPress={() => router.push("/notifications" as any)}
          >
            <Ionicons name="notifications-outline" size={17} color="#F4EEFF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleProfilePress}
            style={styles.profileButton}
            activeOpacity={0.7}
          >
            {user.profilePicture ? (
              <Image source={{ uri: user.profilePicture }} style={styles.profileImage} />
            ) : (
              <LinearGradient colors={["#a855f7", "#7c3aed"]} style={styles.profileGradient}>
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
              tint="dark"
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
          tintColor="#A855F7"
          badgeBackgroundColor="#EC4899"
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
            tabBarActiveTintColor: "#A855F7",
            tabBarInactiveTintColor: "rgba(244,238,255,0.38)",
            tabBarStyle: {
              backgroundColor: "#0B0613",
              paddingBottom: insets.bottom + 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.08)",
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
              tabBarBadgeStyle: { backgroundColor: "#EC4899", color: "#fff", fontSize: 10 },
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B0613",
  },
  navbar: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight! + 10 : 50,
    paddingBottom: 14,
    paddingHorizontal: 18,
    backgroundColor: "#0B0613",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
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
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontFamily: "BricolageGrotesque_800ExtraBold",
    fontSize: 22,
    color: "#C084FC",
    letterSpacing: -0.6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(168,85,247,0.16)",
    borderWidth: 1,
    borderColor: "rgba(192,132,252,0.35)",
  },
  badgeText: {
    color: "#C084FC",
    fontSize: 10.5,
    fontFamily: Fonts.bold,
    letterSpacing: 0.8,
  },
  profileButton: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#a855f7",
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
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    backgroundColor: "#1f1f2e",
    borderRadius: 24,
    padding: 24,
    position: "relative",
    borderWidth: 1,
    borderColor: "#374151",
  },
  glassModalContent: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "rgba(255, 255, 255, 0.1)",
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
    color: "#fff",
    marginBottom: 4,
  },
  emailText: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: "#9ca3af",
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
    color: "#fff",
  },
  divider: {
    height: 1,
    backgroundColor: "#374151",
    marginVertical: 16,
  },
  glassDivider: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
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
    backgroundColor: "rgba(168, 85, 247, 0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    color: "#e5e7eb",
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
    color: "#ef4444",
    fontSize: 16,
    fontFamily: Fonts.semiBold,
  },
});
