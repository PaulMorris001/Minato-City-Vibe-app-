import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * The verified check that sits beside a name.
 *
 * `verified` on the user model is the ID-verification flag set from the
 * verification queue — not email confirmation and not vendor status, both of
 * which have their own signals.
 *
 * Rendering nothing for an unverified user is deliberate: callers can write
 * `<VerifiedBadge verified={user.verified} />` inline without wrapping it in a
 * conditional, and no space is reserved for a badge that isn't there.
 */
export default function VerifiedBadge({
  verified,
  size = 14,
}: {
  verified?: boolean;
  size?: number;
}) {
  const { colors } = useTheme();
  if (!verified) return null;

  return (
    <Ionicons
      name="checkmark-circle"
      size={size}
      color={colors.primary}
      // Announced as part of the name it follows, rather than as its own
      // focusable element in the row.
      accessibilityLabel="Verified account"
    />
  );
}
