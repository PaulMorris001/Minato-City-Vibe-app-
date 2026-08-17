import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  View,
  type NativeSyntheticEvent,
  type TextLayoutEventData,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface CollapsibleDescriptionProps {
  text: string;
  /** The caller's body-text style, so the clamp matches the screen it's on. */
  textStyle?: TextStyle | TextStyle[];
  maxLines?: number;
  onReadMore: () => void;
}

const DEFAULT_MAX_LINES = 6;

/**
 * Body text clamped to a few lines, with a "Read more" link when — and only
 * when — there is more to read.
 *
 * Whether the text overflows is measured by a hidden copy rendered at full
 * height alongside the clamped one. Reading `onTextLayout` off the clamped Text
 * doesn't work: once `numberOfLines` applies, it reports the truncated count,
 * so the answer is always "exactly maxLines". The alternative — render
 * unclamped for one frame, then collapse — flashes the whole description on
 * screen before snapping shut.
 */
export default function CollapsibleDescription({
  text,
  textStyle,
  maxLines = DEFAULT_MAX_LINES,
  onReadMore,
}: CollapsibleDescriptionProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [overflows, setOverflows] = useState(false);

  const handleProbeLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    const lines = e.nativeEvent.lines.length;
    setOverflows((prev) => (prev === lines > maxLines ? prev : lines > maxLines));
  };

  return (
    <View>
      <Text
        style={[textStyle, styles.probe]}
        onTextLayout={handleProbeLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {text}
      </Text>

      <Text style={textStyle} numberOfLines={overflows ? maxLines : undefined}>
        {text}
      </Text>

      {overflows && (
        <TouchableOpacity
          style={styles.readMoreRow}
          onPress={onReadMore}
          activeOpacity={0.7}
        >
          <Text style={styles.readMoreText}>Read more</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.primaryLight} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    // Laid out at the parent's full width so the line count it measures is the
    // one the visible Text will get, but painted nowhere and untouchable.
    probe: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      opacity: 0,
      zIndex: -1,
    },
    readMoreRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      marginTop: 8,
      alignSelf: "flex-start",
    },
    readMoreText: {
      fontFamily: Fonts.semiBold,
      fontSize: 13.5,
      color: c.primaryLight,
    },
  });
