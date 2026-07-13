import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
  ViewStyle,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface FormInputProps extends TextInputProps {
  label?: string;
  required?: boolean;
  error?: string;
  containerStyle?: ViewStyle;
}

export default function FormInput({
  label,
  required = false,
  error,
  containerStyle,
  style,
  editable = true,
  multiline = false,
  secureTextEntry,
  ...textInputProps
}: FormInputProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [revealed, setRevealed] = useState(false);
  const isPassword = !!secureTextEntry;

  // Optimize password inputs for better performance
  const passwordProps = isPassword
    ? {
        textContentType: "password" as const,
        autoComplete: Platform.OS === "android" ? ("password" as const) : ("off" as const),
        importantForAutofill: "yes" as const,
      }
    : {};

  const renderInput = () => (
    <TextInput
      style={[
        styles.input,
        multiline && styles.textArea,
        !editable && styles.inputDisabled,
        error && styles.inputError,
        isPassword && styles.inputWithEye,
        style,
      ]}
      placeholderTextColor={colors.textMuted}
      editable={editable}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      secureTextEntry={isPassword && !revealed}
      {...passwordProps}
      {...textInputProps}
    />
  );

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      {isPassword ? (
        <View style={styles.passwordWrap}>
          {renderInput()}
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setRevealed((r) => !r)}
            activeOpacity={0.7}
            hitSlop={8}
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      ) : (
        renderInput()
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: c.textBody,
    marginBottom: 8,
  },
  required: {
    color: c.error,
  },
  input: {
    backgroundColor: c.card,
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: c.text,
    borderWidth: 1,
    borderColor: c.border,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  inputDisabled: {
    backgroundColor: "#2a2a3e",
    color: c.textSecondary,
  },
  inputError: {
    borderColor: c.error,
  },
  inputWithEye: {
    paddingRight: 48,
  },
  passwordWrap: {
    position: "relative",
    justifyContent: "center",
  },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  errorText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: c.error,
    marginTop: 4,
  },
});
