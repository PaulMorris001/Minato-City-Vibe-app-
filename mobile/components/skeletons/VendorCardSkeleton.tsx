import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "../shared/Skeleton";

interface Props {
  count?: number;
}

function VendorCardItem() {
  return (
    <View style={styles.card}>
      <Skeleton width={80} height={80} borderRadius={12} />
      <View style={styles.body}>
        <Skeleton width="65%" height={14} borderRadius={6} style={styles.row} />
        <Skeleton width="45%" height={12} borderRadius={6} style={styles.row} />
        <Skeleton width="55%" height={11} borderRadius={6} />
      </View>
    </View>
  );
}

export default function VendorCardSkeleton({ count = 4 }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <VendorCardItem key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 12,
    gap: 12,
    alignItems: "center",
  },
  body: {
    flex: 1,
    gap: 7,
  },
  row: {
    marginBottom: 1,
  },
});
