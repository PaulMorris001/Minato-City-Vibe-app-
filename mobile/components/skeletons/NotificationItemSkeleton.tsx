import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "../shared/Skeleton";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface Props {
  count?: number;
}

function NotificationItem() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={styles.textGroup}>
        <Skeleton width="60%" height={13} borderRadius={6} style={styles.line} />
        <Skeleton width="85%" height={11} borderRadius={6} style={styles.line} />
        <Skeleton width="30%" height={10} borderRadius={5} />
      </View>
    </View>
  );
}

export default function NotificationItemSkeleton({ count = 6 }: Props) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <NotificationItem key={i} />
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.glassFillSubtle,
  },
  textGroup: {
    flex: 1,
    gap: 5,
  },
  line: {
    marginBottom: 1,
  },
});
