import React from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  Platform,
} from "react-native";
import { Fonts } from "@/constants/fonts";

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
  // Optimize password inputs for better performance
  const passwordProps = secureTextEntry
    ? {
        textContentType: "password" as const,
        autoComplete: Platform.OS === "android" ? "password" : "off",
        importantForAutofill: "yes" as const,
      }
    : {};

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={styles.required}> *</Text>}
        </Text>
      )}
      <TextInput
        style={[
          styles.input,
          multiline && styles.textArea,
          !editable && styles.inputDisabled,
          error && styles.inputError,
          style,
        ]}
        placeholderTextColor="#6b7280"
        editable={editable}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        secureTextEntry={secureTextEntry}
        {...passwordProps}
        {...textInputProps}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontFamily: Fonts.semiBold,
    color: "#e5e7eb",
    marginBottom: 8,
  },
  required: {
    color: "#ef4444",
  },
  input: {
    backgroundColor: "#1f1f2e",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#fff",
    borderWidth: 1,
    borderColor: "#374151",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  inputDisabled: {
    backgroundColor: "#2a2a3e",
    color: "#9ca3af",
  },
  inputError: {
    borderColor: "#ef4444",
  },
  errorText: {
    fontSize: 12,
    fontFamily: Fonts.regular,
    color: "#ef4444",
    marginTop: 4,
  },
});
