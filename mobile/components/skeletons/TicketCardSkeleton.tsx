import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "../shared/Skeleton";

interface Props {
  count?: number;
}

function TicketCardItem() {
  return (
    <View style={styles.card}>
      <Skeleton width="100%" height={140} borderRadius={0} />
      <View style={styles.body}>
        <Skeleton width="70%" height={14} borderRadius={6} style={styles.row} />
        <Skeleton width="45%" height={12} borderRadius={6} style={styles.row} />
        <View style={styles.codeBlock}>
          <Skeleton width="85%" height={20} borderRadius={6} />
        </View>
      </View>
    </View>
  );
}

export default function TicketCardSkeleton({ count = 3 }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <TicketCardItem key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    overflow: "hidden",
  },
  body: {
    padding: 14,
    gap: 8,
  },
  row: {
    marginBottom: 2,
  },
  codeBlock: {
    marginTop: 8,
    padding: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    alignItems: "center",
  },
});
