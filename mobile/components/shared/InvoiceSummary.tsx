import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Fonts } from "@/constants/fonts";
import type { ThemeColors } from "@/constants/theme";
import { useThemedStyles } from "@/contexts/ThemeContext";

export interface InvoiceLine {
  /** Headline for the row — a service name, a ticket name. */
  name: string;
  /** The smaller second line: unit price × quantity, a note, a date. */
  meta?: string;
  /** Pre-formatted, currency prefix included — this component never does money. */
  amount: string;
  /** Small pill beside the name, e.g. "Added by vendor". */
  tag?: string;
}

export interface InvoiceRow {
  label: string;
  value: string;
}

interface InvoiceSummaryProps {
  /** Section heading above the line items. */
  itemsLabel?: string;
  items: InvoiceLine[];
  /** Subtotal, fees, discounts — everything above the rule. */
  rows?: InvoiceRow[];
  /** The emphasised bottom line. Omit while there is no agreed total yet. */
  total?: InvoiceRow | null;
  style?: StyleProp<ViewStyle>;
}

/**
 * The line-items-and-totals body shared by every invoice surface: the vendor
 * order a client confirms (`order-confirm/[orderId]`) and the negotiated ticket
 * invoice (`ticket-offer/[id]`).
 *
 * Purely presentational, and takes amounts as pre-formatted strings on purpose
 * — the two callers resolve currency differently (`useFormatPrice` vs the
 * offer's own currency) and neither should have to agree with the other about
 * rounding to share a layout.
 */
export default function InvoiceSummary({
  itemsLabel = "Items",
  items,
  rows = [],
  total = null,
  style,
}: InvoiceSummaryProps) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={style}>
      <Text style={styles.sectionLabel}>{itemsLabel}</Text>
      <View style={styles.card}>
        {items.map((item, idx) => (
          <View key={idx} style={[styles.itemRow, idx > 0 && styles.itemRowBorder]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.itemNameRow}>
                <Text style={styles.itemName}>{item.name}</Text>
                {!!item.tag && (
                  <View style={styles.addedTag}>
                    <Text style={styles.addedTagText}>{item.tag}</Text>
                  </View>
                )}
              </View>
              {!!item.meta && (
                <Text style={styles.itemQty} numberOfLines={2}>
                  {item.meta}
                </Text>
              )}
            </View>
            <Text style={styles.itemAmount} numberOfLines={1}>
              {item.amount}
            </Text>
          </View>
        ))}
      </View>

      {(rows.length > 0 || total) && (
        <View style={[styles.card, { marginTop: 16 }]}>
          {/* A fee label is free text and can run long — give it the shrink
              room, never the amount. */}
          {rows.map((row, idx) => (
            <View key={idx} style={styles.totalRow}>
              <Text style={styles.totalLabel} numberOfLines={1}>
                {row.label}
              </Text>
              <Text style={styles.totalValue} numberOfLines={1}>
                {row.value}
              </Text>
            </View>
          ))}
          {total && (
            <View style={[styles.totalRow, styles.grandTotalRow]}>
              <Text style={styles.grandTotalLabel}>{total.label}</Text>
              <Text style={styles.grandTotalValue} numberOfLines={1}>
                {total.value}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
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

    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
      gap: 10,
    },
    totalLabel: { flex: 1, minWidth: 0, fontSize: 14, fontFamily: Fonts.regular, color: c.textSecondary },
    totalValue: { flexShrink: 0, fontSize: 14, fontFamily: Fonts.medium, color: c.textBody },
    grandTotalRow: { borderTopWidth: 1, borderTopColor: c.border, marginTop: 4, paddingTop: 14, paddingBottom: 14 },
    grandTotalLabel: { fontSize: 16, fontFamily: Fonts.bold, color: c.text },
    grandTotalValue: { flexShrink: 0, fontSize: 20, fontFamily: Fonts.bold, color: c.primary },
  });
