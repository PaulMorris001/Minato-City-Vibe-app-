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
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
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

export default function TabsLayout() {
  const { activeAccount } = useAccount();
  const { totalUnread, notifUnread } = useUnread();
  const isGlassAvailable = Platform.OS === "ios" && isLiquidGlassAvailable();
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
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

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
          color={isGlassAvailable ? "#fff" : "#9ca3af"}
        />
      </TouchableOpacity>

      <View style={styles.profileHeader}>
        <Avatar uri={user.profilePicture} name={user.username} size={80} />
        <Text style={[styles.usernameText, isGlassAvailable && styles.glassText]}>
          {capitalize(user.username)}
        </Text>
        <Text style={[styles.emailText, isGlassAvailable && styles.glassTextSecondary]}>
          {user.email}
        </Text>
        <LinearGradient
          colors={["#3b82f6", "#1d4ed8"]}
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

      <View style={[styles.divider, isGlassAvailable && styles.glassDivider]} />

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => {
          setIsProfileModalVisible(false);
          router.push("/messages" as any);
        }}
      >
        <View style={styles.menuIconContainer}>
          <Ionicons name="chatbubbles-outline" size={20} color="#a855f7" />
        </View>
        <Text style={[styles.menuItemText, isGlassAvailable && styles.glassText]}>
          Messages
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isGlassAvailable ? "#fff" : "#4b5563"}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => {
          setIsProfileModalVisible(false);
          router.push("/(tabs)/events");
        }}
      >
        <View style={styles.menuIconContainer}>
          <Ionicons name="calendar-outline" size={20} color="#a855f7" />
        </View>
        <Text style={[styles.menuItemText, isGlassAvailable && styles.glassText]}>
          My Events
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isGlassAvailable ? "#fff" : "#4b5563"}
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
          <Ionicons name="heart-outline" size={20} color="#a855f7" />
        </View>
        <Text style={[styles.menuItemText, isGlassAvailable && styles.glassText]}>
          Favorites
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isGlassAvailable ? "#fff" : "#4b5563"}
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
        <Text style={[styles.menuItemText, isGlassAvailable && styles.glassText]}>
          Settings
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isGlassAvailable ? "#fff" : "#4b5563"}
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
          <Ionicons name="help-circle-outline" size={20} color="#a855f7" />
        </View>
        <Text style={[styles.menuItemText, isGlassAvailable && styles.glassText]}>
          Help & Support
        </Text>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isGlassAvailable ? "#fff" : "#4b5563"}
        />
      </TouchableOpacity>

      <View style={[styles.divider, isGlassAvailable && styles.glassDivider]} />

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
      {currentTab === "home" && (
        <View style={styles.navbar}>
          <Text style={styles.logoText}>CityVibe</Text>
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
              onPress={() => router.push("/notifications" as any)}
              style={styles.ticketButton}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={["#374151", "#1f2937"]}
                style={styles.ticketGradient}
              >
                <Ionicons name="notifications-outline" size={20} color="#fff" />
                {notifUnread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {notifUnread > 99 ? "99+" : notifUnread}
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/messages" as any)}
              style={styles.ticketButton}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={["#374151", "#1f2937"]}
                style={styles.ticketGradient}
              >
                <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
                {totalUnread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {totalUnread > 99 ? "99+" : totalUnread}
                    </Text>
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/passes" as any)}
              style={styles.ticketButton}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={["#a855f7", "#7c3aed"]}
                style={styles.ticketGradient}
              >
                <Ionicons name="qr-code" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleProfilePress}
              style={styles.profileButton}
              activeOpacity={0.7}
            >
              <Avatar uri={user.profilePicture} name={user.username} size={36} />
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
        <View style={styles.modalOverlay}>
          {isGlassAvailable ? (
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

      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#a855f7",
          tabBarInactiveTintColor: "#6b7280",
          tabBarStyle: {
            backgroundColor: Platform.OS === "ios" ? "rgba(31, 31, 46, 0.95)" : "#1f1f2e",
            paddingBottom: Platform.OS === "ios" ? Math.max(insets.bottom, 24) : insets.bottom + 8,
            paddingTop: 8,
            borderTopWidth: 0.5,
            borderTopColor: "rgba(168, 85, 247, 0.2)",
            height: Platform.OS === "ios" ? 90 : 60 + insets.bottom + 8,
            shadowColor: "#000",
            shadowOffset: {
              width: 0,
              height: -2,
            },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: Fonts.semiBold,
          },
          tabBarBackground: () =>
            isGlassAvailable ? (
              <BlurView
                intensity={80}
                tint="dark"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "transparent",
                  borderTopWidth: 0.5,
                  borderTopColor: "rgba(168, 85, 247, 0.3)",
                }}
              />
            ) : null,
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
            tabBarIcon: ({ focused, color }) => (
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={20}
                color={color}
              />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  navbar: {
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight! + 10 : 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: "#0f0f1a",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f2e",
  },
  logoText: {
    fontFamily: Fonts.black,
    fontSize: 24,
    color: "#a855f7",
    textShadowColor: "rgba(168, 85, 247, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
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
    backgroundColor: "#a855f7",
  },
  loginPillText: {
    color: "#fff",
    fontFamily: Fonts.bold,
    fontSize: 13.5,
  },
  ticketButton: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#a855f7",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  ticketGradient: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
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
  glassText: {
    color: "#fff",
  },
  glassTextSecondary: {
    color: "rgba(255, 255, 255, 0.7)",
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
  accountTypeSubtext: {
    fontSize: 11,
    fontFamily: Fonts.regular,
    color: "rgba(255, 255, 255, 0.7)",
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
  unreadBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EC4899",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: "#1f2937",
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontFamily: Fonts.bold,
    lineHeight: 11,
  },
});
