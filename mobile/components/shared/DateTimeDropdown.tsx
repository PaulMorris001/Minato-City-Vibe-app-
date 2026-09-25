import React, { useState } from "react";
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import { Fonts } from "@/constants/fonts";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";

interface DateTimeDropdownProps {
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Time applied when a date is picked before any time was chosen. */
  defaultHour?: number;
  /** Hide the time field for date-only selection. */
  showTime?: boolean;
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Clamp a full timestamp into [min, max], each optional. */
function clamp(d: Date, min?: Date, max?: Date): Date {
  let t = d.getTime();
  if (min && t < min.getTime()) t = min.getTime();
  if (max && t > max.getTime()) t = max.getTime();
  return new Date(t);
}

function seedValue(minimumDate: Date | undefined, maximumDate: Date | undefined, defaultHour: number) {
  const seed = minimumDate ? new Date(minimumDate) : new Date();
  seed.setHours(defaultHour, 0, 0, 0);
  return clamp(seed, minimumDate, maximumDate);
}

/**
 * Date & time entry using each platform's OWN system picker — the wheel/
 * calendar UIKit gives iOS, the Material dialogs Android gives Android —
 * instead of a bespoke set of day/month/year/time dropdowns. Same external
 * contract as before (`value`/`onChange`/`minimumDate`/`defaultHour`), plus
 * `maximumDate` for gating a sub-event's time to its umbrella event's window.
 *
 * iOS genuinely enforces a combined min/max on one `mode="datetime"` wheel —
 * you cannot scroll a value out of range. Android has no equivalent combined
 * dialog, and critically its native TIME dialog has no min/max concept of its
 * own (a platform limitation, not a gap in this component) — so on Android the
 * date and time are picked in two separate native dialogs, and the merged
 * result is clamped afterward, with a short explanation if that clamp actually
 * had to move the pick.
 */
export default function DateTimeDropdown({
  value,
  onChange,
  minimumDate,
  maximumDate,
  defaultHour = 20,
  showTime = true,
}: DateTimeDropdownProps) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  // iOS only: which combined sheet is open, if any.
  const [iosSheetOpen, setIosSheetOpen] = useState(false);
  // The sheet's own draft, committed onChange only when the user taps Done —
  // matches iOS's own date pickers elsewhere in the app (e.g. the OS share
  // sheet) rather than firing on every wheel tick.
  const [iosDraft, setIosDraft] = useState<Date | null>(null);

  const current = value ?? seedValue(minimumDate, maximumDate, defaultHour);

  const boundaryNotice = () => {
    if (minimumDate && maximumDate) {
      return `This has to fall between ${formatDate(minimumDate)} ${formatTime(minimumDate)} and ${formatDate(maximumDate)} ${formatTime(maximumDate)}.`;
    }
    if (minimumDate) return `This can't be before ${formatDate(minimumDate)} ${formatTime(minimumDate)}.`;
    if (maximumDate) return `This can't be after ${formatDate(maximumDate)} ${formatTime(maximumDate)}.`;
    return "";
  };

  const commit = (next: Date, { clamped }: { clamped: boolean }) => {
    onChange(next);
    if (clamped) {
      // Android's time dialog can't be told the boundary up front (see the
      // component doc comment) — this is the only point a guest learns why
      // their pick moved instead of it silently landing somewhere they didn't
      // choose.
      Alert.alert("Time adjusted", boundaryNotice());
    }
  };

  // ── Android: two independent native dialogs ──────────────────────────────
  const openAndroidDate = () => {
    DateTimePickerAndroid.open({
      value: current,
      mode: "date",
      minimumDate,
      maximumDate,
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== "set" || !picked) return;
        const next = new Date(current);
        next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
        const bounded = clamp(next, minimumDate, maximumDate);
        commit(bounded, { clamped: bounded.getTime() !== next.getTime() });
      },
    });
  };

  const openAndroidTime = () => {
    DateTimePickerAndroid.open({
      value: current,
      mode: "time",
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== "set" || !picked) return;
        const next = new Date(current);
        next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
        const bounded = clamp(next, minimumDate, maximumDate);
        commit(bounded, { clamped: bounded.getTime() !== next.getTime() });
      },
    });
  };

  // ── iOS: one combined sheet ───────────────────────────────────────────────
  const openIosSheet = () => {
    setIosDraft(current);
    setIosSheetOpen(true);
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.field, { flex: showTime ? 1.3 : 1 }]}
        onPress={Platform.OS === "android" ? openAndroidDate : openIosSheet}
        activeOpacity={0.8}
      >
        <Ionicons name="calendar-outline" size={17} color={colors.primary} />
        <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>
          {value ? formatDate(value) : "Select date"}
        </Text>
      </TouchableOpacity>

      {showTime && (
        <TouchableOpacity
          style={[styles.field, { flex: 1 }]}
          onPress={Platform.OS === "android" ? openAndroidTime : openIosSheet}
          activeOpacity={0.8}
        >
          <Ionicons name="time-outline" size={17} color={colors.primary} />
          <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>
            {value ? formatTime(value) : "Select time"}
          </Text>
        </TouchableOpacity>
      )}

      {Platform.OS === "ios" && (
        <Modal
          visible={iosSheetOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setIosSheetOpen(false)}
        >
          <View style={styles.iosSheetWrap}>
            <Pressable style={styles.iosSheetBackdrop} onPress={() => setIosSheetOpen(false)} />
            <View style={styles.iosSheetCard}>
              <View style={styles.iosSheetHeader}>
                <TouchableOpacity onPress={() => setIosSheetOpen(false)} hitSlop={10}>
                  <Text style={styles.iosSheetCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (iosDraft) commit(clamp(iosDraft, minimumDate, maximumDate), { clamped: false });
                    setIosSheetOpen(false);
                  }}
                  hitSlop={10}
                >
                  <Text style={styles.iosSheetDone}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={iosDraft ?? current}
                mode={showTime ? "datetime" : "date"}
                display="spinner"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                // The wheel follows the OS appearance unless told otherwise, so
                // an app set to Light on a phone in Dark renders white text on
                // this light sheet — unreadable. Android's dialogs take their
                // theme from the native app theme and have no JS equivalent.
                themeVariant={isDark ? "dark" : "light"}
                onChange={(_event, picked) => picked && setIosDraft(picked)}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      gap: 10,
    },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderWidth: 1,
      borderColor: c.glassStrokeStrong,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 13,
      backgroundColor: c.card,
    },
    fieldText: {
      flex: 1,
      fontSize: 15,
      fontFamily: Fonts.regular,
      color: c.textBright,
    },
    placeholder: {
      color: c.textFaint,
    },
    iosSheetWrap: {
      flex: 1,
      justifyContent: "flex-end",
    },
    iosSheetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.modalOverlay,
    },
    iosSheetCard: {
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 20,
    },
    iosSheetHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.glassStroke,
    },
    iosSheetCancel: {
      fontFamily: Fonts.regular,
      fontSize: 15,
      color: c.textDim,
    },
    iosSheetDone: {
      fontFamily: Fonts.semiBold,
      fontSize: 15,
      color: c.primary,
    },
  });
