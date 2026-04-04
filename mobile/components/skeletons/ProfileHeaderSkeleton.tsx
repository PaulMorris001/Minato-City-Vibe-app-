import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "../shared/Skeleton";
import EventCardSkeleton from "./EventCardSkeleton";

interface Props {
  eventCount?: number;
}

export default function ProfileHeaderSkeleton({ eventCount = 3 }: Props) {
  return (
    <View style={styles.container}>
      {/* Avatar + name */}
      <View style={styles.header}>
        <Skeleton width={90} height={90} borderRadius={45} style={styles.avatar} />
        <Skeleton width={130} height={15} borderRadius={7} style={styles.nameLine} />
        <Skeleton width={90} height={12} borderRadius={6} style={styles.subLine} />
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={styles.statBlock}>
            <Skeleton width={36} height={16} borderRadius={6} style={styles.statNum} />
            <Skeleton width={50} height={11} borderRadius={5} />
          </View>
        ))}
      </View>

      {/* Event cards below */}
      <EventCardSkeleton count={eventCount} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 20,
  },
  avatar: {
    marginBottom: 14,
  },
  nameLine: {
    marginBottom: 8,
  },
  subLine: {},
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 16,
    marginHorizontal: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 16,
  },
  statBlock: {
    alignItems: "center",
    gap: 6,
  },
  statNum: {
    marginBottom: 2,
  },
});
