import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "../shared/Skeleton";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface Props {
  count?: number;
  showButton?: boolean;
}

function UserListItem({ showButton }: { showButton: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.row}>
      <Skeleton width={48} height={48} borderRadius={24} />
      <View style={styles.textGroup}>
        <Skeleton width="55%" height={13} borderRadius={6} style={styles.line} />
        <Skeleton width="38%" height={11} borderRadius={6} />
      </View>
      {showButton && <Skeleton width={72} height={32} borderRadius={8} />}
    </View>
  );
}

export default function UserListItemSkeleton({ count = 6, showButton = true }: Props) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <UserListItem key={i} showButton={showButton} />
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.glassFillSubtle,
  },
  textGroup: {
    flex: 1,
    gap: 6,
  },
  line: {
    marginBottom: 2,
  },
});
