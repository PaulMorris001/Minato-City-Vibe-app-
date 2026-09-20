import mongoose from "mongoose";

import { toGeoPoint } from "./geo.js";
import { assertClean, assertMeaningful } from "./contentFilter.js";
import { parseEndDate } from "./eventLifecycle.js";

/**
 * A PROGRAMME of stops under one umbrella event — brunch at one venue, dinner
 * at another, clubbing at a third. Each stop carries its own title, venue,
 * start time, price and RSVP cap; a guest says yes to any subset.
 *
 * Deliberately a separate module from eventLocations.js. That file is the
 * "same event, several venues" feature (one pass covers every venue); this is
 * "one invitation, different things". Keeping them apart is what stops the two
 * being quietly merged — an event uses one or the other, never both.
 *
 * Mirrored in mobile/components/shared/SubEventsEditor.tsx.
 */
export const MAX_SUB_EVENTS = 9;

/** Event tiers cap at 10; a stop's own tier list follows the same limit. */
const MAX_STOP_TIERS = 10;

const str = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * Validate + normalize one stop's price, which is either a single amount or a
 * tier list, exactly as the event's own pricing works. Returns
 * `{ ticketPrice, ticketTiers }` or `{ error }`.
 */
function normalizeStopPricing(raw, label) {
  const tiersIn = Array.isArray(raw?.ticketTiers) ? raw.ticketTiers : [];

  if (!tiersIn.length) {
    const price = raw?.ticketPrice === undefined || raw?.ticketPrice === "" ? 0 : Number(raw.ticketPrice);
    if (!Number.isFinite(price) || price < 0) {
      return { error: `${label} has an invalid price.` };
    }
    return { ticketPrice: price, ticketTiers: [] };
  }

  if (tiersIn.length > MAX_STOP_TIERS) {
    return { error: `${label} can have up to ${MAX_STOP_TIERS} price bands.` };
  }

  const tiers = [];
  const seen = new Set();
  for (const t of tiersIn) {
    const name = str(t?.name);
    if (!name) return { error: `Every price band on ${label} needs a name.` };
    if (name.length > 40) return { error: `A price band name on ${label} is too long.` };
    const key = name.toLowerCase();
    if (seen.has(key)) return { error: `${label} has two price bands called "${name}".` };
    seen.add(key);

    const price = Number(t?.price);
    if (!Number.isFinite(price) || price <= 0) {
      return { error: `The "${name}" band on ${label} needs a price above zero.` };
    }

    const hasQty = t?.quantity !== undefined && t?.quantity !== null && t?.quantity !== "";
    const quantity = hasQty ? Number(t.quantity) : undefined;
    if (hasQty && (!Number.isInteger(quantity) || quantity <= 0)) {
      return { error: `The "${name}" band on ${label} needs a whole quantity above zero.` };
    }
    tiers.push({ name, price, ...(hasQty ? { quantity } : {}) });
  }

  // All-or-nothing quantities, same rule createEvent applies to event tiers: a
  // half-filled set makes "how many are left" unanswerable.
  const withQty = tiers.filter((t) => t.quantity !== undefined).length;
  if (withQty !== 0 && withQty !== tiers.length) {
    return { error: `Set a quantity for every price band on ${label}, or leave them all blank.` };
  }

  assertClean(tiers.map((t) => ({ field: "Price band name", value: t.name })));

  // Mirrors the cheapest band so display/sort code that reads a single price
  // keeps working — the same thing the event does with its own tiers.
  return { ticketPrice: Math.min(...tiers.map((t) => t.price)), ticketTiers: tiers };
}

/**
 * Validate + normalize a `subEvents` payload.
 *
 * Throws (statusCode 400, via assertClean/assertMeaningful) on profanity or
 * junk text, which the event controllers already turn into a 400.
 *
 * @param {Array} input
 * @param {object} opts
 * @param {Array}  [opts.existing]   the event's current subEvents, so an edit
 *   keeps each stop's `_id` — identity has to survive updateEvent replacing the
 *   whole array, or attendees silently move between stops.
 * @param {Date|string} opts.eventStart  the umbrella's own start
 * @param {Date|string} [opts.eventEnd]  the umbrella's own end, when it has one
 * @returns {{ subEvents: Array } | { error: string }}
 */
