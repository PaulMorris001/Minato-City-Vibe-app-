import React, { useEffect } from "react";
import { Dimensions, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

interface ZoomableImageProps {
  uri: string;
  /** Single tap on the image (e.g. close the viewer). */
  onSingleTap?: () => void;
  /** Fired when the image crosses between zoomed and unzoomed — lets a parent
   * pager disable horizontal scrolling while panning a zoomed image. */
  onZoomChange?: (zoomed: boolean) => void;
}

/**
 * Full-screen image with pinch-to-zoom, drag-to-pan while zoomed, and
 * double-tap to zoom in/out. Zoom resets whenever the uri changes.
 */
export default function ZoomableImage({ uri, onSingleTap, onZoomChange }: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    // New image — start unzoomed.
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    onZoomChange?.(false);
  }, [uri]);

  const notifyZoom = (zoomed: boolean) => {
    onZoomChange?.(zoomed);
  };

  // Keep the visible area inside the image while zoomed: at scale s the image
  // overflows by (s-1) * dimension, so the center may shift by half of that.
  const clampTranslation = (value: number, dimension: number, s: number) => {
    "worklet";
    const maxOffset = (dimension * (s - 1)) / 2;
    return Math.min(maxOffset, Math.max(-maxOffset, value));
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(0.8, savedScale.value * e.scale));
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        scale.value = withTiming(MIN_SCALE);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        translateX.value = clampTranslation(translateX.value, SCREEN_W, scale.value);
        translateY.value = clampTranslation(translateY.value, SCREEN_H, scale.value);
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
      savedScale.value = Math.max(MIN_SCALE, scale.value);
      runOnJS(notifyZoom)(scale.value > 1.02);
    });

  const pan = Gesture.Pan()
    // Only claim the touch while zoomed — otherwise a swipe over the image
    // must stay with the surrounding pager/scroll view. An always-active pan
    // would win the gesture race and block page swiping even when unzoomed.
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (savedScale.value > 1) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onUpdate((e) => {
      if (savedScale.value <= 1) return;
      translateX.value = clampTranslation(
        savedTranslateX.value + e.translationX,
        SCREEN_W,
        savedScale.value
      );
      translateY.value = clampTranslation(
        savedTranslateY.value + e.translationY,
        SCREEN_H,
        savedScale.value
      );
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      const zoomIn = savedScale.value <= 1;
      scale.value = withTiming(zoomIn ? DOUBLE_TAP_SCALE : 1);
      savedScale.value = zoomIn ? DOUBLE_TAP_SCALE : 1;
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      runOnJS(notifyZoom)(zoomIn);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (onSingleTap) runOnJS(onSingleTap)();
    });

  const composed = Gesture.Simultaneous(
    Gesture.Simultaneous(pinch, pan),
    // Single tap must wait for (and lose to) a potential double tap.
    Gesture.Exclusive(doubleTap, singleTap)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.fill, animatedStyle]}>
        <Image source={{ uri }} style={styles.fill} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: {
    width: "100%",
    height: "100%",
  },
});
