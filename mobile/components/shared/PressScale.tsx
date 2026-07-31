import React, { useRef } from "react";
import {
  Animated,
  Easing,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from "react-native";

export interface PressScaleProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** Depth of the press. CityVibe convention is 0.97. */
  scaleTo?: number;
  children: React.ReactNode;
}

/**
 * Tappable wrapper with the app's press feedback: a soft scale-down held while
 * the finger is on the target, easing back over ~200ms on release.
 */
export default function PressScale({
  style,
  scaleTo = 0.97,
  children,
  disabled,
  ...rest
}: PressScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (toValue: number, duration: number) =>
    Animated.timing(scale, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => !disabled && animate(scaleTo, 120)}
      onPressOut={() => !disabled && animate(1, 200)}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
