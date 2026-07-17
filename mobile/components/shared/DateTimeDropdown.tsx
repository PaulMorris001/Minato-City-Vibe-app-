import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import PickerModal, { PickerItemText } from "./PickerModal";

import { useTheme, useThemedStyles } from "@/contexts/ThemeContext";
import type { ThemeColors } from "@/constants/theme";
interface DateTimeDropdownProps {
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  /** Time applied when a date is picked before any time was chosen. */
  defaultHour?: number;
  /** Hide the time dropdown for date-only selection. */
  showTime?: boolean;
}

interface DropdownItem {
  _id: string;
  label: string;
}

interface DraftDate {
  day: number | null;
  month: number | null; // 0-11
  year: number | null;
}

function startOfDay(d: Date) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

function timeLabel(hour: number, minute: number) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const MONTH_LONG = Array.from({ length: 12 }, (_, m) =>
  new Date(2000, m, 1).toLocaleDateString("en-US", { month: "long" })
);
const MONTH_SHORT = Array.from({ length: 12 }, (_, m) =>
  new Date(2000, m, 1).toLocaleDateString("en-US", { month: "short" })
);

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function draftFromValue(value: Date | null): DraftDate {
  return value
    ? { day: value.getDate(), month: value.getMonth(), year: value.getFullYear() }
    : { day: null, month: null, year: null };
}

/**
 * Dropdown-style date & time selector: separate day / month / year dropdowns
 * plus a time dropdown, each opening a list (same pattern as LocationPicker)
 * instead of the native wheel pickers.
 */
