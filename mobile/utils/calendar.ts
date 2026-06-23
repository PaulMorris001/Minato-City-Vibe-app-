import { Platform } from "react-native";
import { createEventShareLink } from "./shareLinks";

const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000; // assume a 3h event

export interface CalendarEventInput {
  _id: string;
  title: string;
  date: string;
  address?: string;
  location?: string;
  shareToken?: string;
}

export type AddToCalendarResult =
  | { ok: true; url: string }
  | { ok: false; error: "permission" | "no_calendar" | "unavailable" | "failed" };

/**
 * expo-calendar is a NATIVE module. It only exists in binaries built after it
 * was added — it can't arrive via an OTA JS update. We therefore load it
 * lazily and treat "module missing" as a graceful "needs app update" so older
 * binaries that receive this code over OTA don't crash.
 */
function loadCalendar(): typeof import("expo-calendar") | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-calendar");
  } catch {
    return null;
  }
}

async function getWritableCalendarId(
  Calendar: typeof import("expo-calendar")
): Promise<string | null> {
  if (Platform.OS === "ios") {
    const def = await Calendar.getDefaultCalendarAsync().catch(() => null);
    if (def?.allowsModifications) return def.id;
  }
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = calendars.filter((c) => c.allowsModifications);
  if (writable.length === 0) return null;
  const primary = writable.find((c: any) => c.isPrimary) || writable[0];
  return primary.id;
}

/**
 * Add an event to the device calendar with a deep link back to the app. The
 * link is a universal link (https://api.ourcityvibe.com/event/<id>) which,
 * on a device with the app installed, opens straight to the event — so on the
 * day, tapping the link in the calendar entry lands the user on the event.
 */
export async function addEventToCalendar(
  event: CalendarEventInput
): Promise<AddToCalendarResult> {
  const Calendar = loadCalendar();
  if (!Calendar) return { ok: false, error: "unavailable" };

  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== "granted") return { ok: false, error: "permission" };

    const calendarId = await getWritableCalendarId(Calendar);
    if (!calendarId) return { ok: false, error: "no_calendar" };

    const start = new Date(event.date);
    const end = new Date(start.getTime() + DEFAULT_DURATION_MS);
    const url = createEventShareLink(event.shareToken || event._id);
    const locationStr =
      [event.address, event.location].filter(Boolean).join(" · ") || event.location || "";

    await Calendar.createEventAsync(calendarId, {
      title: event.title,
      startDate: start,
      endDate: end,
      location: locationStr,
      notes: `Open in CityVibe: ${url}`,
      url, // iOS renders this as a tappable link on the calendar event
      alarms: [{ relativeOffset: -60 }], // remind 1 hour before
    });

    return { ok: true, url };
  } catch (e: any) {
    // A missing native module surfaces here on some SDKs — treat as unavailable.
    const msg = String(e?.message || e);
    if (/native module|ExpoCalendar|not.*available/i.test(msg)) {
      return { ok: false, error: "unavailable" };
    }
    console.error("addEventToCalendar error:", e);
    return { ok: false, error: "failed" };
  }
}
