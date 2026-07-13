import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";

import type { ThemeColors } from "@/constants/theme";
import { useThemedStyles } from "@/contexts/ThemeContext";
interface PickerItem {
  _id: string;
  [key: string]: any;
}

interface PickerModalProps<T extends PickerItem> {
  visible: boolean;
  onClose: () => void;
  title: string;
  data: T[];
  selectedId?: string;
  onSelect: (item: T) => void;
  renderItem: (item: T, isSelected: boolean) => React.ReactNode;
  keyExtractor?: (item: T) => string;
}

export default function PickerModal<T extends PickerItem>({
  visible,
  onClose,
  title,
  data,
  selectedId,
  onSelect,
  renderItem,
  keyExtractor = (item) => item._id,
}: PickerModalProps<T>) {
  const styles = useThemedStyles(createStyles);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={data}
            keyExtractor={keyExtractor}
            renderItem={({ item }) => {
              const isSelected = selectedId === item._id;
              return (
                <TouchableOpacity
                  style={[
                    styles.item,
                    isSelected && styles.itemSelected,
                  ]}
                  onPress={() => onSelect(item)}
                >
                  {renderItem(item, isSelected)}
                </TouchableOpacity>
              );
            }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
}

export const PickerItemText = ({
  text,
  isSelected,
  isSubtext = false
}: {
  text: string;
  isSelected: boolean;
  isSubtext?: boolean;
}) => {
  const styles = useThemedStyles(createStyles);
  return (
    <Text
      style={[
        isSubtext ? styles.itemSubtext : styles.itemText,
        isSelected && !isSubtext && styles.itemTextSelected,
      ]}
    >
      {text}
    </Text>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlayTouchable: {
    flex: 1,
    backgroundColor: c.modalOverlay,
  },
  content: {
    backgroundColor: c.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: 30,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  title: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: c.text,
  },
  item: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  itemSelected: {
    backgroundColor: c.primaryFaded,
  },
  itemText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: c.textBody,
  },
  itemTextSelected: {
    color: c.primary,
    fontFamily: Fonts.semiBold,
  },
  itemSubtext: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: c.textSecondary,
    marginTop: 4,
  },
});
