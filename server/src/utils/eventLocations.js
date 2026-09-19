import { toGeoPoint } from "./geo.js";
import { assertClean } from "./contentFilter.js";

/**
 * Venues an event can run at in parallel, counting its top-level location as
 * venue #1. Mirrored in mobile/components/shared/AdditionalLocationsEditor.tsx.
 */
export const MAX_EVENT_LOCATIONS = 10;

const str = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * Validate + normalize an `additionalLocations` payload. Clients post each venue
 * the way they post venue #1 — flat fields plus plain latitude/longitude — and
 * it's stored with a GeoJSON `geo`. Returns `{ locations }` or `{ error }`.
 *
 * Throws (statusCode 400, via assertClean) on profanity, which the event
 * controllers already turn into a 400.
 */
export function normalizeAdditionalLocations(input) {
  if (!Array.isArray(input)) return { error: "Additional locations must be a list." };
  if (input.length > MAX_EVENT_LOCATIONS - 1) {
    return { error: `An event can have up to ${MAX_EVENT_LOCATIONS} locations.` };
  }

  const locations = input.map((l) => ({
    location: str(l?.location),
    address: str(l?.address),
    city: str(l?.city),
    state: str(l?.state),
    country: str(l?.country),
    geo: toGeoPoint(l?.latitude, l?.longitude),
  }));
  if (locations.some((l) => !l.city || !l.location)) {
    return { error: "Every location needs a city." };
  }

  assertClean(
    locations.flatMap((l) => [
      { field: "Location", value: l.location },
      { field: "Address", value: l.address },
    ])
  );
  return { locations };
}

/**
 * Every venue of an event, venue #1 first. Tolerates `.lean()` docs from before
 * `additionalLocations` existed, which have no array at all.
 */
export function allVenues(event) {
  return [
    {
      location: event.location,
      address: event.address,
      city: event.city,
      state: event.state,
      country: event.country,
      geo: event.geo,
    },
    ...(event.additionalLocations || []),
  ];
}

/**
 * One line naming where an event is, for emails and the ticket PDF. A
 * single-venue event reads exactly as it always has (address, else location).
 * With several venues each one carries its city too — they are usually in
 * different cities, and "5 High St · 12 Allen Ave" alone doesn't say which.
 */
export function venueSummary(event) {
  const venues = allVenues(event);
  if (venues.length === 1) return event.address || event.location || "";
  return venues
    .map((v) => [v.address, v.city || v.location].filter(Boolean).join(", "))
    .join(" · ");
}

/**
 * One line naming a SINGLE venue — what an attendee who picked it should be
 * told. Carries the city as well as the street, because the venues of a
 * multi-venue event are usually told apart by city, not by address.
 */
export function venueLabel(venue) {
  if (!venue) return "";
  return [venue.address || venue.location, venue.city].filter(Boolean).join(", ");
}

/**
 * Validate an attendee's venue pick against the event's venue list.
 *
 * The pick is an INDEX into allVenues() — 0 is the event's own location, 1..n
 * its additionalLocations. There is deliberately no id to reference instead:
 * those subdocs are declared `_id: false`, and updateEvent replaces the whole
 * array whenever it is sent, so an id would be no more stable than a position.
 * That is also why the chosen venue's name/city are SNAPSHOT onto the pass and
 * the ticket (same reasoning as tierName) rather than resolved at read time.
 *
 * A missing pick is accepted, not rejected: single-venue events have nothing to
 * choose, and app builds that predate the picker send nothing. Those records
 * store no venue and read back as "Not specified" on the guest list — honest,
 * where silently defaulting them to venue #1 would invent attendance data the
 * organizer then staffs against.
 *
 * @returns {{ choice: object|null } | { error: string }} `choice` is the field
 *   bag to spread onto an Attendance / Ticket / TicketOrder item, or null.
 */
export function resolveVenueChoice(event, locationIndex) {
  const venues = allVenues(event);
  if (venues.length < 2) return { choice: null };
  if (locationIndex === undefined || locationIndex === null || locationIndex === "") {
    return { choice: null };
  }
  const index = Number(locationIndex);
  if (!Number.isInteger(index) || index < 0 || index >= venues.length) {
    return { error: "Pick one of the event's locations." };
  }
  const venue = venues[index];
  return {
    choice: {
      locationIndex: index,
      locationName: venue.location || "",
      locationCity: venue.city || "",
    },
  };
}

/**
 * The venue list a client renders its picker from, and the shape the guest-list
 * breakdown is keyed by. Empty for a single-venue event — there is nothing to
 * ask. Mirrored in mobile/components/shared/VenuePicker.tsx.
 */
export function venueOptions(event) {
  const venues = allVenues(event);
  if (venues.length < 2) return [];
  return venues.map((v, index) => ({
    index,
    location: v.location || "",
    address: v.address || "",
    city: v.city || "",
    state: v.state || "",
    country: v.country || "",
  }));
}
