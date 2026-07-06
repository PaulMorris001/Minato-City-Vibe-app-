import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Fonts } from "@/constants/fonts";
import PickerModal, { PickerItemText } from "./PickerModal";

interface DateTimeDropdownProps {
  value: Date | null;
  onChange: (date: Date) => void;
  minimumDate?: Date;
  daysAhead?: number;
  /** Time applied when a date is picked before any time was chosen. */
  defaultHour?: number;
  /** Hide the time dropdown for date-only selection. */
  showTime?: boolean;
}

interface DropdownItem {
  _id: string;
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

function dateLabel(d: Date, today: Date) {
  const diffDays = Math.round((startOfDay(d).getTime() - today.getTime()) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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

/**
 * Dropdown-style date & time selector: two buttons that each open a list
 * (same pattern as LocationPicker) instead of the native wheel pickers.
 */
export default function DateTimeDropdown({
  value,
  onChange,
  minimumDate,
  daysAhead = 90,
  defaultHour = 20,
  showTime = true,
}: DateTimeDropdownProps) {
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  const min = minimumDate ?? new Date();
  const today = startOfDay(min);

  const dateItems: DropdownItem[] = useMemo(
    () =>
      Array.from({ length: daysAhead }, (_, i) => {
        const d = new Date(today.getTime() + i * DAY_MS);
        return { _id: d.toISOString(), label: dateLabel(d, today) };
      }),
    [today.getTime(), daysAhead]
  );

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

  const selectDate = (item: DropdownItem) => {
    const picked = new Date(item._id);
    if (value) {
      picked.setHours(value.getHours(), value.getMinutes(), 0, 0);
    } else {
      picked.setHours(defaultHour, 0, 0, 0);
    }
    // If the merged result lands in the past (e.g. today + earlier time),
    // bump to the next upcoming half-hour.
    if (picked <= min) {
      const next = new Date(min);
      next.setMinutes(next.getMinutes() < 30 ? 30 : 60, 0, 0);
      picked.setHours(next.getHours(), next.getMinutes(), 0, 0);
    }
    setDateOpen(false);
    onChange(picked);
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
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.dropdown, { flex: 1.4 }]}
        onPress={() => setDateOpen(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="calendar-outline" size={18} color="#a855f7" />
        <Text style={[styles.dropdownText, !value && styles.placeholder]} numberOfLines={1}>
          {value ? dateLabel(value, today) : "Date"}
        </Text>
        <Ionicons name="chevron-down" size={16} color="#6b7280" />
      </TouchableOpacity>

      {showTime && (
        <TouchableOpacity
          style={[styles.dropdown, { flex: 1 }]}
          onPress={() => setTimeOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="time-outline" size={18} color="#a855f7" />
          <Text style={[styles.dropdownText, !value && styles.placeholder]} numberOfLines={1}>
            {value ? timeLabel(value.getHours(), value.getMinutes()) : "Time"}
          </Text>
          <Ionicons name="chevron-down" size={16} color="#6b7280" />
        </TouchableOpacity>
      )}

      <PickerModal
        visible={dateOpen}
        onClose={() => setDateOpen(false)}
        title="Select date"
        data={dateItems}
        selectedId={value ? startOfDay(value).toISOString() : undefined}
        onSelect={selectDate}
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

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
  },
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 13,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  dropdownText: {
    flex: 1,
    fontSize: 15,
    fontFamily: Fonts.regular,
    color: "#F4EEFF",
  },
  placeholder: {
    color: "rgba(244,238,255,0.35)",
  },
});
