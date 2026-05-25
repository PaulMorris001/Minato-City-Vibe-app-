import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Fonts } from "@/constants/fonts";
import { Colors } from "@/constants/colors";
import {
  fetchCountries,
  fetchStatesByCountry,
  fetchCitiesByState,
} from "@/libs/api";
import {
  CountryOption,
  StateOption,
  CityOption,
  LocationSelection,
} from "@/libs/interfaces";

type Field = "country" | "state" | "city";

interface LocationPickerProps {
  value?: Partial<LocationSelection>;
  onChange: (sel: LocationSelection) => void;
  label?: string;
  required?: boolean;
}

export default function LocationPicker({
  value,
  onChange,
  label = "Location",
  required = false,
}: LocationPickerProps) {
  const [country, setCountry] = useState<{ name: string; iso: string } | null>(
    value?.country ? { name: value.country, iso: value.countryIso || "" } : null
  );
  const [state, setStateSel] = useState<{ name: string; iso: string } | null>(
    value?.state ? { name: value.state, iso: value.stateIso || "" } : null
  );
  const [city, setCity] = useState<string>(value?.city || "");

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);

  const [openField, setOpenField] = useState<Field | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    fetchCountries().then(setCountries).catch(() => {});
  }, []);

  const emit = (next: Partial<LocationSelection>) => {
    onChange({
      country: next.country ?? country?.name ?? "",
      countryIso: next.countryIso ?? country?.iso ?? "",
      state: next.state ?? state?.name ?? "",
      stateIso: next.stateIso ?? state?.iso ?? "",
      city: next.city ?? city,
    });
  };

  const openPicker = async (field: Field) => {
    setSearch("");
    setOpenField(field);
    if (field === "state" && country) {
      setLoading(true);
      const s = await fetchStatesByCountry(country.iso).catch(() => []);
      setStates(s);
      setLoading(false);
    } else if (field === "city" && country && state) {
      setLoading(true);
      const c = await fetchCitiesByState(country.iso, state.iso).catch(() => []);
      setCities(c);
      setLoading(false);
    }
  };

  const selectCountry = (c: CountryOption) => {
    setCountry({ name: c.name, iso: c.iso2 });
    setStateSel(null);
    setCity("");
    setStates([]);
    setCities([]);
    setOpenField(null);
    emit({ country: c.name, countryIso: c.iso2, state: "", stateIso: "", city: "" });
  };

  const selectState = (s: StateOption) => {
    setStateSel({ name: s.name, iso: s.iso2 });
    setCity("");
    setCities([]);
    setOpenField(null);
    emit({ state: s.name, stateIso: s.iso2, city: "" });
  };

  const selectCity = (c: CityOption) => {
    setCity(c.name);
    setOpenField(null);
    emit({ city: c.name });
  };

  // Detect the user's location and pre-fill the fields (uses location permission).
  const useMyLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const { status, canAskAgain } =
        await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location access needed",
          "Enable location so NightVibe can fill in your city automatically.",
          canAskAgain
            ? [{ text: "OK" }]
            : [
                { text: "Cancel", style: "cancel" },
                { text: "Open Settings", onPress: () => Linking.openSettings() },
              ]
        );
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const place = places?.[0];
      if (!place) {
        Alert.alert(
          "Couldn't detect location",
          "Please choose your location manually."
        );
        return;
      }

      const countryName = place.country || "";
      const countryIso = place.isoCountryCode || "";
      const stateName = place.region || "";
      const cityName = place.city || place.subregion || place.district || "";

      if (countryName) setCountry({ name: countryName, iso: countryIso });
      setStateSel(stateName ? { name: stateName, iso: "" } : null);
      setCity(cityName);
      emit({
        country: countryName,
        countryIso,
        state: stateName,
        stateIso: "",
        city: cityName,
      });
    } catch {
      Alert.alert(
        "Location error",
        "We couldn't get your location. Please choose it manually."
      );
    } finally {
      setLocating(false);
    }
  };

  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list =
      openField === "country" ? countries : openField === "state" ? states : cities;
    if (!q) return list;
    return list.filter((o: any) => o.name.toLowerCase().includes(q));
  }, [openField, search, countries, states, cities]);

  const Row = ({
    field,
    icon,
    placeholder,
    text,
    disabled,
  }: {
    field: Field;
    icon: any;
    placeholder: string;
    text: string;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.row, disabled && styles.rowDisabled]}
      onPress={() => !disabled && openPicker(field)}
      activeOpacity={disabled ? 1 : 0.7}
    >
      <Ionicons name={icon} size={18} color={disabled ? "#4b5563" : Colors.primary} />
      <Text style={[styles.rowText, !text && styles.rowPlaceholder]} numberOfLines={1}>
        {text || placeholder}
      </Text>
      <Ionicons name="chevron-down" size={16} color="#6b7280" />
    </TouchableOpacity>
  );

  const modalTitle =
    openField === "country" ? "Select country" : openField === "state" ? "Select state / region" : "Select city";

  return (
    <View style={styles.container}>
      {!!label && (
        <Text style={styles.label}>
          {label} {required && <Text style={styles.required}>*</Text>}
        </Text>
      )}

      <TouchableOpacity
        style={styles.useLocationBtn}
        onPress={useMyLocation}
        disabled={locating}
        activeOpacity={0.7}
      >
        {locating ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Ionicons name="navigate" size={16} color={Colors.primary} />
        )}
        <Text style={styles.useLocationText}>
          {locating ? "Detecting location…" : "Use my current location"}
        </Text>
      </TouchableOpacity>

      <Row field="country" icon="earth-outline" placeholder="Select country" text={country?.name || ""} />
      <Row
        field="state"
        icon="map-outline"
        placeholder="Select state / region"
        text={state?.name || ""}
        disabled={!country}
      />
      <Row
        field="city"
        icon="location-outline"
        placeholder="Select city"
        text={city}
        disabled={!state}
      />

      <Modal
        visible={openField !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setOpenField(null)}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.overlayTouchable}
            activeOpacity={1}
            onPress={() => setOpenField(null)}
          />
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={styles.title}>{modalTitle}</Text>
              <TouchableOpacity onPress={() => setOpenField(null)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#6b7280" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search..."
                placeholderTextColor="#6b7280"
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
            </View>

            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={options as any[]}
                keyExtractor={(item, i) => `${item.name}-${i}`}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <Text style={styles.empty}>
                    {openField === "state"
                      ? "No states found for this country."
                      : "No results."}
                  </Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.item}
                    onPress={() => {
                      if (openField === "country") selectCountry(item);
                      else if (openField === "state") selectState(item);
                      else selectCity(item);
                    }}
                  >
                    <Text style={styles.itemText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
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
  useLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "rgba(168,85,247,0.1)",
    borderWidth: 1,
    borderColor: "rgba(168,85,247,0.3)",
    marginBottom: 12,
  },
  useLocationText: {
    fontSize: 14,
    fontFamily: Fonts.semiBold,
    color: Colors.primary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1f1f2e",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#374151",
    marginBottom: 10,
  },
  rowDisabled: {
    opacity: 0.5,
  },
  rowText: {
    flex: 1,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#fff",
  },
  rowPlaceholder: {
    color: "#6b7280",
  },
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  overlayTouchable: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
  },
  content: {
    backgroundColor: "#1f1f2e",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "75%",
    paddingBottom: 30,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  title: {
    fontSize: 20,
    fontFamily: Fonts.bold,
    color: "#fff",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#161620",
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#374151",
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#fff",
    padding: 0,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a3a",
  },
  itemText: {
    fontSize: 16,
    fontFamily: Fonts.regular,
    color: "#e5e7eb",
  },
  empty: {
    textAlign: "center",
    color: "#9ca3af",
    fontFamily: Fonts.regular,
    marginTop: 24,
  },
});
