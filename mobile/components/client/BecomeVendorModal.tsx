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
import { BASE_URL, CITIES, VENDOR_TYPES } from "@/constants/constants";
import { City, VendorType } from "@/libs/interfaces";
import { useRouter } from "expo-router";
import {
  BottomSheetModal,
  FormInput,
  PrimaryButton,
  ImagePickerButton,
} from "@/components/shared";
import { uploadImage } from "@/utils/imageUpload";
import { useAccount } from "@/contexts/AccountContext";
import { fetchCities, fetchVendorTypes } from "@/libs/api";

interface BecomeVendorModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function BecomeVendorModal({
  visible,
  onClose,
}: BecomeVendorModalProps) {
  const router = useRouter();
  const { setActiveAccount } = useAccount();
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState<City[]>(CITIES);
  const [vendorTypes, setVendorTypes] = useState<VendorType[]>(VENDOR_TYPES);
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [businessPicture, setBusinessPicture] = useState("");
  const [selectedCity, setSelectedCity] = useState<City | null>(null);
  const [selectedVendorType, setSelectedVendorType] = useState<VendorType | null>(null);

  const [formData, setFormData] = useState({
    businessName: "",
    businessDescription: "",
    address: "",
    phone: "",
    website: "",
  });

  useEffect(() => {
    if (visible) {
      loadCitiesAndTypes();
    }
  }, [visible]);

  const loadCitiesAndTypes = async () => {
    try {
      const [c, t] = await Promise.all([fetchCities(), fetchVendorTypes()]);
      if (Array.isArray(c) && c.length > 0) setCities(c);
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
    if (!selectedCity) {
      Alert.alert("Error", "Please select a city");
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
            city: selectedCity.name,
            cityId: selectedCity._id,
            address: formData.address.trim(),
          },
          contactInfo: {
            phone: formData.phone.trim(),
            website: formData.website.trim(),
          },
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      Alert.alert(
        "Success!",
        "Welcome to NightVibe vendors! You can now manage your business.",
        [
          {
            text: "Go to Dashboard",
            onPress: async () => {
              onClose();
              await setActiveAccount("vendor");
              setTimeout(() => {
                router.replace("/(vendor)/dashboard");
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

  const selectCity = (city: City) => {
    setSelectedCity(city);
    setShowCityDropdown(false);
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
          Fill in your business details to join NightVibe as a vendor
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
            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
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

      {/* City Dropdown */}
      <View style={styles.field}>
        <Text style={styles.label}>
          City <Text style={styles.required}>*</Text>
        </Text>
        <TouchableOpacity
          style={styles.picker}
          onPress={() => setShowCityDropdown(!showCityDropdown)}
        >
          <Text
            style={[
              styles.pickerText,
              !selectedCity && styles.pickerPlaceholder,
            ]}
          >
            {selectedCity?.name || "Select city"}
          </Text>
          <Ionicons
            name={showCityDropdown ? "chevron-up" : "chevron-down"}
            size={20}
            color="#9ca3af"
          />
        </TouchableOpacity>
        {showCityDropdown && (
          <View style={styles.dropdown}>
            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
              {cities.map((city) => (
                <TouchableOpacity
                  key={city._id}
                  style={[
                    styles.dropdownItem,
                    selectedCity?._id === city._id &&
                      styles.dropdownItemSelected,
                  ]}
                  onPress={() => selectCity(city)}
                >
                  <View>
                    <Text
                      style={[
                        styles.dropdownItemText,
                        selectedCity?._id === city._id &&
                          styles.dropdownItemTextSelected,
                      ]}
                    >
                      {city.name}
                    </Text>
                    <Text style={styles.dropdownItemSubtext}>{city.state}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
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
