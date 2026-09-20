import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated, Alert, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Fonts } from "@/constants/fonts";
import { useAccount } from "@/contexts/AccountContext";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

type AccountType = "client" | "vendor";

interface AccountSwitchToggleProps {
  /** Whether this user has a vendor account to switch to at all — settings.tsx
   *  and the profile modal each already have this from their own profile
   *  fetch, so it's a prop rather than a second fetch in here. */
  hasVendorAccount: boolean;
  /** Called after the account type is persisted, so the host can reset
   *  navigation into the matching root — that stays the caller's job since
   *  settings.tsx and the profile modal do it slightly differently. */
  onSwitched: (target: AccountType) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * A two-way "pill switcher" for Client/Vendor — replaces the plain
 * "Switch to Vendor/Client" row (settings.tsx) and the static account-type
 * badge (the profile modal in app/(tabs)/_layout.tsx) with one shared,
 * animated control: the active side is a gradient chip that springs into
 * place, the inactive side is a flat outline. Tapping the inactive side with
 * no vendor account yet explains that instead of switching.
 */
export default function AccountSwitchToggle({
  hasVendorAccount,
  onSwitched,
  style,
}: AccountSwitchToggleProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { activeAccount, switchAccount } = useAccount();

  const clientScale = useRef(new Animated.Value(activeAccount === "client" ? 1 : 0.94)).current;
  const vendorScale = useRef(new Animated.Value(activeAccount === "vendor" ? 1 : 0.94)).current;

  useEffect(() => {
    Animated.spring(clientScale, {
      toValue: activeAccount === "client" ? 1 : 0.94,
      useNativeDriver: true,
      speed: 16,
      bounciness: 10,
    }).start();
    Animated.spring(vendorScale, {
      toValue: activeAccount === "vendor" ? 1 : 0.94,
      useNativeDriver: true,
      speed: 16,
      bounciness: 10,
    }).start();
  }, [activeAccount, clientScale, vendorScale]);

  const handlePress = (target: AccountType) => {
    if (target === activeAccount) return;
    if (target === "vendor" && !hasVendorAccount) {
      Alert.alert(
        "No Vendor Account",
        "You don't have a vendor account yet. Register as a vendor to access vendor features."
      );
      return;
    }
    Alert.alert(
      target === "vendor" ? "Switch to Vendor account?" : "Switch to Client account?",
      target === "vendor"
        ? "You'll be taken to your vendor dashboard."
        : "You'll be taken to the client app.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            const resolved = await switchAccount(target);
            onSwitched(resolved);
          },
        },
      ]
    );
  };

  const renderSegment = (
    type: AccountType,
    label: string,
    activeIcon: keyof typeof Ionicons.glyphMap,
    inactiveIcon: keyof typeof Ionicons.glyphMap,
    scale: Animated.Value
  ) => {
    const isActive = activeAccount === type;
    const locked = type === "vendor" && !hasVendorAccount;
    return (
      <Animated.View style={[styles.segmentWrap, { transform: [{ scale }] }]}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => handlePress(type)}>
          {isActive ? (
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.segmentActive}
            >
              <Ionicons name={activeIcon} size={16} color="#fff" />
              <Text style={styles.segmentTextActive}>{label}</Text>
            </LinearGradient>
          ) : (
            <View style={styles.segmentInactive}>
              <Ionicons
                name={locked ? "lock-closed-outline" : inactiveIcon}
                size={16}
                color={colors.textSecondary}
              />
              <Text style={styles.segmentTextInactive}>{label}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={[styles.track, style]}>
      {renderSegment("client", "Client", "person", "person-outline", clientScale)}
      {renderSegment("vendor", "Vendor", "briefcase", "briefcase-outline", vendorScale)}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    track: {
      flexDirection: "row",
      backgroundColor: c.backgroundSecondary,
      borderRadius: 999,
      padding: 4,
      gap: 4,
    },
    segmentWrap: { flex: 1 },
    segmentActive: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 999,
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    segmentInactive: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 999,
    },
    segmentTextActive: { fontSize: 13, fontFamily: Fonts.semiBold, color: "#fff" },
    segmentTextInactive: { fontSize: 13, fontFamily: Fonts.semiBold, color: c.textSecondary },
  });
