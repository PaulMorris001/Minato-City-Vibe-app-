import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  ScrollView,
} from "react-native";
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

interface BecomeVendorModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function BecomeVendorModal({
  visible,
  onClose,
}: BecomeVendorModalProps) {
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

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title="Become a Vendor"
      maxHeight="90%"
    >
      <View style={styles.intro}>
        <Ionicons name="briefcase" size={48} color={Colors.primary} />
        <Text style={styles.introTitle}>Start Your Business</Text>
        <Text style={styles.introText}>
          Fill in your business details to join OurCityvibe as a vendor
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
            color="#9ca3af"
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
                        : "#9ca3af"
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
        Become a Vendor
      </PrimaryButton>

      <View style={styles.bottomPadding} />
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  intro: {
    alignItems: "center",
    marginBottom: 32,
    paddingVertical: 20,
  },
  introTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginTop: 16,
    marginBottom: 8,
  },
  introText: {
    fontSize: 14,
    color: "#9ca3af",
    textAlign: "center",
    paddingHorizontal: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e5e7eb",
    marginBottom: 8,
  },
  required: {
    color: "#ef4444",
  },
  picker: {
    backgroundColor: "#1f1f2e",
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: "#374151",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pickerText: {
    fontSize: 16,
    color: "#fff",
  },
  pickerPlaceholder: {
    color: "#6b7280",
  },
  dropdown: {
    marginTop: 8,
    backgroundColor: "#1f1f2e",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#374151",
    maxHeight: 200,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
    flexDirection: "row",
    alignItems: "center",
  },
  dropdownItemSelected: {
    backgroundColor: "rgba(168, 85, 247, 0.1)",
  },
  dropdownItemIcon: {
    marginRight: 12,
  },
  dropdownItemText: {
    fontSize: 16,
    color: "#e5e7eb",
  },
  dropdownItemTextSelected: {
    color: Colors.primary,
    fontWeight: "600",
  },
  dropdownItemSubtext: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  textAreaContainer: {
    marginBottom: 20,
  },
  bottomPadding: {
    height: 40,
  },
});
