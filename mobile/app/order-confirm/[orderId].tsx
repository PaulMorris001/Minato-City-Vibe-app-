import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  Switch,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import { BASE_URL } from "@/constants/constants";
import { Order } from "@/libs/interfaces";
import { Fonts } from "@/constants/fonts";
import { useFormatPrice } from "@/hooks/useFormatPrice";
import { currencyPrefix } from "@/constants/payments";
import { usePayment } from "@/hooks/usePayment";
import { showError, showSuccess } from "@/utils/toast";
import { ensureOnline } from "@/utils/requireOnline";
import GlassBackButton from "@/components/shared/GlassBackButton";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

/**
 * Review-and-confirm screen shown after a client taps "Pay" on a vendor's
 * invoice. It re-fetches the order (server-authoritative amounts), lays out
 * everything the client is about to pay for, and only then runs the payment —
 * the provider (Stripe sheet / Paystack browser) is chosen server-side from the
 * vendor's country, so nothing about currency or routing changes here.
 */
export default function OrderConfirm() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { orderId } = useLocalSearchParams();
  const formatPrice = useFormatPrice();
  const { payForOrder } = usePayment();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [couponBalanceNGN, setCouponBalanceNGN] = useState(0);
  const [couponBalanceUSD, setCouponBalanceUSD] = useState(0);
  const [useCoupon, setUseCoupon] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const token = await SecureStore.getItemAsync("token");
        const [orderRes, profileRes] = await Promise.all([
          fetch(`${BASE_URL}/orders/${orderId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${BASE_URL}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        const data = await orderRes.json();
        if (!orderRes.ok) {
          setError(data.message || "Couldn't load this order");
        } else {
          setOrder(data);
        }
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setCouponBalanceNGN(profileData?.user?.couponBalanceNGN || 0);
          setCouponBalanceUSD(profileData?.user?.couponBalanceUSD || 0);
        }
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [orderId]);

  const money = (amount: number) =>
    `${currencyPrefix(order?.currency)}${formatPrice(amount)}`;

  const vendorName = () => {
    const v = order?.vendor;
    if (v && typeof v === "object") {
      return (v as any).businessName || (v as any).username || "Vendor";
    }
    return "Vendor";
  };

  // A coupon is only ever spent against an order in its OWN currency — 1
  // coupon = 1 unit of that same currency, no conversion between balances.
  const couponAvailable =
    order?.currency === "NGN" ? couponBalanceNGN : order?.currency === "USD" ? couponBalanceUSD : 0;
  const couponApplied = order ? Math.min(couponAvailable, order.total) : 0;
  const payableAfterCoupon = order ? Math.max(0, order.total - couponApplied) : 0;

  const handleConfirmPay = async () => {
    if (!order || paying) return;
    if (!ensureOnline("pay for an order")) return;
    setPaying(true);
    try {
      const result = await payForOrder(order._id, useCoupon);
      if (result.success) {
        showSuccess("Payment complete", "Paid");
        // Back to the chat — its focus refresh flips the invoice card to Paid.
        if (router.canGoBack()) router.back();
        else router.replace("/messages");
      } else if (result.error) {
        showError(result.error);
      }
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (error || !order) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <GlassBackButton />
          <Text style={styles.headerTitle}>Confirm order</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.textMuted} />
          <Text style={styles.errorText}>{error || "Order not found"}</Text>
        </View>
      </View>
    );
  }

  const alreadyPaid = order.status === "paid" || order.paymentStatus === "paid";
  const payable = order.status === "quoted" && !alreadyPaid;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <GlassBackButton />
        <Text style={styles.headerTitle}>Confirm order</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Vendor */}
        <View style={styles.vendorRow}>
          <View style={styles.vendorAvatar}>
            {(order.vendor as any)?.businessPicture || (order.vendor as any)?.profilePicture ? (
              <Image
                source={{
                  uri:
                    (order.vendor as any).businessPicture ||
                    (order.vendor as any).profilePicture,
                }}
                style={styles.vendorAvatarImg}
              />
            ) : (
              <Ionicons name="storefront-outline" size={20} color={colors.primary} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.vendorLabel}>Paying</Text>
            <Text style={styles.vendorName}>{vendorName()}</Text>
          </View>
        </View>

        {alreadyPaid && (
          <View style={styles.paidBanner}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.paidBannerText}>This order has already been paid.</Text>
          </View>
        )}

        {/* Items */}
        <Text style={styles.sectionLabel}>Items</Text>
        <View style={styles.card}>
          {order.items.map((it, idx) => (
            <View
              key={idx}
              style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.itemNameRow}>
                  <Text style={styles.itemName}>{it.name}</Text>
                  {it.addedByVendor && (
                    <View style={styles.addedTag}>
                      <Text style={styles.addedTagText}>Added by vendor</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.itemQty} numberOfLines={1}>
                  {money(it.priceSnapshot.amount)} × {it.quantity}
                  {it.note ? ` · ${it.note}` : ""}
                </Text>
              </View>
              <Text style={styles.itemAmount} numberOfLines={1}>
                {money(it.priceSnapshot.amount * it.quantity)}
              </Text>
            </View>
          ))}
        </View>

        {/* Fees + totals */}
        <View style={[styles.card, { marginTop: 16 }]}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{money(order.itemsSubtotal)}</Text>
          </View>
          {/* fee.label is vendor-supplied free text and can run long — give it
              the shrink room, not the amount. */}
          {order.additionalFees?.map((fee, idx) => (
            <View key={idx} style={styles.totalRow}>
              <Text style={styles.totalLabel} numberOfLines={1}>{fee.label}</Text>
              <Text style={styles.totalValue} numberOfLines={1}>{money(fee.amount)}</Text>
            </View>
          ))}
          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue} numberOfLines={1}>{money(order.total)}</Text>
          </View>
        </View>

        {payable && couponAvailable > 0 && (
          <View style={[styles.card, styles.couponCard]}>
            <View style={styles.couponRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.couponTitle}>Use my OurCityVibe credit</Text>
                <Text style={styles.couponSubtitle} numberOfLines={2}>
                  You have {money(couponAvailable)} available
                  {couponApplied < order.total ? " — won't cover the full order" : ""}.
                </Text>
              </View>
              <Switch
                value={useCoupon}
                onValueChange={setUseCoupon}
                trackColor={{ true: colors.primary }}
              />
            </View>
            {useCoupon && (
              <View style={styles.couponBreakdown}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Credit applied</Text>
                  <Text style={styles.totalValue}>-{money(couponApplied)}</Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>You pay</Text>
                  <Text style={styles.totalValue}>{money(payableAfterCoupon)}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        <Text style={styles.disclaimer}>
          You'll be charged {money(useCoupon ? payableAfterCoupon : order.total)} in{" "}
          {order.currency}. Amounts are confirmed by the vendor and verified on our
          servers before payment.
        </Text>
      </ScrollView>

      {/* Sticky pay bar */}
      <View style={styles.footer}>
        {payable ? (
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={handleConfirmPay}
            disabled={paying}
          >
            <LinearGradient
              colors={[colors.primary, colors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.payButton}
            >
              {paying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="lock-closed" size={16} color="#fff" />
                  <Text style={styles.payButtonText}>
                    {useCoupon && payableAfterCoupon === 0
                      ? "Confirm — Fully covered by credit"
                      : `Confirm & Pay ${money(useCoupon ? payableAfterCoupon : order.total)}`}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.doneButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/messages"))}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 24 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingTop: 60,
      paddingBottom: 16,
      paddingHorizontal: 16,
      backgroundColor: c.backgroundSecondary,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    headerTitle: { fontSize: 18, fontFamily: Fonts.bold, color: c.text },
    content: { padding: 16, paddingBottom: 24 },
    errorText: { fontSize: 15, fontFamily: Fonts.regular, color: c.textSecondary, textAlign: "center" },

    vendorRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
    vendorAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    vendorAvatarImg: { width: 48, height: 48 },
    vendorLabel: { fontSize: 12, fontFamily: Fonts.regular, color: c.textSecondary },
    vendorName: { fontSize: 18, fontFamily: Fonts.bold, color: c.text, marginTop: 2 },

    paidBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(34,197,94,0.12)",
      borderWidth: 1,
      borderColor: "rgba(34,197,94,0.3)",
      borderRadius: 10,
      padding: 12,
      marginBottom: 16,
    },
    paidBannerText: { flex: 1, fontSize: 13, fontFamily: Fonts.medium, color: c.success },

    sectionLabel: {
      fontSize: 13,
      fontFamily: Fonts.semiBold,
      color: c.textSecondary,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
    },
    itemRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 12 },
    itemRowBorder: { borderTopWidth: 1, borderTopColor: c.border },
    itemNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    itemName: { fontSize: 15, fontFamily: Fonts.semiBold, color: c.text },
    addedTag: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: c.primaryFadedStrong,
      borderWidth: 1,
      borderColor: c.primaryBorder,
    },
    addedTagText: { fontSize: 11, fontFamily: Fonts.semiBold, color: c.primaryLight },
    itemQty: { fontSize: 13, fontFamily: Fonts.regular, color: c.textSecondary, marginTop: 3 },
    itemAmount: { fontSize: 15, fontFamily: Fonts.bold, color: c.text },

    totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, gap: 10 },
    // flex+minWidth so a long vendor-supplied fee.label shrinks before the
    // amount does; the amount itself stays fixed (flexShrink:0).
    totalLabel: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary },
    totalValue: { flexShrink: 0, fontSize: 14, fontFamily: Fonts.medium, color: c.textBody },
    grandTotalRow: { borderTopWidth: 1, borderTopColor: c.border, marginTop: 4, paddingTop: 14, paddingBottom: 14 },
    grandTotalLabel: { fontSize: 16, fontFamily: Fonts.bold, color: c.text },
    grandTotalValue: { flexShrink: 0, fontSize: 20, fontFamily: Fonts.bold, color: c.primary },

    couponCard: { marginTop: 16, paddingVertical: 14 },
    couponRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    couponTitle: { fontSize: 14, fontFamily: Fonts.semiBold, color: c.text },
    couponSubtitle: { fontSize: 12, fontFamily: Fonts.regular, color: c.textSecondary, marginTop: 2 },
    couponBreakdown: { marginTop: 6, borderTopWidth: 1, borderTopColor: c.border },

    disclaimer: {
      fontSize: 12,
      fontFamily: Fonts.regular,
      color: c.textMuted,
      lineHeight: 18,
      marginTop: 16,
      textAlign: "center",
      paddingHorizontal: 8,
    },

    footer: {
      padding: 16,
      paddingBottom: Platform.OS === "ios" ? 32 : 20,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.backgroundSecondary,
    },
    payButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 16,
      borderRadius: 14,
    },
    payButtonText: { fontSize: 16, fontFamily: Fonts.bold, color: "#fff" },
    doneButton: {
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border,
    },
    doneButtonText: { fontSize: 16, fontFamily: Fonts.bold, color: c.text },
  });
