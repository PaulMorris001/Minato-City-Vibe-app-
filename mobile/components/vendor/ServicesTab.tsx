import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { Service } from "@/libs/interfaces";
import { BASE_URL } from "@/constants/constants";
import ServiceModal from "./ServiceModal";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { VN, VNF, VN_CTA_GRADIENT, coverGradient, categoryEmoji } from "./vendorTheme";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface ServicesTabProps {
  services: Service[];
  onRefresh: () => void;
  refreshing: boolean;
}

type Filter = "all" | "active" | "unavailable";

export default function ServicesTab({ services, onRefresh, refreshing }: ServicesTabProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const formatPrice = useFormatPrice();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const active = services.filter((s) => s.isActive).length;
    return { all: services.length, active, unavailable: services.length - active };
  }, [services]);

  const filtered = useMemo(() => {
    if (filter === "active") return services.filter((s) => s.isActive);
    if (filter === "unavailable") return services.filter((s) => !s.isActive);
    return services;
  }, [services, filter]);

  const handleAddService = () => {
    setSelectedService(null);
    setModalVisible(true);
  };

  const handleEditService = (service: Service) => {
    setSelectedService(service);
    setModalVisible(true);
  };

  const handleDeleteService = (service: Service) => {
    Alert.alert(
      "Delete service",
      `Delete ${service.name}? Existing bookings will be honored.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync("token");
              await axios.delete(`${BASE_URL}/vendor/services/${service._id}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              onRefresh();
            } catch (error: any) {
              Alert.alert("Error", error.response?.data?.message || "Failed to delete service");
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async (service: Service) => {
    try {
      const token = await SecureStore.getItemAsync("token");
      await axios.put(
        `${BASE_URL}/vendor/services/${service._id}`,
        { isActive: !service.isActive },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      onRefresh();
    } catch (error: any) {
      Alert.alert("Error", error.response?.data?.message || "Failed to update service");
    }
  };

  const renderCard = ({ item }: { item: Service }) => {
    const active = item.isActive;
    const [c1, c2] = coverGradient(item._id);
    const hasImg = item.images && item.images.length > 0;
    return (
      <View style={styles.card}>
        {/* Cover */}
        <View style={styles.cover}>
          {hasImg ? (
            <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill as any} contentFit="cover" />
          ) : (
            <LinearGradient colors={[c1, c2]} style={StyleSheet.absoluteFill as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={styles.coverEmoji}>{categoryEmoji(item.category)}</Text>
            </LinearGradient>
          )}
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.55)"]}
            locations={[0.4, 1]}
            style={StyleSheet.absoluteFill as any}
          />

          {/* Top chips */}
          <View style={styles.coverTop}>
            <View
              style={[
                styles.statusPill,
                active
                  ? { backgroundColor: "rgba(52,211,153,0.22)", borderColor: "rgba(52,211,153,0.4)" }
                  : { backgroundColor: "rgba(0,0,0,0.4)", borderColor: "rgba(255,255,255,0.16)" },
              ]}
            >
              <View style={[styles.statusDot, { backgroundColor: active ? VN.green : VN.textMute }]} />
              <Text style={[styles.statusText, { color: active ? VN.greenSoft : VN.textDim }]}>
                {active ? "ACTIVE" : "PAUSED"}
              </Text>
            </View>
            <View style={styles.priceChip}>
              <Text style={styles.priceChipText}>${formatPrice(item.price)}</Text>
            </View>
          </View>

          {/* Title */}
          <View style={styles.coverBottom}>
            <Text style={styles.coverTitle} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.coverSub} numberOfLines={1}>{item.category}</Text>
          </View>
        </View>

        {/* Body */}
        <View style={styles.body}>
          <View style={styles.metaRow}>
            {item.duration && (
              <View style={styles.metaItem}>
                <Ionicons name="time-outline" size={12} color={colors.primaryLight} />
                <Text style={styles.metaText}>
                  {item.duration.value} {item.duration.unit}
                </Text>
              </View>
            )}
            <View style={styles.metaItem}>
              <Ionicons name="pricetag-outline" size={12} color={colors.primaryLight} />
              <Text style={styles.metaText}>{item.currency || "USD"}</Text>
            </View>
          </View>

          {!!item.description && (
            <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.editBtn} onPress={() => handleEditService(item)} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={14} color={colors.primaryLight} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pauseBtn} onPress={() => handleToggleActive(item)} activeOpacity={0.8}>
              <Ionicons name={active ? "eye-off-outline" : "eye-outline"} size={14} color={active ? colors.textDim : colors.primaryLight} />
              <Text style={[styles.pauseBtnText, !active && { color: colors.primaryLight }]}>
                {active ? "Pause" : "Resume"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteService(item)} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={15} color={colors.accentPink} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const FILTERS: { id: Filter; label: string; n: number }[] = [
    { id: "all", label: "All", n: counts.all },
    { id: "active", label: "Active", n: counts.active },
    { id: "unavailable", label: "Unavailable", n: counts.unavailable },
  ];

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        renderItem={renderCard}
        keyExtractor={(item) => item._id}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            {/* Title row */}
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>My services</Text>
                <Text style={styles.subtitle}>
                  {counts.all} service{counts.all !== 1 ? "s" : ""} · {counts.active} active
                </Text>
              </View>
              <TouchableOpacity activeOpacity={0.85} onPress={handleAddService}>
                <LinearGradient colors={VN_CTA_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newBtn}>
                  <Ionicons name="add" size={15} color="#fff" />
                  <Text style={styles.newBtnText}>New</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Filters */}
            <View style={styles.filters}>
              {FILTERS.map((f) => {
                const on = filter === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => setFilter(f.id)}
                    activeOpacity={0.8}
                    style={[
                      styles.filterPill,
                      on
                        ? { backgroundColor: colors.primaryFadedStrong, borderColor: colors.primaryBorder }
                        : { backgroundColor: colors.glassFillSubtle, borderColor: colors.glassStroke },
                    ]}
                  >
                    <Text style={[styles.filterLabel, { color: on ? colors.primaryLight : colors.textDim }]}>{f.label}</Text>
                    <View
                      style={[
                        styles.filterCount,
                        { backgroundColor: on ? "rgba(168,85,247,0.2)" : colors.glassFillSubtle },
                      ]}
                    >
                      <Text style={[styles.filterCountText, { color: on ? colors.primaryLight : colors.textFaint }]}>{f.n}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🎟️</Text>
            <Text style={styles.emptyTitle}>No services yet</Text>
            <Text style={styles.emptySub}>Add your first service to start taking bookings.</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={handleAddService}>
              <LinearGradient colors={VN_CTA_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyCta}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.emptyCtaText}>Add service</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        }
      />

      <ServiceModal
        visible={modalVisible}
        service={selectedService}
        onClose={() => {
          setModalVisible(false);
          setSelectedService(null);
        }}
        onSuccess={() => {
          setModalVisible(false);
          setSelectedService(null);
          onRefresh();
        }}
      />
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: c.backgroundDeep },
  listContent: { padding: 18, paddingBottom: 32 },

  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 12 },
  title: { fontFamily: VNF.display, fontSize: 30, color: c.textBright, letterSpacing: -0.9 },
  subtitle: { fontFamily: VNF.medium, fontSize: 12, color: c.textDim, marginTop: 4 },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: VN.purple,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  newBtnText: { fontFamily: VNF.heading, fontSize: 13, color: c.white },

  filters: { flexDirection: "row", gap: 8, marginBottom: 18 },
  filterPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  filterLabel: { fontFamily: VNF.bold, fontSize: 12 },
  filterCount: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  filterCountText: { fontFamily: VNF.bold, fontSize: 10 },

  card: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: c.cardGlass,
    borderWidth: 1,
    borderColor: c.glassStrokeStrong,
    marginBottom: 12,
    shadowColor: VN.purpleDeep,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 6,
  },
  cover: { height: 132, position: "relative", justifyContent: "center", overflow: "hidden" },
  coverEmoji: { fontSize: 120, opacity: 0.3, position: "absolute", right: -8, top: -10, transform: [{ rotate: "-12deg" }] },
  coverTop: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontFamily: VNF.bold, fontSize: 10, letterSpacing: 0.5 },
  // Cover chips/text sit on the photo + dark scrim, so they stay pinned light
  // in both schemes.
  priceChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  priceChipText: { fontFamily: VNF.heading, fontSize: 13, color: c.white },
  coverBottom: { position: "absolute", left: 14, right: 14, bottom: 12 },
  coverTitle: { fontFamily: VNF.display, fontSize: 22, color: "#F4EEFF", letterSpacing: -0.6, lineHeight: 24 },
  coverSub: { fontFamily: VNF.semibold, fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4 },

  body: { padding: 14 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontFamily: VNF.medium, fontSize: 12, color: c.textDim },
  description: { fontFamily: VNF.body, fontSize: 13, color: c.textBright, lineHeight: 19, marginTop: 10 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.glassStroke },
  editBtn: { flex: 1, height: 38, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.primaryFadedStrong, borderWidth: 1, borderColor: c.primaryBorder },
  editBtnText: { fontFamily: VNF.bold, fontSize: 12, color: c.primaryLight },
  pauseBtn: { height: 38, paddingHorizontal: 12, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: c.glassFillSubtle, borderWidth: 1, borderColor: c.glassStrokeStrong },
  pauseBtnText: { fontFamily: VNF.bold, fontSize: 12, color: c.textDim },
  deleteBtn: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(236,72,153,0.10)", borderWidth: 1, borderColor: "rgba(236,72,153,0.3)" },

  empty: { alignItems: "center", paddingVertical: 60 },
  emptyEmoji: { fontSize: 80, opacity: 0.3 },
  emptyTitle: { fontFamily: VNF.heading, fontSize: 20, color: c.textBright, marginTop: 8 },
  emptySub: { fontFamily: VNF.body, fontSize: 13, color: c.textDim, marginTop: 6, textAlign: "center", paddingHorizontal: 40 },
  emptyCta: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingHorizontal: 20, borderRadius: 12, marginTop: 20 },
  emptyCtaText: { fontFamily: VNF.heading, fontSize: 14, color: c.white },
});
