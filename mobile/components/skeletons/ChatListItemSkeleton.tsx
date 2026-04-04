import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "../shared/Skeleton";

interface Props {
  count?: number;
}

function ChatListItem() {
  return (
    <View style={styles.row}>
      <Skeleton width={50} height={50} borderRadius={25} />
      <View style={styles.textGroup}>
        <Skeleton width="50%" height={13} borderRadius={6} style={styles.line} />
        <Skeleton width="72%" height={11} borderRadius={6} />
      </View>
      <Skeleton width={38} height={11} borderRadius={6} />
    </View>
  );
}

export default function ChatListItemSkeleton({ count = 5 }: Props) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, i) => (
        <ChatListItem key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.05)",
  },
  textGroup: {
    flex: 1,
    gap: 7,
  },
  line: {
    marginBottom: 1,
  },
});
