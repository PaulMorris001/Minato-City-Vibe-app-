import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "../shared/Skeleton";

interface Props {
  count?: number;
}

function ChatListSkeletonRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={48} height={48} borderRadius={24} />
      <View style={styles.textGroup}>
        <Skeleton width={120} height={14} borderRadius={6} />
        <View style={{ height: 6 }} />
        <Skeleton width={180} height={11} borderRadius={6} />
      </View>
      <View style={styles.right}>
        <Skeleton width={32} height={10} borderRadius={6} />
        <View style={{ height: 8 }} />
        <Skeleton width={20} height={20} borderRadius={10} />
      </View>
    </View>
  );
}

export default function ChatListItemSkeleton({ count = 6 }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <ChatListSkeletonRow key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 12,
  },
  textGroup: {
    flex: 1,
  },
  right: {
    alignItems: "flex-end",
  },
});