export function normalizeSubEvents(input, { existing = [], eventStart, eventEnd } = {}) {
  if (!Array.isArray(input)) return { error: "Sub-events must be a list." };
  if (input.length > MAX_SUB_EVENTS) {
    return { error: `An event can have up to ${MAX_SUB_EVENTS} sub-events.` };
  }

  const knownIds = new Set((existing || []).map((s) => String(s._id)));
  const start = eventStart ? new Date(eventStart) : null;
  const end = eventEnd ? new Date(eventEnd) : null;

  const subEvents = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    const title = str(raw?.title);
    const label = title ? `"${title}"` : `Sub-event ${i + 1}`;

    if (!title) return { error: `Sub-event ${i + 1} needs a name.` };
    if (!str(raw?.location) || !str(raw?.city)) {
      return { error: `${label} needs a location and a city.` };
    }
    if (!raw?.date) return { error: `${label} needs a start date and time.` };

    const date = new Date(raw.date);
    if (isNaN(date.getTime())) return { error: `${label} has an invalid start date.` };

    // A stop outside its own event's dates is always a mistake, and it would
    // also escape the reminder window and the umbrella's own lifecycle.
    if (start && date.getTime() < start.getTime()) {
      return { error: `${label} starts before the event does.` };
    }
    if (end && date.getTime() > end.getTime()) {
      return { error: `${label} starts after the event ends.` };
    }

    const parsedEnd = parseEndDate(raw?.endDate ?? null, date);
    if (parsedEnd.error) return { error: `${label}: ${parsedEnd.error.toLowerCase()}` };

    const pricing = normalizeStopPricing(raw, label);
    if (pricing.error) return { error: pricing.error };

    const capRaw = raw?.maxGuests;
    const maxGuests = capRaw === undefined || capRaw === null || capRaw === "" ? 0 : Number(capRaw);
    if (!Number.isInteger(maxGuests) || maxGuests < 0) {
      return { error: `${label} has an invalid guest limit.` };
    }

    // Title goes through both checks; description only through assertClean,
    // because assertMeaningful rejects "" and the field is optional.
    assertMeaningful([{ field: "Sub-event name", value: title }]);
    assertClean([
      { field: "Sub-event name", value: title },
      { field: "Sub-event description", value: str(raw?.description) },
      { field: "Location", value: str(raw?.location) },
      { field: "Address", value: str(raw?.address) },
    ]);

    // An incoming `_id` is honoured only when it really is one of this event's
    // stops; anything else gets a fresh one rather than letting a client graft
    // an arbitrary id onto a stop.
    const incomingId = raw?._id ?? raw?.id;
    const keepId = incomingId && knownIds.has(String(incomingId));

    subEvents.push({
      _id: keepId ? new mongoose.Types.ObjectId(String(incomingId)) : new mongoose.Types.ObjectId(),
      title,
      description: str(raw?.description),
      location: str(raw?.location),
      address: str(raw?.address),
      city: str(raw?.city),
      state: str(raw?.state),
      country: str(raw?.country),
      geo: toGeoPoint(raw?.latitude, raw?.longitude),
      date,
      endDate: parsedEnd.value,
      ticketPrice: pricing.ticketPrice,
      ticketTiers: pricing.ticketTiers,
      maxGuests,
    });
  }

  // Time order, so every reader — the programme list, the reminder job, the
  // guest list — shows the same sequence without sorting it again.
  subEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { subEvents };
}

/** True when this event is a programme rather than a single occasion. */
export function hasProgramme(event) {
  return (event?.subEvents?.length ?? 0) > 0;
}

/**
 * Every stop a guest can say yes to, the MAIN EVENT FIRST.
 *
 * The main event is stop 0 and its id is `null`, which is also what every pass
 * and ticket issued before this feature carries — so existing records read
 * correctly as "for the main event" with no backfill. Every read and write path
 * should iterate this rather than special-casing the umbrella.
 */
export function allStops(event) {
  return [
    {
      id: null,
      title: event.title,
      description: event.description || "",
      location: event.location,
      address: event.address,
      city: event.city,
      state: event.state,
      country: event.country,
      geo: event.geo,
      date: event.date,
      endDate: event.endDate,
      ticketPrice: event.ticketPrice,
      ticketTiers: event.ticketTiers || [],
      maxGuests: event.maxGuests,
      ticketSalesClosedAt: event.ticketSalesClosedAt,
    },
    ...(event.subEvents || []).map((s) => ({
      id: String(s._id),
      title: s.title,
      description: s.description || "",
      location: s.location,
      address: s.address,
      city: s.city,
      state: s.state,
      country: s.country,
      geo: s.geo,
      date: s.date,
      endDate: s.endDate,
      ticketPrice: s.ticketPrice,
      ticketTiers: s.ticketTiers || [],
      maxGuests: s.maxGuests,
      ticketSalesClosedAt: s.ticketSalesClosedAt,
    })),
  ];
}

/**
 * One stop by id. A null/absent/"main" id resolves to the main event, matching
 * how `Attendance.subEvent` and `Ticket.subEvent` store it. Returns null when
 * the id names no stop of this event.
 */
export function findStop(event, subEventId) {
  const stops = allStops(event);
  if (subEventId === undefined || subEventId === null || subEventId === "" || subEventId === "main") {
    return stops[0];
  }
  return stops.find((s) => s.id === String(subEventId)) || null;
}

/**
 * One line naming where a stop is — the per-stop twin of venueLabel(). A pass
 * or reminder for a single stop must use this, never venueSummary(), which
 * lists every venue of the event and would send the holder to the wrong door.
 */
export function stopLabel(stop) {
  if (!stop) return "";
  return [stop.address || stop.location, stop.city].filter(Boolean).join(", ");
}
