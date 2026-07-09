import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Dimensions,
  StatusBar,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import ZoomableImage from "./ZoomableImage";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

interface ImageViewerModalProps {
  visible: boolean;
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * Full-screen, swipeable image viewer. Paged horizontally; pinch or
 * double-tap to zoom; tap once (or the X) to dismiss. Shows a
 * "current / total" indicator.
 */
export default function ImageViewerModal({
  visible,
  images,
  initialIndex = 0,
  onClose,
}: ImageViewerModalProps) {
  const [index, setIndex] = useState(initialIndex);
  // Paging is disabled while an image is zoomed so panning the zoomed image
  // doesn't fight the horizontal pager.
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const listRef = useRef<FlatList>(null);

  const onScroll = (e: any) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i !== index) setIndex(i);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar hidden />
      <View style={styles.container}>
        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          scrollEnabled={scrollEnabled}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, i) => `${item}-${i}`}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
          onMomentumScrollEnd={onScroll}
          renderItem={({ item }) => (
            <View style={styles.page}>
              <ZoomableImage
                uri={item}
                onSingleTap={onClose}
                onZoomChange={(zoomed) => setScrollEnabled(!zoomed)}
              />
            </View>
          )}
        />

        <TouchableOpacity style={styles.closeButton} onPress={onClose} hitSlop={12}>
          <Ionicons name="close" size={26} color="#fff" />
        </TouchableOpacity>

        {images.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>{index + 1} / {images.length}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.96)",
  },
  page: {
    width: SCREEN_W,
    height: SCREEN_H,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_W,
    height: SCREEN_H * 0.85,
  },
  closeButton: {
    position: "absolute",
    top: 56,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    position: "absolute",
    bottom: 50,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  counterText: {
    color: "#fff",
    fontFamily: Fonts.semiBold,
    fontSize: 14,
  },
});
