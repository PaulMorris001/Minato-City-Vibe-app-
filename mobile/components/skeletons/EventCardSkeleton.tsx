import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "../shared/Skeleton";

import { useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface Props {
  count?: number;
  horizontal?: boolean;
}

function EventCardItem({ horizontal }: { horizontal?: boolean }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.card, horizontal && styles.cardHorizontal]}>
      <Skeleton width="100%" height={horizontal ? 120 : 160} borderRadius={12} />
      <View style={styles.body}>
        <Skeleton width="80%" height={14} borderRadius={6} style={styles.row} />
        <Skeleton width="50%" height={12} borderRadius={6} style={styles.row} />
        <Skeleton width="35%" height={12} borderRadius={6} style={styles.row} />
      </View>
    </View>
  );
}

export default function EventCardSkeleton({ count = 4, horizontal = false }: Props) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={[styles.container, horizontal && styles.containerHorizontal]}>
      {Array.from({ length: count }).map((_, i) => (
        <EventCardItem key={i} horizontal={horizontal} />
      ))}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  containerHorizontal: {
    flexDirection: "row",
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: c.backgroundSecondary,
    borderRadius: 12,
    overflow: "hidden",
  },
  cardHorizontal: {
    width: 200,
    marginRight: 12,
  },
  body: {
    padding: 12,
    gap: 8,
  },
  row: {
    marginBottom: 2,
  },
});
