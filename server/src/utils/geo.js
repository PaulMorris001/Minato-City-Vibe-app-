/**
 * Coordinates an event stores for its map pin.
 *
 * The client geocodes the typed address on the device (expo-location) and may
 * let the host drag the pin, then posts plain `latitude`/`longitude`. Mongo
 * wants a GeoJSON Point with `[lng, lat]` — reversed from how every UI writes
 * it — so the swap happens here, once, rather than at each controller.
 */
export function toGeoPoint(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return undefined;
  // Exactly 0,0 is Null Island — the signature of a geocode that found nothing,
  // not a venue in the Gulf of Guinea. Storing it would drop a pin in the ocean.
  if (lat === 0 && lng === 0) return undefined;
  return { type: "Point", coordinates: [lng, lat] };
}
