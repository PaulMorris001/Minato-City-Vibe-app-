import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import { pickMultipleImages } from "@/utils/imageUpload";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface MultiImagePickerProps {
  value: string[];
  onChange: (uris: string[]) => void;
  label?: string;
  max?: number;
  /** Thumbnail edge length */
  size?: number;
}

/**
 * Add/remove multiple images. Holds a list of URIs (local file:// or remote
 * https); the parent uploads the local ones at submit via resolveImageUrls.
 */
export default function MultiImagePicker({
  value,
  onChange,
  label = "Photos",
  max = 6,
  size = 96,
}: MultiImagePickerProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const remaining = max - value.length;

  const add = async () => {
    if (remaining <= 0) {
      Alert.alert("Limit reached", `You can add up to ${max} photos.`);
      return;
    }
    const picked = await pickMultipleImages();
    if (picked.length > 0) {
      onChange([...value, ...picked].slice(0, max));
    }
  };

  const remove = (uri: string) => {
    onChange(value.filter((u) => u !== uri));
  };

  return (
    <View style={styles.container}>
      {!!label && (
        <Text style={styles.label}>
          {label} {max ? <Text style={styles.count}>({value.length}/{max})</Text> : null}
        </Text>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {value.map((uri) => (
          <View key={uri} style={[styles.thumbWrap, { width: size, height: size }]}>
            <Image source={{ uri }} style={styles.thumb} />
            <TouchableOpacity style={styles.removeBtn} onPress={() => remove(uri)} hitSlop={8}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        {remaining > 0 && (
          <TouchableOpacity style={[styles.addTile, { width: size, height: size }]} onPress={add} activeOpacity={0.8}>
            <Ionicons name="camera-outline" size={26} color={colors.textSecondary} />
            <Text style={styles.addText}>Add</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: c.textBody,
    marginBottom: 10,
  },
  count: {
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    fontSize: 14,
  },
  row: {
    gap: 10,
    paddingRight: 8,
  },
  thumbWrap: {
    borderRadius: 12,
    overflow: "hidden",
    position: "relative",
  },
  thumb: {
    width: "100%",
    height: "100%",
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 999,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  addTile: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: c.border,
    borderStyle: "dashed",
    backgroundColor: c.card,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginTop: 4,
  },
});
