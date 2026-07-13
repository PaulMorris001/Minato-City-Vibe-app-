import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { Avatar } from "./Avatar";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface ImagePickerButtonProps {
  imageUri?: string;
  onImageSelected: (uri: string) => void;
  label?: string;
  size?: number;
  shape?: "circle" | "square";
  showLabel?: boolean;
  disabled?: boolean;
  allowsEditing?: boolean;
  aspect?: [number, number];
  /**
   * When set (and `shape` is "circle"), the empty state renders a deterministic
   * initials avatar derived from this name instead of the camera placeholder.
   * Used for the Profile Picture row in Settings so a user without a photo
   * still sees their own avatar.
   */
  fallbackName?: string;
}

export default function ImagePickerButton({
  imageUri,
  onImageSelected,
  label = "Add Photo",
  size = 120,
  shape = "circle",
  showLabel = true,
  disabled = false,
  allowsEditing = false,
  aspect,
  fallbackName,
}: ImagePickerButtonProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const pickImage = async () => {
    if (disabled) return;

    // PHPickerViewController (iOS 14+) handles permissions itself — no pre-request needed.
    // Calling requestMediaLibraryPermissionsAsync() from inside a Modal crashes the iOS simulator
    // because it tries to present a native alert from a transparent modal context.
    const aspectRatio = aspect || (shape === "circle" ? [1, 1] : [16, 9]);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing,
      aspect: aspectRatio as [number, number],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      onImageSelected(result.assets[0].uri);
    }
  };

  return (
    <View style={styles.container}>
      {showLabel && label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity
        style={[
          styles.imageContainer,
          shape === "circle" ? styles.circle : styles.square,
          { width: size, height: size },
          disabled && styles.disabled,
        ]}
        onPress={pickImage}
        activeOpacity={disabled ? 1 : 0.8}
        disabled={disabled}
      >
        {imageUri ? (
          <>
            <Image
              source={{ uri: imageUri }}
              style={[
                styles.image,
                shape === "circle" ? styles.circle : styles.square,
              ]}
            />
            <View style={styles.editOverlay}>
              <Ionicons name="camera" size={24} color="#fff" />
            </View>
          </>
        ) : fallbackName && shape === "circle" ? (
          <>
            <Avatar name={fallbackName} size={size} />
            <View style={styles.editOverlay}>
              <Ionicons name="camera" size={24} color="#fff" />
            </View>
          </>
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="camera-outline" size={32} color={colors.textSecondary} />
            <Text style={styles.placeholderText}>Add Photo</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 16,
  },
  label: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: c.textBody,
    marginBottom: 12,
  },
  imageContainer: {
    backgroundColor: c.card,
    borderWidth: 2,
    borderColor: c.border,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    position: "relative",
  },
  circle: {
    borderRadius: 9999,
  },
  square: {
    borderRadius: 12,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  editOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginTop: 8,
  },
  disabled: {
    opacity: 0.5,
  },
});
