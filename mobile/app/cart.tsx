import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { Fonts } from "@/constants/fonts";
import { Colors } from "@/constants/colors";
import { BASE_URL } from "@/constants/constants";
import { useCart } from "@/contexts/CartContext";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { currencyPrefix } from "@/constants/payments";
import { showError } from "@/utils/toast";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import GlassBackButton from "@/components/shared/GlassBackButton";
import type { CartItem } from "@/libs/interfaces";

export default function CartScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const cart = useCart();
  const formatPrice = useFormatPrice();
  const [submitting, setSubmitting] = useState(false);

  const prefix = currencyPrefix(cart.items[0]?.currency);

  const handleCheckout = async () => {
    if (!cart.vendorId || cart.items.length === 0) return;
    setSubmitting(true);
    try {
      const token = await SecureStore.getItemAsync("token");
      const res = await fetch(`${BASE_URL}/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vendorId: cart.vendorId,
          items: cart.items.map((i) => ({
            serviceId: i.serviceId,
            quantity: i.quantity,
            note: i.note || "",
          })),
        }),
      });
      const data = await res.json();
      if (res.ok && data.chatId) {
        cart.clear();
        // Land in the vendor chat where the order card now lives.
        router.replace(`/chat/${data.chatId}`);
      } else {
        showError(data.message || "Couldn't send your order. Please try again.");
      }
    } catch {
      showError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderItem = ({ item }: { item: CartItem }) => (
    <View style={styles.card}>
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Ionicons name="fast-food-outline" size={24} color={colors.textMuted} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <View style={styles.cardTopRow}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          <TouchableOpacity onPress={() => cart.removeItem(item.serviceId)} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.itemPrice}>
          {prefix}
          {formatPrice(item.price)}
        </Text>

        <TextInput
          style={styles.noteInput}
          placeholder="Add a note (optional)"
          placeholderTextColor={colors.textMuted}
          value={item.note}
          onChangeText={(t) => cart.setNote(item.serviceId, t)}
        />

        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => cart.setQuantity(item.serviceId, item.quantity - 1)}
          >
            <Ionicons name="remove" size={18} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.stepperQty}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => cart.setQuantity(item.serviceId, item.quantity + 1)}
          >
            <Ionicons name="add" size={18} color={colors.primary} />
          </TouchableOpacity>

          <Text style={styles.lineTotal}>
            {prefix}
            {formatPrice(item.price * item.quantity)}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.backgroundSecondary, colors.backgroundTertiary]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <GlassBackButton style={styles.backButton} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Your cart</Text>
            {!!cart.vendorName && (
              <Text style={styles.subtitle}>{cart.vendorName}</Text>
            )}
          </View>
        </View>
      </LinearGradient>

      {cart.items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cart-outline" size={64} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptyText}>
            Add items from a vendor's catalogue to get started.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={cart.items}
            keyExtractor={(i) => i.serviceId}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListFooterComponent={
              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Subtotal</Text>
                  <Text style={styles.summaryValue}>
                    {prefix}
                    {formatPrice(cart.subtotal)}
                  </Text>
                </View>
                <Text style={styles.summaryNote}>
                  The vendor may add delivery or other fees before sending your
                  final invoice to pay.
                </Text>
              </View>
            }
          />

          <View style={styles.footer}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleCheckout}
              disabled={submitting}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.checkoutBtn}
              >
                {submitting ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.white} />
                    <Text style={styles.checkoutText}>Send order to vendor</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 16 },
    headerContent: { flexDirection: "row", alignItems: "center" },
    backButton: { padding: 8, marginRight: 12 },
    title: { fontSize: 24, fontFamily: Fonts.bold, color: c.text },
    subtitle: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary, marginTop: 2 },

    listContent: { padding: 16, paddingBottom: 24 },
    card: {
      flexDirection: "row",
      gap: 12,
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: c.border },
    thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
    cardTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
    itemName: { flex: 1, fontSize: 16, fontFamily: Fonts.semiBold, color: c.text },
    itemPrice: { fontSize: 14, fontFamily: Fonts.medium, color: c.primary, marginTop: 2 },
    noteInput: {
      backgroundColor: c.background,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 13,
      fontFamily: Fonts.regular,
      color: c.text,
      borderWidth: 1,
      borderColor: c.border,
      marginTop: 8,
    },
    stepperRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10 },
    stepperBtn: {
      width: 34,
      height: 34,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: `${Colors.primary}18`,
    },
    stepperQty: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.text, minWidth: 20, textAlign: "center" },
    lineTotal: { marginLeft: "auto", fontSize: 15, fontFamily: Fonts.bold, color: c.text },

    summary: {
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: c.border,
      marginTop: 4,
    },
    summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    summaryLabel: { fontSize: 16, fontFamily: Fonts.semiBold, color: c.text },
    summaryValue: { fontSize: 18, fontFamily: Fonts.bold, color: c.text },
    summaryNote: { fontSize: 12, fontFamily: Fonts.regular, color: c.textSecondary, marginTop: 8, lineHeight: 17 },

    footer: {
      padding: 16,
      paddingBottom: Platform.OS === "ios" ? 32 : 20,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.background,
    },
    checkoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      borderRadius: 14,
    },
    checkoutText: { fontSize: 16, fontFamily: Fonts.bold, color: c.white },

    empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
    emptyTitle: { fontSize: 20, fontFamily: Fonts.bold, color: c.text, marginTop: 8 },
    emptyText: { fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary, textAlign: "center", lineHeight: 20 },
  });