export default function DateTimeDropdown({
  value,
  onChange,
  minimumDate,
  defaultHour = 20,
  showTime = true,
}: DateTimeDropdownProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [dayOpen, setDayOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  const min = minimumDate ?? new Date();
  const today = startOfDay(min);
  const minYear = min.getFullYear();
  const minMonth = min.getMonth();
  const minDay = min.getDate();

  // Partial selection lives here; onChange only fires once all three parts
  // are chosen, so parents never see a half-picked date.
  const [draft, setDraft] = useState<DraftDate>(() => draftFromValue(value));

  // Parents can set/reset the value externally (e.g. quick-date buttons).
  useEffect(() => {
    setDraft(draftFromValue(value));
  }, [value?.getTime()]);

  // Lists assume the minimum when a part is unpicked, so they never offer
  // anything the min-date constraint would reject.
  const effYear = draft.year ?? minYear;
  const effMonth = draft.month ?? (effYear === minYear ? minMonth : 0);

  const yearItems: DropdownItem[] = useMemo(
    () =>
      Array.from({ length: 3 }, (_, i) => {
        const y = minYear + i;
        return { _id: String(y), label: String(y) };
      }),
    [minYear]
  );

  const monthItems: DropdownItem[] = useMemo(() => {
    const start = effYear === minYear ? minMonth : 0;
    const items: DropdownItem[] = [];
    for (let m = start; m < 12; m++) {
      items.push({ _id: String(m), label: MONTH_LONG[m] });
    }
    return items;
  }, [effYear, minYear, minMonth]);

  const dayItems: DropdownItem[] = useMemo(() => {
    const start = effYear === minYear && effMonth === minMonth ? minDay : 1;
    const end = daysInMonth(effYear, effMonth);
    const items: DropdownItem[] = [];
    for (let d = start; d <= end; d++) {
      items.push({ _id: String(d), label: String(d) });
    }
    return items;
  }, [effYear, effMonth, minYear, minMonth, minDay]);

  const timeItems: DropdownItem[] = useMemo(() => {
    const items: DropdownItem[] = [];
    const isMinDay = value && startOfDay(value).getTime() === today.getTime();
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        // On the minimum day, hide slots that are already in the past.
        if (isMinDay) {
          const slot = new Date(value);
          slot.setHours(h, m, 0, 0);
          if (slot <= min) continue;
        }
        items.push({ _id: `${h}:${m}`, label: timeLabel(h, m) });
      }
    }
    return items;
  }, [value?.getTime(), today.getTime(), min.getTime()]);

  const selectPart = (part: keyof DraftDate, num: number) => {
    const next: DraftDate = { ...draft, [part]: num };

    // Clamp the draft into the valid range for the chosen month/year. A
    // past year can be in the draft when editing something dated in the
    // past — never let a pick commit a date before the minimum.
    if (next.year != null && next.year < minYear) {
      next.year = minYear;
    }
    if (next.year === minYear && next.month != null && next.month < minMonth) {
      next.month = minMonth;
    }
    if (next.day != null && next.month != null) {
      next.day = Math.min(next.day, daysInMonth(next.year ?? minYear, next.month));
    }
    if (
      next.year === minYear &&
      next.month === minMonth &&
      next.day != null &&
      next.day < minDay
    ) {
      next.day = minDay;
    }

    setDraft(next);

    if (next.day != null && next.month != null && next.year != null) {
      const picked = new Date(next.year, next.month, next.day);
      if (value) {
        picked.setHours(value.getHours(), value.getMinutes(), 0, 0);
      } else {
        picked.setHours(defaultHour, 0, 0, 0);
      }
      // If the merged result lands in the past (e.g. today + earlier time),
      // bump to the next upcoming half-hour.
      if (picked <= min) {
        const nextSlot = new Date(min);
        nextSlot.setMinutes(nextSlot.getMinutes() < 30 ? 30 : 60, 0, 0);
        picked.setHours(nextSlot.getHours(), nextSlot.getMinutes(), 0, 0);
      }
      onChange(picked);
    }
  };

  const selectTime = (item: DropdownItem) => {
    const [h, m] = item._id.split(":").map(Number);
    const picked = value ? new Date(value) : new Date(today);
    picked.setHours(h, m, 0, 0);
    setTimeOpen(false);
    onChange(picked);
  };

  const selectedTimeId = value ? `${value.getHours()}:${value.getMinutes()}` : undefined;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.dropdown, { flex: 0.8 }]}
          onPress={() => setDayOpen(true)}
          activeOpacity={0.8}
        >
          <Text style={[styles.dropdownText, draft.day == null && styles.placeholder]} numberOfLines={1}>
            {draft.day != null ? String(draft.day) : "Day"}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dropdown, { flex: 1.2 }]}
          onPress={() => setMonthOpen(true)}
          activeOpacity={0.8}
        >
          <Text style={[styles.dropdownText, draft.month == null && styles.placeholder]} numberOfLines={1}>
            {draft.month != null ? MONTH_SHORT[draft.month] : "Month"}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dropdown, { flex: 1 }]}
          onPress={() => setYearOpen(true)}
          activeOpacity={0.8}
        >
          <Text style={[styles.dropdownText, draft.year == null && styles.placeholder]} numberOfLines={1}>
            {draft.year != null ? String(draft.year) : "Year"}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {showTime && (
        <TouchableOpacity
          style={styles.dropdown}
          onPress={() => setTimeOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="time-outline" size={18} color={colors.primary} />
          <Text style={[styles.dropdownText, !value && styles.placeholder]} numberOfLines={1}>
            {value ? timeLabel(value.getHours(), value.getMinutes()) : "Time"}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      <PickerModal
        visible={dayOpen}
        onClose={() => setDayOpen(false)}
        title="Select day"
        data={dayItems}
        selectedId={draft.day != null ? String(draft.day) : undefined}
        onSelect={(item) => {
          setDayOpen(false);
          selectPart("day", Number(item._id));
        }}
        renderItem={(item, isSelected) => (
          <PickerItemText text={item.label} isSelected={isSelected} />
        )}
      />
      <PickerModal
        visible={monthOpen}
        onClose={() => setMonthOpen(false)}
        title="Select month"
        data={monthItems}
        selectedId={draft.month != null ? String(draft.month) : undefined}
        onSelect={(item) => {
          setMonthOpen(false);
          selectPart("month", Number(item._id));
        }}
        renderItem={(item, isSelected) => (
          <PickerItemText text={item.label} isSelected={isSelected} />
        )}
      />
      <PickerModal
        visible={yearOpen}
        onClose={() => setYearOpen(false)}
        title="Select year"
        data={yearItems}
        selectedId={draft.year != null ? String(draft.year) : undefined}
        onSelect={(item) => {
          setYearOpen(false);
          selectPart("year", Number(item._id));
        }}
        renderItem={(item, isSelected) => (
          <PickerItemText text={item.label} isSelected={isSelected} />
        )}
      />
      <PickerModal
        visible={timeOpen}
        onClose={() => setTimeOpen(false)}
        title="Select time"
        data={timeItems}
        selectedId={selectedTimeId}
        onSelect={selectTime}
        renderItem={(item, isSelected) => (
          <PickerItemText text={item.label} isSelected={isSelected} />
        )}
      />
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: c.glassStroke,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
    backgroundColor: c.glassFillSubtle,
  },
  dropdownText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: c.textBright,
  },
  placeholder: {
    color: c.textFaint,
  },
});
