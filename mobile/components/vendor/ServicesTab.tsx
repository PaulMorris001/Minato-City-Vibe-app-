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
import { CatalogueCategory, Service } from "@/libs/interfaces";
import { BASE_URL } from "@/constants/constants";
import ServiceModal from "./ServiceModal";
import CategoryModal from "./CategoryModal";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { currencyPrefix } from "@/constants/payments";
import { VN, VNF, VN_CTA_GRADIENT, coverGradient, categoryEmoji } from "./vendorTheme";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface ServicesTabProps {
  categories: CatalogueCategory[];
  services: Service[];
  onRefresh: () => void;
  refreshing: boolean;
}

export default function ServicesTab({
  categories,
  services,
  onRefresh,
  refreshing,
}: ServicesTabProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const formatPrice = useFormatPrice();

  // Drill-in: null = category grid, otherwise show that category's items.
  const [selectedCategory, setSelectedCategory] = useState<CatalogueCategory | null>(null);

  const [categoryModalVisible, setCategoryModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CatalogueCategory | null>(null);

  const [itemModalVisible, setItemModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Service | null>(null);

  // Group items under their parent category id.
  const itemsByCategory = useMemo(() => {
    const map: Record<string, Service[]> = {};
    for (const s of services) {
      const key = s.catalogueCategory || "";
      if (!key) continue;
      (map[key] ||= []).push(s);
    }
    return map;
  }, [services]);

  // Keep the selected category object in sync with refreshed data.
  const activeCategory = useMemo(
    () =>
      selectedCategory
        ? categories.find((c) => c._id === selectedCategory._id) || selectedCategory
        : null,
    [selectedCategory, categories]
  );

  const activeItems = activeCategory ? itemsByCategory[activeCategory._id] || [] : [];

  // ── Category actions ──
  const handleNewCategory = () => {
    setEditingCategory(null);
    setCategoryModalVisible(true);
  };

  const handleEditCategory = (category: CatalogueCategory) => {
    setEditingCategory(category);
    setCategoryModalVisible(true);
  };

  const handleDeleteCategory = (category: CatalogueCategory) => {
    const count = itemsByCategory[category._id]?.length || 0;
    if (count > 0) {
      Alert.alert(
        "Category not empty",
        `Remove the ${count} item(s) in "${category.name}" before deleting it.`
      );
      return;
    }
    Alert.alert("Delete category", `Delete "${category.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await SecureStore.getItemAsync("token");
            await axios.delete(`${BASE_URL}/vendor/categories/${category._id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            onRefresh();
          } catch (error: any) {
            Alert.alert("Error", error.response?.data?.message || "Failed to delete category");
          }
        },
      },
    ]);
  };

  // ── Item actions ──
  const handleAddItem = () => {
    setEditingItem(null);
    setItemModalVisible(true);
  };

  const handleEditItem = (service: Service) => {
    setEditingItem(service);
    setItemModalVisible(true);
  };

  const handleDeleteItem = (service: Service) => {
    Alert.alert(
      "Delete item",
      `Delete ${service.name}? Existing orders are unaffected.`,
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
              Alert.alert("Error", error.response?.data?.message || "Failed to delete item");
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
      Alert.alert("Error", error.response?.data?.message || "Failed to update item");
    }
  };

  // ── Renderers ──
  const renderCategoryCard = ({ item }: { item: CatalogueCategory }) => {
    const [c1, c2] = coverGradient(item._id);
    const hasImg = item.images && item.images.length > 0;
    const count = itemsByCategory[item._id]?.length || 0;
    const isProduct = item.kind === "product";
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        style={styles.card}
        onPress={() => setSelectedCategory(item)}
      >
        <View style={styles.catCover}>
          {hasImg ? (
            <Image source={{ uri: item.images![0] }} style={StyleSheet.absoluteFill as any} contentFit="cover" />
          ) : (
            <LinearGradient colors={[c1, c2]} style={StyleSheet.absoluteFill as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={styles.coverEmoji}>{categoryEmoji(item.name)}</Text>
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.55)"]} locations={[0.4, 1]} style={StyleSheet.absoluteFill as any} />
          <View style={styles.coverTop}>
            <View style={styles.kindPill}>
              <Ionicons name={isProduct ? "cube" : "construct"} size={11} color="#fff" />
              <Text style={styles.kindPillText}>{isProduct ? "PRODUCTS" : "SERVICE"}</Text>
            </View>
          </View>
          <View style={styles.coverBottom}>
            <Text style={styles.coverTitle} numberOfLines={2}>{item.name}</Text>
            <Text style={styles.coverSub} numberOfLines={1}>
              {count} item{count !== 1 ? "s" : ""}
            </Text>
          </View>
        </View>
        <View style={styles.body}>
          {!!item.description && (
            <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
          )}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.editBtn} onPress={() => setSelectedCategory(item)} activeOpacity={0.8}>
              <Ionicons name="albums-outline" size={14} color={colors.primaryLight} />
              <Text style={styles.editBtnText}>Open</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pauseBtn} onPress={() => handleEditCategory(item)} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={14} color={colors.textDim} />
              <Text style={styles.pauseBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteCategory(item)} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={15} color={colors.accentPink} />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderItemCard = ({ item }: { item: Service }) => {
    const active = item.isActive;
    const [c1, c2] = coverGradient(item._id);
    const hasImg = item.images && item.images.length > 0;
    const isProduct = item.kind === "product";
    const prefix = currencyPrefix(item.currency);
    return (
      <View style={styles.card}>
        <View style={styles.cover}>
          {hasImg ? (
            <Image source={{ uri: item.images[0] }} style={StyleSheet.absoluteFill as any} contentFit="cover" />
          ) : (
            <LinearGradient colors={[c1, c2]} style={StyleSheet.absoluteFill as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Text style={styles.coverEmoji}>{categoryEmoji(item.category)}</Text>
            </LinearGradient>
          )}
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.55)"]} locations={[0.4, 1]} style={StyleSheet.absoluteFill as any} />
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
              <Text style={styles.priceChipText}>
                {prefix}{formatPrice(item.price)}
                {isProduct && item.unit ? ` ${item.unit}` : ""}
              </Text>
            </View>
          </View>
          <View style={styles.coverBottom}>
            <Text style={styles.coverTitle} numberOfLines={2}>{item.name}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.metaRow}>
            {isProduct ? (
              <>
                {!!item.unit && (
                  <View style={styles.metaItem}>
                    <Ionicons name="pricetag-outline" size={12} color={colors.primaryLight} />
                    <Text style={styles.metaText}>{item.unit}</Text>
                  </View>
                )}
                {item.stock != null && (
                  <View style={styles.metaItem}>
                    <Ionicons name="cube-outline" size={12} color={colors.primaryLight} />
                    <Text style={styles.metaText}>{item.stock} in stock</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                {item.duration && (
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={12} color={colors.primaryLight} />
                    <Text style={styles.metaText}>{item.duration.value} {item.duration.unit}</Text>
                  </View>
                )}
                {item.leadTime && (
                  <View style={styles.metaItem}>
                    <Ionicons name="hourglass-outline" size={12} color={colors.primaryLight} />
                    <Text style={styles.metaText}>{item.leadTime.value} {item.leadTime.unit} lead</Text>
                  </View>
                )}
              </>
            )}
          </View>

          {!!item.description && (
            <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
          )}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.editBtn} onPress={() => handleEditItem(item)} activeOpacity={0.8}>
              <Ionicons name="create-outline" size={14} color={colors.primaryLight} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pauseBtn} onPress={() => handleToggleActive(item)} activeOpacity={0.8}>
              <Ionicons name={active ? "eye-off-outline" : "eye-outline"} size={14} color={active ? colors.textDim : colors.primaryLight} />
              <Text style={[styles.pauseBtnText, !active && { color: colors.primaryLight }]}>
                {active ? "Pause" : "Resume"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteItem(item)} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={15} color={colors.accentPink} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // ── Category grid view ──
  if (!activeCategory) {
    const totalItems = services.length;
    return (
      <View style={styles.container}>
        <FlatList
          data={categories}
          renderItem={renderCategoryCard}
          keyExtractor={(c) => c._id}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListHeaderComponent={
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>My catalogue</Text>
                <Text style={styles.subtitle}>
                  {categories.length} categor{categories.length !== 1 ? "ies" : "y"} · {totalItems} item{totalItems !== 1 ? "s" : ""}
                </Text>
              </View>
              <TouchableOpacity activeOpacity={0.85} onPress={handleNewCategory}>
                <LinearGradient colors={VN_CTA_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newBtn}>
                  <Ionicons name="add" size={15} color="#fff" />
                  <Text style={styles.newBtnText}>New</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🗂️</Text>
              <Text style={styles.emptyTitle}>No categories yet</Text>
              <Text style={styles.emptySub}>
                Create a category (like "Catering" or "Photography"), then add the products or services inside it.
              </Text>
              <TouchableOpacity activeOpacity={0.85} onPress={handleNewCategory}>
                <LinearGradient colors={VN_CTA_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyCta}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.emptyCtaText}>New category</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          }
        />

        <CategoryModal
          visible={categoryModalVisible}
          category={editingCategory}
          onClose={() => {
            setCategoryModalVisible(false);
            setEditingCategory(null);
          }}
          onSuccess={() => {
            setCategoryModalVisible(false);
            setEditingCategory(null);
            onRefresh();
          }}
        />
      </View>
    );
  }

  // ── Items view (drilled into a category) ──
  const isProductCat = activeCategory.kind === "product";
  return (
    <View style={styles.container}>
      <FlatList
        data={activeItems}
        renderItem={renderItemCard}
        keyExtractor={(s) => s._id}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View>
            <TouchableOpacity style={styles.backRow} onPress={() => setSelectedCategory(null)} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={18} color={colors.primaryLight} />
              <Text style={styles.backText}>All categories</Text>
            </TouchableOpacity>
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{activeCategory.name}</Text>
                <Text style={styles.subtitle}>
                  {isProductCat ? "Products" : "Service"} · {activeItems.length} item{activeItems.length !== 1 ? "s" : ""}
                </Text>
              </View>
              <TouchableOpacity activeOpacity={0.85} onPress={handleAddItem}>
                <LinearGradient colors={VN_CTA_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.newBtn}>
                  <Ionicons name="add" size={15} color="#fff" />
                  <Text style={styles.newBtnText}>Add</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>{isProductCat ? "🍽️" : "🛠️"}</Text>
            <Text style={styles.emptyTitle}>No {isProductCat ? "products" : "services"} yet</Text>
            <Text style={styles.emptySub}>
              Add the {isProductCat ? "products" : "services"} clients can order from this category.
            </Text>
            <TouchableOpacity activeOpacity={0.85} onPress={handleAddItem}>
              <LinearGradient colors={VN_CTA_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyCta}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.emptyCtaText}>Add {isProductCat ? "product" : "service"}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        }
      />

      <ServiceModal
        visible={itemModalVisible}
        category={activeCategory}
        service={editingItem}
        onClose={() => {
          setItemModalVisible(false);
          setEditingItem(null);
        }}
        onSuccess={() => {
          setItemModalVisible(false);
          setEditingItem(null);
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

    backRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 12 },
    backText: { fontFamily: VNF.bold, fontSize: 13, color: c.primaryLight },

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
    catCover: { height: 116, position: "relative", justifyContent: "center", overflow: "hidden" },
    coverEmoji: { fontSize: 120, opacity: 0.3, position: "absolute", right: -8, top: -10, transform: [{ rotate: "-12deg" }] },
    coverTop: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    kindPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(124,58,237,0.55)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
    kindPillText: { fontFamily: VNF.bold, fontSize: 10, letterSpacing: 0.5, color: "#fff" },
    statusPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
    statusDot: { width: 5, height: 5, borderRadius: 3 },
    statusText: { fontFamily: VNF.bold, fontSize: 10, letterSpacing: 0.5 },
    priceChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
    priceChipText: { fontFamily: VNF.heading, fontSize: 13, color: c.white },
    coverBottom: { position: "absolute", left: 14, right: 14, bottom: 12 },
    coverTitle: { fontFamily: VNF.display, fontSize: 22, color: "#F4EEFF", letterSpacing: -0.6, lineHeight: 24 },
    coverSub: { fontFamily: VNF.semibold, fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4 },

    body: { padding: 14 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" },
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
