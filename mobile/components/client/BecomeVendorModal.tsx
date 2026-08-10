import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { Colors } from "@/constants/colors";
import { BASE_URL } from "@/constants/constants";
import { VendorType, LocationSelection } from "@/libs/interfaces";
import {
  BottomSheetModal,
  FormInput,
  PrimaryButton,
  ImagePickerButton,
  LocationPicker,
} from "@/components/shared";
import { uploadImage } from "@/utils/imageUpload";
import { resetToAccountRoot } from "@/utils/navigation";
import { useAccount } from "@/contexts/AccountContext";
import { fetchVendorTypes } from "@/libs/api";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface BecomeVendorModalProps {
  visible: boolean;
  onClose: () => void;
  /**
   * "sheet" (default) is the upgrade path: an existing client taps "Become a
   * Vendor" and fills this in over the client tabs.
   *
   * "screen" is the signup path — someone who chose a business account at
   * registration and has no client experience behind them yet. Same fields and
   * same submit, but presented as a full page with its own header, because
   * there is nothing underneath for a bottom sheet to sit on.
   */
  presentation?: "sheet" | "screen";
  /** "screen" only: skip setup for now. Omit to hide the escape hatch. */
  onSkip?: () => void;
}

export default function BecomeVendorModal({
  visible,
  onClose,
  presentation = "sheet",
  onSkip,
}: BecomeVendorModalProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { setActiveAccount } = useAccount();
  const [loading, setLoading] = useState(false);
  const [vendorTypes, setVendorTypes] = useState<VendorType[]>([]);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [businessPicture, setBusinessPicture] = useState("");
  const [location, setLocation] = useState<LocationSelection | null>(null);
  const [selectedVendorType, setSelectedVendorType] = useState<VendorType | null>(null);

  const [formData, setFormData] = useState({
    businessName: "",
    businessDescription: "",
    address: "",
    phone: "",
    website: "",
    instagram: "",
    twitter: "",
    tiktok: "",
    facebook: "",
  });

  useEffect(() => {
    if (visible) {
      loadVendorTypes();
    }
  }, [visible]);

  const isScreen = presentation === "screen";

  const loadVendorTypes = async () => {
    try {
      const t = await fetchVendorTypes();
      if (Array.isArray(t) && t.length > 0) setVendorTypes(t);
    } catch {
      // Fall back to static constants silently
    }
  };
  const handleSubmit = async () => {
    if (!formData.businessName.trim()) {
      Alert.alert("Error", "Please enter your business name");
      return;
    }
    if (!selectedVendorType) {
      Alert.alert("Error", "Please select a vendor type");
      return;
    }
    if (!location?.city || !location?.state) {
      Alert.alert("Error", "Please select your country, state, and city");
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("token");

      let businessPictureUrl = businessPicture;
      if (businessPicture && businessPicture.startsWith("file://")) {
        try {
          const result = await uploadImage(businessPicture, "businesses", token!);
          businessPictureUrl = result.url;
        } catch (uploadError) {
          console.error("Business picture upload error:", uploadError);
          Alert.alert("Upload Error", "Failed to upload business picture");
          setLoading(false);
          return;
        }
      }

      await axios.post(
        `${BASE_URL}/become-vendor`,
        {
          businessName: formData.businessName.trim(),
          businessDescription: formData.businessDescription.trim(),
          businessPicture: businessPictureUrl,
          // String fields for vendor dashboard display
          vendorType: selectedVendorType.name,
          // ObjectId fields for vendor discovery
          vendorTypeId: selectedVendorType._id,
          location: {
            city: location.city,
            state: location.state,
            country: location.country,
            address: formData.address.trim(),
          },
          contactInfo: {
            phone: formData.phone.trim(),
            website: formData.website.trim(),
            instagram: formData.instagram.trim(),
            twitter: formData.twitter.trim(),
            tiktok: formData.tiktok.trim(),
            facebook: formData.facebook.trim(),
          },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Keep the cached user in step with the server. Cold-start routing reads
      // these two fields off SecureStore, so a stale copy would send a
      // finished vendor straight back into this form on the next launch.
      try {
        const raw = await SecureStore.getItemAsync("user");
        if (raw) {
          const u = JSON.parse(raw);
          await SecureStore.setItemAsync(
            "user",
            JSON.stringify({ ...u, isVendor: true, vendorSignupPending: false })
          );
        }
      } catch {
        // Non-fatal: /profile is authoritative and refetched on entry.
      }

      Alert.alert(
        "Success!",
        "Welcome to OurCityvibe vendors! You can now manage your business.",
        [
          {
            text: "Go to Dashboard",
            onPress: async () => {
              onClose();
              await setActiveAccount("vendor");
              // Reset into the vendor root so the back button can't return to
              // the client tabs we just left.
              setTimeout(() => {
                resetToAccountRoot("vendor");
              }, 100);
            },
          },
        ]
      );
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.message || "Failed to register as vendor";
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const selectVendorType = (type: VendorType) => {
    setSelectedVendorType(type);
    setShowTypeDropdown(false);
  };

  const formBody = (
    <>
      <View style={styles.intro}>
        <Ionicons name="briefcase" size={48} color={Colors.primary} />
        <Text style={styles.introTitle}>
          {isScreen ? "Set up your business" : "Start Your Business"}
        </Text>
        <Text style={styles.introText}>
          {isScreen
            ? "These details are what people see when they find you on OurCityvibe. You can change any of them later."
            : "Fill in your business details to join OurCityvibe as a vendor"}
        </Text>
      </View>

      <ImagePickerButton
        imageUri={businessPicture}
        onImageSelected={setBusinessPicture}
        label="Business Photo"
        size={160}
        shape="square"
      />

      <FormInput
        label="Business Name"
        required
        value={formData.businessName}
        onChangeText={(text) =>
          setFormData({ ...formData, businessName: text })
        }
        placeholder="Enter your business name"
      />

      {/* Vendor Type Dropdown */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Business Type <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity
          style={styles.picker}
          onPress={() => setShowTypeDropdown(!showTypeDropdown)}
        >
          <Text
            style={[
              styles.pickerText,
              !selectedVendorType && styles.pickerPlaceholder,
            ]}
          >
            {selectedVendorType?.name || "Select vendor type"}
          </Text>
          <Ionicons
            name={showTypeDropdown ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
        {showTypeDropdown && (
          <View style={styles.dropdown}>
            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {vendorTypes.map((type) => (
                <TouchableOpacity
                  key={type._id}
                  style={[
                    styles.dropdownItem,
                    selectedVendorType?._id === type._id &&
                      styles.dropdownItemSelected,
                  ]}
                  onPress={() => selectVendorType(type)}
                >
                  <Ionicons
                    name={type.icon as any}
                    size={24}
                    color={
                      selectedVendorType?._id === type._id
                        ? Colors.primary
                        : colors.textSecondary
                    }
                    style={styles.dropdownItemIcon}
                  />
                  <Text
                    style={[
                      styles.dropdownItemText,
                      selectedVendorType?._id === type._id &&
                        styles.dropdownItemTextSelected,
                    ]}
                  >
                    {type.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <FormInput
        label="Description"
        value={formData.businessDescription}
        onChangeText={(text) =>
          setFormData({ ...formData, businessDescription: text })
        }
        placeholder="Describe your business..."
        multiline
        containerStyle={styles.textAreaContainer}
      />

      {/* Location (Country → State → City) */}
      <View style={styles.field}>
        <LocationPicker value={location ?? undefined} onChange={setLocation} label="City" required />
      </View>

      <FormInput
        label="Address"
        value={formData.address}
        onChangeText={(text) => setFormData({ ...formData, address: text })}
        placeholder="Enter full address"
      />

      <FormInput
        label="Phone"
        value={formData.phone}
        onChangeText={(text) => setFormData({ ...formData, phone: text })}
        placeholder="Enter phone number"
        keyboardType="phone-pad"
      />

      <FormInput
        label="Website"
        value={formData.website}
        onChangeText={(text) => setFormData({ ...formData, website: text })}
        placeholder="Enter website URL"
        autoCapitalize="none"
        keyboardType="url"
      />

      <FormInput
        label="Instagram"
        value={formData.instagram}
        onChangeText={(text) => setFormData({ ...formData, instagram: text })}
        placeholder="@username or link"
        autoCapitalize="none"
      />

      <FormInput
        label="TikTok"
        value={formData.tiktok}
        onChangeText={(text) => setFormData({ ...formData, tiktok: text })}
        placeholder="@username or link"
        autoCapitalize="none"
      />

      <FormInput
        label="X (Twitter)"
        value={formData.twitter}
        onChangeText={(text) => setFormData({ ...formData, twitter: text })}
        placeholder="@username or link"
        autoCapitalize="none"
      />

      <FormInput
        label="Facebook"
        value={formData.facebook}
        onChangeText={(text) => setFormData({ ...formData, facebook: text })}
        placeholder="Page name or link"
        autoCapitalize="none"
      />

      <PrimaryButton onPress={handleSubmit} loading={loading}>
        {isScreen ? "Create vendor account" : "Become a Vendor"}
      </PrimaryButton>

      {isScreen && onSkip && (
        <TouchableOpacity onPress={onSkip} style={styles.skipButton} activeOpacity={0.7}>
          <Text style={styles.skipText}>I&apos;ll do this later</Text>
        </TouchableOpacity>
      )}

      <View style={styles.bottomPadding} />
    </>
  );

  // Signup path: nothing sits behind this, so it owns the whole screen.
  if (isScreen) {
    if (!visible) return null;
    return (
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.screenScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {formBody}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Become a Vendor"
      maxHeight="90%"
    >
      {formBody}
    </BottomSheetModal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: c.background,
  },
  screenScroll: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  skipButton: {
    alignItems: "center",
    paddingVertical: 16,
  },
  skipText: {
    fontSize: 14,
    fontWeight: "600",
    color: c.textSecondary,
  },
  intro: {
    alignItems: "center",
    marginBottom: 32,
    paddingVertical: 20,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: c.text,
    marginTop: 16,
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    color: c.textSecondary,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: c.textBody,
    marginBottom: 8,
  },
  required: {
    color: c.error,
  },
  picker: {
    backgroundColor: c.card,
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: c.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerText: {
    fontSize: 16,
    color: c.text,
  },
  pickerPlaceholder: {
    color: c.textMuted,
  },
  dropdown: {
    marginTop: 8,
    backgroundColor: c.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.border,
    maxHeight: 200,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    flexDirection: "row",
    alignItems: "center",
  },
  dropdownItemSelected: {
    backgroundColor: c.primaryFaded,
  },
  dropdownItemIcon: {
    marginRight: 12,
  },
  dropdownItemText: {
    fontSize: 16,
    color: c.textBody,
  },
  dropdownItemTextSelected: {
    color: Colors.primary,
    fontWeight: "600",
  },
  dropdownItemSubtext: {
    fontSize: 13,
    color: c.textSecondary,
    marginTop: 2,
  },
  textAreaContainer: {
    marginBottom: 20,
  },
  bottomPadding: {
    height: 40,
  },
});
