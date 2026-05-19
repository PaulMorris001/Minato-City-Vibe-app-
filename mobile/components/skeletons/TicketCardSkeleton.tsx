import React from "react";
import { View, StyleSheet } from "react-native";
import Skeleton from "../shared/Skeleton";

interface Props {
  count?: number;
}

const TK_BG = "#0B0613";
const TK_SURFACE = "rgba(26,16,48,0.7)";
const TK_STROKE = "rgba(255,255,255,0.08)";

function TicketCardItem() {
  return (
    <View style={styles.card}>
      {/* Poster region */}
      <View style={styles.poster}>
        <Skeleton width="100%" height={132} borderRadius={0} />
      </View>

      {/* Perforation */}
      <View style={styles.perforation}>
        <View style={[styles.notch, { left: -8 }]} />
        <View style={[styles.notch, { right: -8 }]} />
      </View>

      {/* Stub */}
      <View style={styles.stub}>
        <Skeleton width={60} height={60} borderRadius={10} />
        <View style={styles.stubRight}>
          <Skeleton width={80} height={9} borderRadius={4} />
          <View style={{ height: 6 }} />
          <Skeleton width={120} height={16} borderRadius={6} />
          <View style={{ height: 10 }} />
          <View style={styles.stubFooter}>
            <Skeleton width={100} height={12} borderRadius={6} />
            <Skeleton width={50} height={10} borderRadius={6} />
          </View>
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
  },
  card: {
    backgroundColor: TK_SURFACE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TK_STROKE,
    overflow: "hidden",
  },
  poster: {
    height: 132,
    overflow: "hidden",
  },
  perforation: {
    position: "relative",
    height: 16,
  },
  notch: {
    position: "absolute",
    top: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: TK_BG,
  },
  stub: {
    paddingTop: 4,
    paddingBottom: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stubRight: {
    flex: 1,
  },
  stubFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
