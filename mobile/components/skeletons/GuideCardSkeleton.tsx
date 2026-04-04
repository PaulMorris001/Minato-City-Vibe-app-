import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "../shared/Skeleton";

interface Props {
  count?: number;
}

function GuideCardItem() {
  return (
    <View style={styles.card}>
      <Skeleton width="100%" height={150} borderRadius={0} />
      <View style={styles.body}>
        <Skeleton width="75%" height={14} borderRadius={6} style={styles.row} />
        <Skeleton width="45%" height={12} borderRadius={6} style={styles.row} />
        <View style={styles.footer}>
          <Skeleton width={60} height={22} borderRadius={11} />
          <Skeleton width={50} height={12} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

export default function GuideCardSkeleton({ count = 4 }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <GuideCardItem key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    overflow: "hidden",
  },
  body: {
    padding: 12,
    gap: 8,
  },
  row: {
    marginBottom: 2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4,
  },
});
