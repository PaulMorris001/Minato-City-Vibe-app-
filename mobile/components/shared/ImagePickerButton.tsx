import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";

interface ImagePickerButtonProps {
  imageUri?: string;
  onImageSelected: (uri: string) => void;
  label?: string;
  size?: number;
  shape?: "circle" | "square";
  showLabel?: boolean;
  disabled?: boolean;
}

export default function ImagePickerButton({
  imageUri,
  onImageSelected,
  label = "Add Photo",
  size = 120,
  shape = "circle",
  showLabel = true,
  disabled = false,
}: ImagePickerButtonProps) {
  const pickImage = async () => {
    if (disabled) return;

    // Request permission
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert("Permission Required", "Please allow access to your photos to upload an image.");
      return;
    }

    // Launch image picker
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: shape === "circle" ? [1, 1] : [16, 9],
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
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="camera-outline" size={32} color="#9ca3af" />
            <Text style={styles.placeholderText}>Add Photo</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginVertical: 16,
  },
  label: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#e5e7eb",
    marginBottom: 12,
  },
  imageContainer: {
    backgroundColor: "#1f1f2e",
    borderWidth: 2,
    borderColor: "#374151",
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
    color: "#9ca3af",
    marginTop: 8,
  },
  disabled: {
    opacity: 0.5,
  },
});
