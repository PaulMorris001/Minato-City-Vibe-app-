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
