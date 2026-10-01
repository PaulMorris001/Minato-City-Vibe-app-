import React, { useEffect, useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { AU_FONT } from "@/components/auth/tokens";
import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
import type { LocationSelection } from "@/libs/interfaces";
import type { EventCategoryOption } from "@/hooks/useEventCategories";
import CategoryChips from "./CategoryChips";
import LocationPicker from "./LocationPicker";
import PrimaryButton from "./PrimaryButton";

export type DateWindow = "any" | "today" | "tomorrow" | "weekend" | "week" | "month";
export type PriceFilter = "any" | "free" | "paid";
export type SortKey = "soonest" | "furthest" | "price_asc" | "price_desc";

/** Everything the Discover (public events) feed can be narrowed or ordered by. */
export interface EventFilters {
  location: Partial<LocationSelection> | null;
  online: boolean;
  category: string | null;
  date: DateWindow;
  price: PriceFilter;
  sort: SortKey;
}

export const DEFAULT_EVENT_FILTERS: EventFilters = {
  location: null,
  online: false,
  category: null,
  date: "any",
  price: "any",
  sort: "soonest",
};

export const DATE_LABEL: Record<DateWindow, string> = {
  any: "Any time",
  today: "Today",
  tomorrow: "Tomorrow",
  weekend: "This weekend",
  week: "Next 7 days",
  month: "Next 30 days",
};

export const PRICE_LABEL: Record<PriceFilter, string> = { any: "Any price", free: "Free", paid: "Paid" };

export const SORT_LABEL: Record<SortKey, string> = {
  soonest: "Soonest first",
  furthest: "Furthest first",
  price_asc: "Price: low → high",
  price_desc: "Price: high → low",
};

/** How many filters differ from the defaults — drives the header badge. */
export function activeFilterCount(f: EventFilters): number {
  return [
    f.online || !!(f.location?.city || f.location?.state || f.location?.country),
    f.category !== null,
    f.date !== "any",
    f.price !== "any",
    f.sort !== "soonest",
  ].filter(Boolean).length;
}

/** Whether an event starting at `iso` falls inside a date window, in local time. */
export function inDateWindow(iso: string, window: DateWindow, now = new Date()): boolean {
  if (window === "any") return true;
  const d = new Date(iso);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const dayStart = (offset: number) => {
    const x = new Date(startToday);
    x.setDate(x.getDate() + offset);
    return x;
  };
  switch (window) {
    case "today":
      return d < dayStart(1);
    case "tomorrow":
      return d >= dayStart(1) && d < dayStart(2);
    case "weekend": {
      // Friday 00:00 → Monday 00:00 of this week; on a weekend day, the one under way.
      const dow = startToday.getDay(); // 0 Sun … 6 Sat
      const toFriday = dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow;
      return d >= dayStart(toFriday) && d < dayStart(toFriday + 3);
    }
    case "week":
      return d < dayStart(7);
    case "month":
      return d < dayStart(30);
  }
}

interface EventFiltersPageProps {
  visible: boolean;
  /** The filters currently applied — the page edits a copy until "Apply Filter". */
  value: EventFilters;
  categories: EventCategoryOption[];
  /** May return a promise — the button shows a spinner until it settles. */
  onApply: (next: EventFilters) => void | Promise<void>;
  onClose: () => void;
}

/**
 * The Discover feed's full-screen filter page (location, category, date, price,
 * sort). Edits a draft; nothing touches the feed until "Apply Filter",
 * and closing without applying throws the draft away.
 */
export default function EventFiltersPage({ visible, value, categories, onApply, onClose }: EventFiltersPageProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  // Read from the app's root provider and applied by hand: a SafeAreaView
  // inside a full-screen Modal measures zero insets on iOS, which slid the
  // header (Close/Reset) up under the status bar and notch.
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<EventFilters>(value);
  const [applying, setApplying] = useState(false);

  const apply = async () => {
    setApplying(true);
    try {
      await onApply(draft);
    } finally {
      setApplying(false);
    }
  };
  // LocationPicker keeps its own selection state — remounting it is how a
  // reset reaches it.
  const [pickerKey, setPickerKey] = useState(0);

  useEffect(() => {
    if (visible) {
      setDraft(value);
      setPickerKey((k) => k + 1);
    }
    // Only when the page opens — `value` changing underneath an open page
    // must not wipe what the user is editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const set = <K extends keyof EventFilters>(key: K, v: EventFilters[K]) =>
    setDraft((d) => ({ ...d, [key]: v }));

  const hasPlace = !!(draft.location?.city || draft.location?.state || draft.location?.country);

  const optionRow = <T extends string>(
    labels: Record<T, string>,
    current: T,
    onPick: (v: T) => void
  ) => (
    <View style={styles.optionWrap}>
      {(Object.keys(labels) as T[]).map((k) => {
        const active = k === current;
        return (
          <TouchableOpacity
            key={k}
            style={[styles.option, active ? styles.optionActive : styles.optionIdle]}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync().catch(() => {});
              onPick(k);
            }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.optionText, active && styles.optionTextActive]}>{labels[k]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close filters">
            <Ionicons name="close" size={26} color={colors.textBright} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Filters</Text>
          <TouchableOpacity
            onPress={() => {
              setDraft(DEFAULT_EVENT_FILTERS);
              setPickerKey((k) => k + 1);
            }}
            hitSlop={10}
          >
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Location */}
          <Text style={styles.sectionTitle}>Location</Text>
          <View style={styles.optionWrap}>
            <TouchableOpacity
              style={[styles.option, !hasPlace && !draft.online ? styles.optionActive : styles.optionIdle]}
              onPress={() => {
                setDraft((d) => ({ ...d, location: null, online: false }));
                setPickerKey((k) => k + 1);
              }}
            >
              <Text style={[styles.optionText, !hasPlace && !draft.online && styles.optionTextActive]}>
                Anywhere
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.option, draft.online ? styles.optionActive : styles.optionIdle]}
              onPress={() => {
                setDraft((d) => ({ ...d, location: null, online: true }));
                setPickerKey((k) => k + 1);
              }}
            >
              <Text style={[styles.optionText, draft.online && styles.optionTextActive]}>📹 Online only</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.pickerBox}>
            <LocationPicker
              key={pickerKey}
              label="Or pick a place"
              value={draft.location ?? undefined}
              onChange={(sel) => setDraft((d) => ({ ...d, location: sel, online: false }))}
            />
          </View>

          {/* Category */}
          {categories.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Category</Text>
              <CategoryChips
                wrap
                options={categories.map((c) => ({ value: c.name, label: c.name, emoji: c.emoji }))}
                value={draft.category}
                onChange={(v) => set("category", v)}
                allLabel="All categories"
              />
            </>
          )}

          {/* Date */}
          <Text style={styles.sectionTitle}>Date</Text>
          {optionRow(DATE_LABEL, draft.date, (v) => set("date", v))}

          {/* Price */}
          <Text style={styles.sectionTitle}>Price</Text>
          {optionRow(PRICE_LABEL, draft.price, (v) => set("price", v))}

          {/* Sort */}
          <Text style={styles.sectionTitle}>Sort by</Text>
          {optionRow(SORT_LABEL, draft.sort, (v) => set("sort", v))}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <PrimaryButton onPress={apply} loading={applying} disabled={applying} fullWidth>
            Apply Filter
          </PrimaryButton>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.backgroundDeep },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: c.glassFill,
    },
    headerTitle: { fontFamily: AU_FONT.bold, fontSize: 18, color: c.textBright },
    resetText: { fontFamily: AU_FONT.bodySemi, fontSize: 14, color: c.primaryLight },
    body: { paddingHorizontal: 20, paddingBottom: 32 },
    sectionTitle: {
      fontFamily: AU_FONT.bodySemi,
      fontSize: 11,
      letterSpacing: 0.8,
      color: c.textFaint,
      textTransform: "uppercase",
      marginTop: 24,
      marginBottom: 12,
    },
    optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    option: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999 },
    optionActive: { backgroundColor: c.textBright },
    optionIdle: { backgroundColor: "transparent", borderWidth: 1, borderColor: c.glassStrokeStrong },
    optionText: { fontFamily: AU_FONT.body, fontSize: 13, color: c.textDim },
    optionTextActive: { fontFamily: AU_FONT.bodyBold, color: c.backgroundDeep },
    pickerBox: { marginTop: 12 },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: c.glassFill,
      backgroundColor: c.backgroundDeep,
    },
  });
